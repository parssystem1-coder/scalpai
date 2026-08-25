import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { getUsage } from "@scalpai/db";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { EntitlementService } from "./../entitlements/entitlement.service.js";

export const QUOTA_KEY = "quota_metric";
/** §9.1 — metered endpoints MUST carry this when their plan limit is enforced. */
export const Quota = (metric: string) => SetMetadata(QUOTA_KEY, metric);

/**
 * Plan quota enforcement: metric absent from plan limits = unmetered.
 * Metered usage lives in usage_counters (monthly period). Runs after
 * FeatureGuard so a disabled feature short-circuits before quota math.
 */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(private reflector: Reflector, private entitlements: EntitlementService, private scope: TenantScope) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metric = this.reflector.getAllAndOverride<string>(QUOTA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metric) return true;
    const ctx = TenantScope.current();
    if (!ctx) throw new ForbiddenException();
    const ent = await this.entitlements.resolve(ctx.clinicId);
    const limit = ent?.limits?.[metric];
    if (typeof limit !== "number") return true; // plan does not meter this metric
    const used = await this.scope.tx((tx) => getUsage(tx, ctx.clinicId, metric));
    if (used >= limit) {
      throw new ForbiddenException({ code: "QUOTA_EXCEEDED", message: `سهمیه ${metric} پلن تکمیل شده است` });
    }
    return true;
  }
}
