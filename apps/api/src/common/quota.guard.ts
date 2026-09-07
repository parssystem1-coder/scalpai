import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { QUOTA_SPECS, isQuotaName, peekQuota, resolveQuotaLimit, type QuotaName } from "@scalpai/db";
import { errors } from "@scalpai/shared";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { EntitlementService } from "./../entitlements/entitlement.service.js";

export const QUOTA_KEY = "quota_metric";

/** §9.1 — metered endpoints MUST carry this when their plan limit is enforced. */
export const Quota = (metric: QuotaName) => SetMetadata(QUOTA_KEY, metric);

/**
 * Plan quota — the CHEAP half (phase 8 / WEAKNESSES H11, ADR-0041).
 *
 * This guard used to be the whole enforcement: it read the counter, compared it
 * to the limit, and let the handler through. Two requests arriving together both
 * read `used = limit - 1` and both passed, so a clinic could finish the month
 * over its plan and nothing in the system disagreed.
 *
 * The binding decision now lives in the handler's own transaction
 * (`consumeQuota` / `reserveStorageBytes`), where the counter row is locked. The
 * guard stays because refusing an obviously-exhausted clinic before it uploads
 * 50MB is worth a single SELECT — but it is an optimisation, never the contract.
 * Storage is skipped here on purpose: its ceiling depends on the size of THIS
 * request, which only the handler knows.
 */
@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private entitlements: EntitlementService,
    private scope: TenantScope,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const name = this.reflector.getAllAndOverride<string>(QUOTA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!name) return true;
    if (!isQuotaName(name)) {
      // a typo in a decorator must not silently disable metering
      throw new Error(`unknown quota metric '${name}' — add it to QUOTA_SPECS`);
    }
    const metric: QuotaName = name;
    if (QUOTA_SPECS[metric].kind !== "flow") return true;

    const ctx = TenantScope.current();
    if (!ctx) throw errors.forbidden();
    const ent = await this.entitlements.resolve(ctx.clinicId);
    const limit = resolveQuotaLimit(ent?.limits, metric);
    if (limit === null) return true; // plan does not meter this metric

    const used = await this.scope.tx((tx) => peekQuota(tx, ctx.clinicId, metric));
    if (used >= limit) throw errors.quotaExceeded();
    return true;
  }
}
