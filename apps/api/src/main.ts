import "reflect-metadata";
import { loadEnv } from "@scalpai/db";
import { join } from "node:path";

loadEnv();

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/error.filter.js";
import { registerSecurityHeaders } from "./common/security-headers.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("/api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  // Web dev server (:5173) and future desktop shell call the API cross-origin.
  // PATCH must be allowed explicitly (fastify-cors default omits it).
  app.enableCors({
    origin: true,
    credentials: false,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await registerSecurityHeaders(app);
  app.enableShutdownHooks();

  // Playbook 1.5 — automatic OpenAPI (JSON + minimal UI). Enriched in phase 4.
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("ScalpAI API")
      .setDescription("ScalpAI v2 clinic platform — core backbone API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup("api/v1/docs", app, doc);

  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;

  fastify.get('/api/v1/mock-s3/*', async (_req: FastifyRequest, reply: FastifyReply) => {
    void reply.send({ success: true, message: "mock s3" });
  });
  fastify.put('/api/v1/mock-s3/*', async (_req: FastifyRequest, reply: FastifyReply) => {
    void reply.send({ success: true });
  });

  app.useStaticAssets({
    root: join(process.cwd(), '../web/dist'),
    prefix: '/',
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`ScalpAI API ready on :${port}`);
}

void bootstrap();
