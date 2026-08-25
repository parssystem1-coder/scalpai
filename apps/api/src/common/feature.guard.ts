import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { EntitlementService } from "./../entitlements/entitlement.service.js";

export const FEATURE_KEY = "feature";
/** Plan gate (§9.1) — every gated endpoint MUST carry this (conformance rule `feature-gate`). */
export const RequireFeature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(private reflector: Reflector, private entitlements: EntitlementService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;
    const ctx = TenantScope.current();
    if (!ctx) throw new ForbiddenException();
    const ent = await this.entitlements.resolve(ctx.clinicId);
    if (!ent?.features.includes(feature)) throw new ForbiddenException({ code: "FEATURE_DISABLED", message: `فیچر فعال نیست: ${feature}` });
    return true;
  }
}
