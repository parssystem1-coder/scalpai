import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { DbService } from "@scalpai/db";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { JwtAccessGuard } from "./auth/jwt-access.guard.js";
import { FeatureGuard } from "./common/feature.guard.js";
import { QuotaGuard } from "./common/quota.guard.js";
import { RolesGuard } from "./common/roles.guard.js";
import { AllExceptionsFilter } from "./common/error.filter.js";
import { CoreController } from "./core.controller.js";
import { EntitlementService } from "./entitlements/entitlement.service.js";
import { StorageService } from "./media/storage.service.js";
import { PlansController } from "./plans.controller.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET ?? "dev_only_secret_change_me_0123456789abcdef" })],
  controllers: [AuthController, CoreController, PlansController],
  providers: [
    DbService,
    AuthService,
    TenantScope,
    EntitlementService,
    StorageService,
    RolesGuard,
    FeatureGuard,
    QuotaGuard,
    { provide: APP_GUARD, useClass: JwtAccessGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useExisting: FeatureGuard },
    { provide: APP_GUARD, useExisting: QuotaGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
