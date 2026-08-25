import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { PlanUpsert, type PlanUpsert as PlanUpsertDto, errors } from "@scalpai/shared";
import {
  appendAudit,
  countEntitlementsByPlan,
  deletePlan,
  getPlanByCode,
  getPlanWithFeatures,
  listPlans,
  upsertPlan,
  type PlanUpsertInput,
} from "@scalpai/db";
import { Roles } from "./common/roles.guard.js";
import { RequireFeature } from "./common/feature.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * Plans admin CRUD (playbook 1.4 / §9.1). The catalog is platform data
 * (exempt from RLS by design) — the gate is owner role + 'admin' feature.
 * Every write lands in the audit chain inside the same tx.
 */
@Controller("plans")
export class PlansController {
  constructor(private scope: TenantScope) {}

  @Get()
  list() {
    return this.scope.tx((tx) => listPlans(tx));
  }

  @Get(":code")
  async byCode(@Param("code") code: string) {
    const plan = await this.scope.tx((tx) => getPlanWithFeatures(tx, code));
    if (!plan) throw errors.notFound();
    return plan;
  }

  @Post()
  @Roles("owner")
  @RequireFeature("admin")
  async create(@Body(new ZodBodyPipe(PlanUpsert)) dto: PlanUpsertDto) {
    await this.mutate(dto, "plan.create");
    return this.fetchOr404(dto.code);
  }

  @Put(":code")
  @Roles("owner")
  @RequireFeature("admin")
  async replace(@Param("code") code: string, @Body(new ZodBodyPipe(PlanUpsert)) dto: PlanUpsertDto) {
    if (code !== dto.code) throw errors.validation([{ path: ["code"], message: "code in URL and body must match" }]);
    await this.mutate(dto, "plan.update");
    return this.fetchOr404(dto.code);
  }

  @Delete(":code")
  @Roles("owner")
  @RequireFeature("admin")
  async remove(@Param("code") code: string): Promise<{ deleted: boolean }> {
    const deleted = await this.scope.tx(async (tx, ctx) => {
      if (!(await getPlanByCode(tx, code))) throw errors.notFound();
      const refs = await countEntitlementsByPlan(tx, code);
      if (refs > 0) throw errors.conflict("این پلن هنوز توسط کلینیک‌ها استفاده می‌شود");
      const ok = await deletePlan(tx, code);
      await appendAudit(tx, { clinicId: ctx.clinicId, userId: ctx.userId, action: "plan.delete", entity: "plan", entityId: code });
      return ok;
    });
    return { deleted };
  }

  private fetchOr404(code: string) {
    return this.scope.tx(async (tx) => {
      const plan = await getPlanWithFeatures(tx, code);
      if (!plan) throw errors.notFound();
      return plan;
    });
  }

  private mutate(dto: PlanUpsertDto, action: string): Promise<void> {
    return this.scope.tx(async (tx, ctx) => {
      const input: PlanUpsertInput = {
        code: dto.code,
        name: dto.name,
        price: String(dto.price),
        interval: dto.interval,
        features: dto.features,
        limits: dto.limits,
      };
      await upsertPlan(tx, input);
      await appendAudit(tx, {
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        action,
        entity: "plan",
        entityId: dto.code,
        meta: null,
      });
    });
  }
}

