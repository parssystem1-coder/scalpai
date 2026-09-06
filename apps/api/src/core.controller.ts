import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  PaginationQuery,
  PatientCreate,
  PatientNotesUpdate,
  SessionCreate,
  ConsentCreate,
  ConsentRevoke,
  parseSignatureDataUrl,
} from "@scalpai/shared";
import type { PatientCreateDto, ConsentCreateDto, PatientNotesUpdateDto, ConsentRevokeDto } from "@scalpai/shared";
import { errors } from "@scalpai/shared";
import {
  createPatient,
  createSession,
  createConsent,
  getConsentSignatureRef,
  listConsentsForPatient,
  getPatientById,
  listPatients,
  listSessions,
  readPatientNotes,
  revokeConsent,
  services,
  setPatientNotes,
  softDeletePatient,
} from "@scalpai/db";
import { Roles } from "./common/roles.guard.js";
import { Public } from "./auth/jwt-access.guard.js";
import { RequireFeature } from "./common/feature.guard.js";
import { Quota } from "./common/quota.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";
import { StorageService } from "./media/storage.service.js";

/**
 * Patients + Sessions + Services (playbook 1.5). Every handler flows through
 * TenantScope.tx → RLS key set → scoped repos → audit row in the same tx.
 *
 * Phase 2: reads carry an explicit role gate (M14) and every repo call passes
 * the clinic id explicitly instead of trusting the RLS key alone (M12).
 *
 * Phase 6 (C2/M8): the clinical note has its own endpoint pair — encrypted on
 * write, decrypted on read, audited both ways, and never part of a patient list.
 * A consent signature is uploaded to object storage and only ever handed back as
 * a short-lived presigned URL.
 */
@Controller()
export class CoreController {
  constructor(private scope: TenantScope, private storage: StorageService) {}

  @Public()
  @Get("health")
  health(): { ok: true } {
    return { ok: true };
  }

  @Get("patients")
  @Roles("owner", "trichologist", "receptionist")
  list(@Query(new ZodBodyPipe(PaginationQuery)) q: { q?: string; limit: number; offset: number }) {
    return this.scope.tx((tx, ctx) => listPatients(tx, ctx.clinicId, q));
  }

  @Get("patients/:id")
  @Roles("owner", "trichologist", "receptionist")
  async byId(@Param("id") id: string): Promise<unknown> {
    const p = await this.scope.tx((tx, ctx) => getPatientById(tx, ctx.clinicId, id));
    if (!p) throw errors.notFound();
    return p;
  }

  @Post("patients")
  @Roles("owner", "trichologist", "receptionist")
  create(@Body(new ZodBodyPipe(PatientCreate)) dto: PatientCreateDto) {
    return this.scope.tx((tx, ctx) => createPatient(tx, ctx.clinicId, ctx.userId, dto));
  }

  /**
   * Reading a clinical note is a clinical act, not a list field: it needs a
   * clinical role and it writes its own audit row (فاز ۶ / C2).
   */
  @Get("patients/:id/notes")
  @Roles("owner", "trichologist")
  async notes(@Param("id") id: string): Promise<{ notes: string | null }> {
    const found = await this.scope.tx((tx, ctx) => getPatientById(tx, ctx.clinicId, id));
    if (!found) throw errors.notFound();
    const notes = await this.scope.tx((tx, ctx) => readPatientNotes(tx, ctx.clinicId, ctx.userId, id));
    return { notes };
  }

  @Put("patients/:id/notes")
  @Roles("owner", "trichologist")
  async setNotes(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(PatientNotesUpdate)) dto: PatientNotesUpdateDto,
  ): Promise<{ saved: true }> {
    const ok = await this.scope.tx((tx, ctx) => setPatientNotes(tx, ctx.clinicId, ctx.userId, id, dto.notes));
    if (!ok) throw errors.notFound();
    return { saved: true };
  }

  @Delete("patients/:id")
  @Roles("owner", "trichologist")
  async remove(@Param("id") id: string): Promise<{ deleted: boolean }> {
    const ok = await this.scope.tx((tx, ctx) => softDeletePatient(tx, ctx.clinicId, ctx.userId, id));
    return { deleted: ok };
  }

  @Get("sessions")
  @Roles("owner", "trichologist", "receptionist")
  listSessions(@Query(new ZodBodyPipe(PaginationQuery)) q: { limit: number; offset: number }) {
    return this.scope.tx((tx, ctx) => listSessions(tx, ctx.clinicId, q.limit, q.offset));
  }

  /** Booking lives behind the portal feature (§9.1 demo of feature gate). */
  @Post("sessions")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("portal")
  @Quota("monthly_sessions")
  createSession(
    @Body(new ZodBodyPipe(SessionCreate)) dto: { patientId: string; serviceId: string; startAt: string },
  ) {
    return this.scope.tx((tx, ctx) =>
      createSession(tx, {
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        patientId: dto.patientId,
        serviceId: dto.serviceId,
        startAt: new Date(dto.startAt),
      }),
    );
  }

  @Get("services")
  @Roles("owner", "trichologist", "receptionist")
  allServices() {
    return this.scope.tx(async (tx) => tx.select().from(services));
  }

  @Get("patients/:id/consents")
  @Roles("owner", "trichologist", "receptionist")
  listConsents(@Param("id") patientId: string) {
    return this.scope.tx((tx, ctx) => listConsentsForPatient(tx, ctx.clinicId, patientId));
  }

  @Post("consents")
  @Roles("owner", "trichologist", "receptionist")
  createConsent(@Body(new ZodBodyPipe(ConsentCreate)) dto: ConsentCreateDto, @Req() req: FastifyRequest) {
    return this.persistConsent(dto.patientId, dto, req);
  }

  @Post("patients/:id/consents")
  @Roles("owner", "trichologist", "receptionist")
  createPatientConsent(
    @Param("id") patientId: string,
    @Body(new ZodBodyPipe(ConsentCreate.omit({ patientId: true }))) dto: Omit<ConsentCreateDto, "patientId">,
    @Req() req: FastifyRequest,
  ) {
    return this.persistConsent(patientId, dto, req);
  }

  /**
   * One consent write path. The signature bytes go to MinIO under the consent's
   * own key; the row keeps the digest, the size, the MIME type and the request
   * context that produced it (M8).
   */
  private persistConsent(
    patientId: string,
    dto: Omit<ConsentCreateDto, "patientId">,
    req: FastifyRequest,
  ): Promise<unknown> {
    const signature = parseSignatureDataUrl(dto.signaturePayload);
    return this.scope.tx((tx, ctx) =>
      createConsent(tx, {
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        patientId,
        serviceId: dto.serviceId,
        templateVersion: dto.templateVersion,
        signature,
        signedFromIp: req.ip ?? null,
        userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
        storeSignature: (key, body, mime) => this.storage.putBuffer(ctx.clinicId, key, body, mime),
      }),
    );
  }

  /** The trace itself is never inlined in a response — only a short-lived URL. */
  @Get("consents/:cid/signature")
  @Roles("owner", "trichologist")
  async consentSignature(@Param("cid") cid: string): Promise<unknown> {
    const ctx = this.scope.requireCtx();
    const ref = await this.scope.tx((tx) => getConsentSignatureRef(tx, ctx.clinicId, cid));
    if (!ref?.signatureKey) throw errors.notFound();
    return {
      url: await this.storage.presignGet(ctx.clinicId, ref.signatureKey),
      sha256: ref.signatureSha256,
      mime: ref.signatureMime,
      revokedAt: ref.revokedAt,
    };
  }

  @Post("consents/:cid/revoke")
  @Roles("owner", "trichologist")
  @HttpCode(HttpStatus.OK)
  async revoke(
    @Param("cid") cid: string,
    @Body(new ZodBodyPipe(ConsentRevoke)) dto: ConsentRevokeDto,
  ): Promise<{ revoked: true }> {
    const ok = await this.scope.tx((tx, ctx) => revokeConsent(tx, ctx.clinicId, ctx.userId, cid, dto.reason));
    if (!ok) throw errors.notFound();
    return { revoked: true };
  }

  /** Feature-gate probe for integration tests (starter plan lacks ml_updates). */
  @Get("ml/status")
  @Roles("owner", "trichologist", "receptionist")
  @RequireFeature("ml_updates")
  mlStatus() {
    return { mlUpdates: true };
  }
}
