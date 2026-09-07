import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AnalysisSubmit, ExpertReview, type AnalysisSubmitDto, type ExpertReviewDto, errors } from "@scalpai/shared";
import {
  consumeQuota,
  createAnalysis,
  getAnalysisById,
  listAnalysesByPatient,
  resolveQuotaLimit,
  saveExpertReview,
} from "@scalpai/db";
import { EntitlementService } from "./entitlements/entitlement.service.js";
import { Quota } from "./common/quota.guard.js";
import { RateLimit } from "./common/rate-limit.guard.js";
import { Roles } from "./common/roles.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * Analyses (playbook 2.3): the CLIENT engine computes scores locally
 * (§3 golden rule — analysis never leaves the device); the server only
 * validates the contract and persists. expert_review is the Gold-label door.
 *
 * Phase 8 (H11): the plan quota is CONSUMED in the same transaction that writes
 * the row. `@Quota` still fronts the handler, but it is only a cheap pre-check —
 * two submissions arriving together used to both read `used = limit - 1` and both
 * be accepted, and nothing downstream noticed.
 *
 * Phase 10 (H13): because the computation happens off-server, the SUBMISSION has
 * to carry its own provenance — the digest of the pixels that produced it and a
 * reference to a registered model manifest. `AnalysisSubmit` verifies that
 * reference against the platform registry, so an unknown model or a mismatched
 * `modelVersion` is refused here instead of becoming a stored clinical claim.
 * The provenance is persisted with the result so a row stays re-checkable.
 */
@Controller("analyses")
export class AnalysesController {
  constructor(
    private scope: TenantScope,
    private entitlements: EntitlementService,
  ) {}

  @Post()
  @Roles("owner", "trichologist")
  @RateLimit("analysis", 120)
  @Quota("analyses")
  async submit(@Body(new ZodBodyPipe(AnalysisSubmit)) dto: AnalysisSubmitDto) {
    const ctx = this.scope.requireCtx();
    const ent = await this.entitlements.resolve(ctx.clinicId);
    const limit = resolveQuotaLimit(ent?.limits, "analyses");

    // Named so the provenance rides along with the scores it belongs to.
    const result = {
      scores: dto.result.scores,
      severity: dto.result.severity,
      provenance: dto.result.provenance,
    };

    const created = await this.scope.tx(async (tx, c) => {
      const slot = await consumeQuota(tx, c.clinicId, "analyses", 1, limit);
      if (!slot.allowed) throw errors.quotaExceeded();
      const row = await createAnalysis(tx, c.clinicId, {
        patientId: dto.patientId,
        galleryItemId: dto.galleryItemId,
        result,
        modelVersion: dto.result.modelVersion,
        userId: c.userId,
      });
      if (!row) throw errors.notFound();
      return row;
    });
    return { id: created.id, createdAt: created.createdAt, result: created.result };
  }

  @Get(":id")
  @Roles("owner", "trichologist", "receptionist")
  async byId(@Param("id") id: string) {
    const row = await this.scope.tx((tx, ctx) => getAnalysisById(tx, ctx.clinicId, id));
    if (!row) throw errors.notFound();
    return row;
  }

  @Get()
  @Roles("owner", "trichologist", "receptionist")
  list(@Query("patientId") patientId: string) {
    return this.scope.tx(async (tx, ctx) => listAnalysesByPatient(tx, ctx.clinicId, patientId));
  }

  @Patch(":id/expert-review")
  @Roles("owner", "trichologist")
  async review(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(ExpertReview)) dto: ExpertReviewDto,
  ) {
    const updated = await this.scope.tx((tx, ctx) => saveExpertReview(tx, ctx.clinicId, id, { ...dto, userId: ctx.userId }));
    if (!updated) throw errors.notFound();
    return { id: updated.id, expertReview: updated.expertReview };
  }
}
