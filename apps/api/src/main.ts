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
import { buildCorsOptions, resolveAllowedOrigins } from "./common/security.config.js";
import { registerSecurityHeaders } from "./common/security-headers.js";
import { assertSwaggerConfig, registerSwaggerGuard, setupSwagger, shouldExposeSwagger } from "./common/swagger.js";
import { resolveStorageDriver } from "./media/storage.service.js";

/**
 * Fail-closed boot: signing secret, CORS allowlist, storage driver and docs
 * exposure are all validated before a socket is opened. A missing or weak
 * value aborts startup instead of falling back to a permissive default.
 */
function assertBootConfig(): void {
  resolveJwtConfig();
  resolveAllowedOrigins();
  resolveStorageDriver();
  assertSwaggerConfig();
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
      console.log(`${signal} received - draining connections`);
      void app
        .close()
        .then(() => {
          console.log("shutdown complete");
          process.exit(0);
        })
        .catch((err: unknown) => {
          console.error(`shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
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
    console.log(`Serving static web assets from: ${staticRoot}`);
    await app.useStaticAssets({ root: staticRoot, prefix: "/", decorateReply: false });
  }

  const port = 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`ScalpAI API ready on :${port}`);
}

void bootstrap();
