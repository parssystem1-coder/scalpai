import { Module, type OnModuleInit } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, HttpAdapterHost } from "@nestjs/core";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import type { FastifyInstance } from "fastify";
import { DbService } from "@scalpai/db";
import { AnalysesController } from "./analyses.controller.js";
import { AuthController } from "./auth/auth.controller.js";
import { AuthService } from "./auth/auth.service.js";
import { resolveJwtConfig } from "./auth/jwt.config.js";
import { LoginThrottleService } from "./auth/login-throttle.service.js";
import { JwtAccessGuard } from "./auth/jwt-access.guard.js";
import { FeatureGuard } from "./common/feature.guard.js";
import { QuotaGuard } from "./common/quota.guard.js";
import { RolesGuard } from "./common/roles.guard.js";
import { AllExceptionsFilter } from "./common/error.filter.js";
import { CoreController } from "./core.controller.js";
import { EntitlementService } from "./entitlements/entitlement.service.js";
import { GalleryController } from "./media/gallery.controller.js";
import { MockStorageController, registerMockStorageParsers } from "./media/mock-storage.controller.js";
import { isMockStorageEnabled, StorageService } from "./media/storage.service.js";
import { PlansController } from "./plans.controller.js";
import { SyncController } from "./sync.controller.js";
import { registerTenantContext } from "./tenancy/tenant-context.hook.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

const jwt = resolveJwtConfig();

// The mock object store is a build-time opt-in: with STORAGE_DRIVER unset (or
// in production, where 'mock' is refused outright) the route does not exist.
const mockStorage = isMockStorageEnabled();

type ExpiresIn = NonNullable<NonNullable<JwtModuleOptions["signOptions"]>["expiresIn"]>;

@Module({
  imports: [
    JwtModule.register({
      secret: jwt.secret,
      signOptions: {
        expiresIn: jwt.accessTtl as unknown as ExpiresIn,
        issuer: jwt.issuer,
        audience: jwt.audience,
        keyid: jwt.kid,
      },
    }),
  ],
  controllers: [
    AuthController,
    CoreController,
    PlansController,
    GalleryController,
    AnalysesController,
    SyncController,
    ...(mockStorage ? [MockStorageController] : []),
  ],
  providers: [
    DbService,
    AuthService,
    TenantScope,
    EntitlementService,
    LoginThrottleService,
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
export class AppModule implements OnModuleInit {
  constructor(private adapterHost: HttpAdapterHost) {}

  onModuleInit(): void {
    const fastify = this.adapterHost.httpAdapter?.getInstance<FastifyInstance>();
    if (!fastify) return;
    // WEAKNESSES R3 — must be the first hook: everything downstream (guards,
    // handlers, repos) resolves its tenant from this per-request store.
    registerTenantContext(fastify);
    if (mockStorage) registerMockStorageParsers(fastify);
  }
}
