import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { PaginationQuery, PatientCreate, SessionCreate, ConsentCreate } from "@scalpai/shared";
import type { PatientCreateDto, ConsentCreateDto } from "@scalpai/shared";
import { errors } from "@scalpai/shared";
import {
  createPatient,
  createSession,
  createConsent,
  listConsentsForPatient,
  getPatientById,
  listPatients,
  listSessions,
  services,
  softDeletePatient,
} from "@scalpai/db";
import { Roles } from "./common/roles.guard.js";
import { Public } from "./auth/jwt-access.guard.js";
import { RequireFeature } from "./common/feature.guard.js";
import { Quota } from "./common/quota.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * Patients + Sessions + Services (playbook 1.5). Every handler flows through
 * TenantScope.tx → RLS key set → scoped repos → audit row in the same tx.
 */
@Controller()
export class CoreController {
  constructor(private scope: TenantScope) {}

  @Public()
  @Get("health")
  health(): { ok: true } {
    return { ok: true };
  }

  @Get("patients")
  list(@Query(new ZodBodyPipe(PaginationQuery)) q: { q?: string; limit: number; offset: number }) {
    return this.scope.tx((tx) => listPatients(tx, q));
  }

  @Get("patients/:id")
  async byId(@Param("id") id: string): Promise<unknown> {
    const p = await this.scope.tx((tx) => getPatientById(tx, id));
    if (!p) throw errors.notFound();
    return p;
  }

  @Post("patients")
  @Roles("owner", "trichologist", "receptionist")
  create(@Body(new ZodBodyPipe(PatientCreate)) dto: PatientCreateDto) {
    return this.scope.tx((tx, ctx) => createPatient(tx, ctx.clinicId, ctx.userId, dto));
  }

  @Delete("patients/:id")
  @Roles("owner", "trichologist")
  async remove(@Param("id") id: string): Promise<{ deleted: boolean }> {
    const ok = await this.scope.tx((tx, ctx) => softDeletePatient(tx, ctx.clinicId, ctx.userId, id));
    return { deleted: ok };
  }

  @Get("sessions")
  listSessions(@Query(new ZodBodyPipe(PaginationQuery)) q: { limit: number; offset: number }) {
    return this.scope.tx((tx, ctx) => listSessions(tx, ctx.clinicId, q.limit, q.offset));
  }

  /** Booking lives behind the portal feature (§9.1 demo of feature gate). */
  @Post("sessions")
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
  allServices() {
    return this.scope.tx(async (tx) => tx.select().from(services));
  }

  @Get("patients/:id/consents")
  listConsents(@Param("id") patientId: string) {
    return this.scope.tx((tx, ctx) => listConsentsForPatient(tx, ctx.clinicId, patientId));
  }

  @Post("consents")
  @Roles("owner", "trichologist", "receptionist")
  createConsent(@Body(new ZodBodyPipe(ConsentCreate)) dto: ConsentCreateDto) {
    return this.scope.tx((tx, ctx) =>
      createConsent(tx, {
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        patientId: dto.patientId,
        serviceId: dto.serviceId,
        templateVersion: dto.templateVersion,
        signaturePayload: dto.signaturePayload,
      }),
    );
  }

  @Post("patients/:id/consents")
  @Roles("owner", "trichologist", "receptionist")
  createPatientConsent(
    @Param("id") patientId: string,
    @Body(new ZodBodyPipe(ConsentCreate.omit({ patientId: true }))) dto: Omit<ConsentCreateDto, "patientId">,
  ) {
    return this.scope.tx((tx, ctx) =>
      createConsent(tx, {
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        patientId,
        serviceId: dto.serviceId,
        templateVersion: dto.templateVersion,
        signaturePayload: dto.signaturePayload,
      }),
    );
  }

  /** Feature-gate probe for integration tests (starter plan lacks ml_updates). */
  @Get("ml/status")
  @RequireFeature("ml_updates")
  mlStatus() {
    return { mlUpdates: true };
  }
}
