import { Module, type OnModuleInit } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import type { FastifyInstance } from "fastify";
import { DbService } from "@scalpai/db";
import { AnalysesController } from "./analyses.controller.js";
import { AftercareController } from "./aftercare/aftercare.controller.js";
import { InboundController } from "./aftercare/inbound.controller.js";
import { AftercareRepository } from "./aftercare/aftercare.repository.js";
import { AftercareService } from "./aftercare/aftercare.service.js";
import { AftercareWorker } from "./aftercare/aftercare.worker.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { resolveJwtConfig } from "./auth/jwt.config.js";
import { LoginThrottleService } from "./auth/login-throttle.service.js";
import { JwtAccessGuard } from "./auth/jwt-access.guard.js";
import { BillingController } from "./billing/billing.controller.js";
import { PaymentController } from "./billing/payment.controller.js";
import { BillingRepository } from "./billing/billing.repository.js";
import { BillingService } from "./billing/billing.service.js";
import { PaymentService } from "./billing/payment.service.js";
import { WebhookGuard } from "./billing/webhook.guard.js";
import { FeatureGuard } from "./common/feature.guard.js";
import { QuotaGuard } from "./common/quota.guard.js";
import { RateLimitGuard } from "./common/rate-limit.guard.js";
import { RolesGuard } from "./common/roles.guard.js";
import { AllExceptionsFilter } from "./common/error.filter.js";
import { registerRequestLogging } from "./common/logging.js";
import { StateStore } from "./common/state/state.store.js";
import { CoreController } from "./core.controller.js";
import { EntitlementService } from "./entitlements/entitlement.service.js";
import { LicenseController } from "./licensing/license.controller.js";
import { LicenseService } from "./licensing/license.service.js";
import { GalleryController } from "./media/gallery.controller.js";
import { MockStorageController, registerMockStorageParsers } from "./media/mock-storage.controller.js";
import { isMockStorageEnabled, StorageService } from "./media/storage.service.js";
import { MeteringService } from "./metering/metering.service.js";
import { OpsController } from "./ops/ops.controller.js";
import { installObservability } from "./ops/observability.js";
import { UploadService } from "./media/upload.service.js";
import { PlansController } from "./plans.controller.js";
import { PrivacyController } from "./privacy/privacy.controller.js";
import { SyncController } from "./sync.controller.js";
import { registerTenantContext } from "./tenancy/tenant-context.hook.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

const jwt = resolveJwtConfig();
const mockStorage = isMockStorageEnabled();
const aftercareWorker = AftercareWorker.isEnabled();

@Module({
  imports: [JwtModule.register({ secret: jwt.secret, signOptions: { expiresIn: jwt.accessTtl, issuer: jwt.issuer, audience: jwt.audience, keyid: jwt.kid } })],
  controllers: [
    AuthController, CoreController, PlansController, GalleryController, AnalysesController, SyncController, PrivacyController,
    LicenseController, OpsController, AftercareController, InboundController, BillingController, PaymentController,
    ...(mockStorage ? [MockStorageController] : []),
  ],
  providers: [
    DbService, StateStore, AuthService, TenantScope, EntitlementService, LoginThrottleService, StorageService, LicenseService,
    UploadService, MeteringService, AftercareRepository, AftercareService, BillingRepository, BillingService, PaymentService,
    WebhookGuard, ...(aftercareWorker ? [AftercareWorker] : []), RolesGuard, FeatureGuard, QuotaGuard, RateLimitGuard,
    { provide: APP_GUARD, useClass: JwtAccessGuard },
    { provide: APP_GUARD, useExisting: RateLimitGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useExisting: FeatureGuard },
    { provide: APP_GUARD, useExisting: QuotaGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements OnModuleInit {
  constructor(private adapterHost: HttpAdapterHost) {}
  onModuleInit(): void {
    installObservability();
    const fastify = this.adapterHost.httpAdapter?.getInstance<FastifyInstance>();
    if (!fastify) return;
    registerRequestLogging(fastify);
    registerTenantContext(fastify);
    if (mockStorage) registerMockStorageParsers(fastify);
  }
}
