import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "@scalpai/db";

loadEnv();

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";
import { AppModule } from "./app.module.js";
import { resolveJwtConfig } from "./auth/jwt.config.js";
import { AllExceptionsFilter } from "./common/error.filter.js";
import { logEvent } from "./common/logging.js";
import { assertPhiConfig } from "./common/phi.config.js";
import { buildCorsOptions, resolveAllowedOrigins } from "./common/security.config.js";
import { registerSecurityHeaders } from "./common/security-headers.js";
import { assertSwaggerConfig, registerSwaggerGuard, setupSwagger, shouldExposeSwagger } from "./common/swagger.js";
import { resolveStorageDriver } from "./media/storage.service.js";

/**
 * Fail-closed boot: signing secret, CORS allowlist, storage driver, docs
 * exposure and (phase 6) PHI key material are all validated before a socket is
 * opened. A missing or weak value aborts startup instead of falling back to a
 * permissive default.
 */
function assertBootConfig(): void {
  resolveJwtConfig();
  resolveAllowedOrigins();
  resolveStorageDriver();
  assertSwaggerConfig();
  // C2/ADR-0038: in production a missing PHI key ring is a boot failure. There
  // is no plaintext fallback for a clinical note.
  assertPhiConfig();
}

/**
 * Listen port (WEAKNESSES H15): the browser suite and any local multi-instance
 * setup need to move the API off the default. PORT wins, 3000 stays the default
 * so the container healthcheck and ops/prod.yml keep working untouched.
 */
export function resolvePort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PORT?.trim();
  if (!raw) return 3000;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535 (got ${raw})`);
  }
  return port;
}

/**
 * Graceful shutdown (WEAKNESSES M17): the container orchestrator sends SIGTERM
 * and waits `stop_grace_period`. Nest closes the HTTP server (draining
 * in-flight requests) and runs every onModuleDestroy/beforeApplicationShutdown
 * hook - pools and the Redis client included - before the process exits.
 */
function installShutdownHandlers(app: NestFastifyApplication): void {
  let closing = false;
  const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];
  for (const signal of signals) {
    process.on(signal, () => {
      if (closing) return;
      closing = true;
      logEvent("info", { event: "process.draining", reason: signal });
      void app
        .close()
        .then(() => {
          logEvent("info", { event: "process.shutdown_complete" });
          process.exit(0);
        })
        .catch((err: unknown) => {
          logEvent("error", {
            event: "process.shutdown_failed",
            message: err instanceof Error ? err.message : String(err),
          });
          process.exit(1);
        });
    });
  }
}

async function bootstrap(): Promise<void> {
  assertBootConfig();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("/api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors(buildCorsOptions());
  await registerSecurityHeaders(app);
  app.enableShutdownHooks();
  installShutdownHandlers(app);

  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
  registerSwaggerGuard(fastify);
  if (shouldExposeSwagger()) setupSwagger(app);

  const candidateStaticRoots = [
    join(process.cwd(), "apps/web/dist"),
    join(process.cwd(), "../web/dist"),
    join(process.cwd(), "web/dist"),
    join(process.cwd(), "dist"),
  ];
  const staticRoot = candidateStaticRoots.find((dir) => existsSync(dir));
  if (staticRoot) {
    logEvent("info", { event: "web.static_root", path: staticRoot });
    await app.useStaticAssets({ root: staticRoot, prefix: "/", decorateReply: false });
  }

  const port = resolvePort();
  await app.listen(port, "0.0.0.0");
  logEvent("info", { event: "api.ready", count: port });
}

void bootstrap();
