import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AnalysisSubmit, ExpertReview, type AnalysisSubmitDto, type ExpertReviewDto, errors } from "@scalpai/shared";
import { createAnalysis, getAnalysisById, listAnalysesByPatient, saveExpertReview } from "@scalpai/db";
import { Roles } from "./common/roles.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * Analyses (playbook 2.3): the CLIENT engine computes scores locally
 * (§3 golden rule — analysis never leaves the device); the server only
 * validates the contract and persists. expert_review is the Gold-label door.
 */
@Controller("analyses")
export class AnalysesController {
  constructor(private scope: TenantScope) {}

  @Post()
  @Roles("owner", "trichologist")
  async submit(@Body(new ZodBodyPipe(AnalysisSubmit)) dto: AnalysisSubmitDto) {
    const created = await this.scope.tx(async (tx, ctx) => {
      const row = await createAnalysis(tx, ctx.clinicId, {
        patientId: dto.patientId,
        galleryItemId: dto.galleryItemId,
        result: { scores: dto.result.scores, severity: dto.result.severity },
        modelVersion: dto.result.modelVersion,
        userId: ctx.userId,
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
