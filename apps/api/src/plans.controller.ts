import { Controller, Get, Param } from "@nestjs/common";
import { errors } from "@scalpai/shared";
import { getPlanWithFeatures, listPlans } from "@scalpai/db";
import { Roles } from "./common/roles.guard.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * Plans catalog — READ ONLY for tenants (WEAKNESSES C4, ADR-0031).
 *
 * The catalog is shared platform data: pricing, features and limits are the
 * same rows for every clinic, so a clinic owner writing to them would edit
 * other tenants' entitlements. Writes now live exclusively in the platform CLI
 * (`npm run plans:admin`) which connects as the migration role; the app role
 * has INSERT/UPDATE/DELETE revoked on plans and plan_features, and the
 * conformance rule `platform-boundaries` fails the build if a controller ever
 * imports the catalog write helpers again.
 */
@Controller("plans")
export class PlansController {
  constructor(private scope: TenantScope) {}

  @Get()
  @Roles("owner", "trichologist", "receptionist")
  list() {
    return this.scope.tx((tx) => listPlans(tx));
  }

  @Get(":code")
  @Roles("owner", "trichologist", "receptionist")
  async byCode(@Param("code") code: string) {
    const plan = await this.scope.tx((tx) => getPlanWithFeatures(tx, code));
    if (!plan) throw errors.notFound();
    return plan;
  }
}
