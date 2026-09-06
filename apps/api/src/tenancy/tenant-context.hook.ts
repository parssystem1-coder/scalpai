import type { FastifyInstance } from "fastify";
import { TenantScope } from "./tenant.scope.js";

/**
 * Request boundary for the tenant context (WEAKNESSES R3).
 *
 * The hook runs before every route (including public ones) and wraps the rest
 * of the lifecycle in `als.run(...)`, so the store belongs to exactly one
 * request. Registered from AppModule.onModuleInit — which means the integration
 * suites get the same boundary as production, not a test-only shim.
 */
export function registerTenantContext(fastify: FastifyInstance): void {
  fastify.addHook("onRequest", (_request, _reply, done) => {
    TenantScope.run(() => {
      done();
    });
  });
}
