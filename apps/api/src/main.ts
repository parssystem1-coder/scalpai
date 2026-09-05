import "reflect-metadata";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnv } from "@scalpai/db";

loadEnv();

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/error.filter.js";
import { registerSecurityHeaders } from "./common/security-headers.js";
import { StorageService } from "./media/storage.service.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("/api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  // CORS configuration: Support explicit origins via CORS_ALLOWED_ORIGINS or safe defaults for web, desktop, and cloud preview
  const rawOrigins = process.env.CORS_ALLOWED_ORIGINS;
  const defaultAllowedOrigins = [
    "http://localhost:5173",
    "http://localhost:3000",
    /^https:\/\/.*\.vercel\.app$/,
    /^https:\/\/.*\.run\.app$/,
  ];

  app.enableCors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile app, desktop shell, curl, server-to-server)
      if (!origin) return cb(null, true);

      if (rawOrigins) {
        const list = rawOrigins.split(",").map((s) => s.trim());
        if (list.includes(origin) || list.includes("*")) {
          return cb(null, true);
        }
      }

      const isAllowed = defaultAllowedOrigins.some((pattern) => {
        if (typeof pattern === "string") return pattern === origin;
        if (pattern instanceof RegExp) return pattern.test(origin);
        return false;
      });

      if (isAllowed || process.env.NODE_ENV !== "production") {
        return cb(null, true);
      }
      return cb(new Error("CORS origin forbidden"), false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "x-clinic-id",
      "x-client-mutation-id",
      "Accept",
      "Origin",
    ],
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

  const storage = app.get(StorageService);

  // Parse raw binary data for mock-s3
  fastify.addContentTypeParser('*', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body);
  });

  fastify.get('/api/v1/mock-s3/*', async (req: FastifyRequest<{ Params: { '*': string } }>, reply: FastifyReply) => {
    const key = decodeURIComponent(req.params['*']);
    const data = await storage.getLocalBuffer(key);
    if (!data) return reply.status(404).send('Not found');
    void reply.type('image/jpeg').send(data);
  });

  fastify.put('/api/v1/mock-s3/*', async (req: FastifyRequest<{ Params: { '*': string }; Querystring: { part?: string } }>, reply: FastifyReply) => {
    const key = decodeURIComponent(req.params['*']);
    let body = req.body as Buffer;
    
    // For multipart/chunked, if the client sends multiple parts, we append them on disk
    const partMatch = req.query.part;
    if (partMatch) {
      const existing = (await storage.getLocalBuffer(key)) || Buffer.alloc(0);
      body = Buffer.concat([existing, body]);
    }
    
    await storage.saveLocalBuffer(key, body);
    storage.inMemoryMap.set(key, body);
    void reply.header('etag', `"mock-etag-${Date.now()}"`).send({ success: true });
  });

  const candidateStaticRoots = [
    join(process.cwd(), "apps/web/dist"),
    join(process.cwd(), "../web/dist"),
    join(process.cwd(), "web/dist"),
    join(process.cwd(), "dist"),
  ];

  const staticRoot = candidateStaticRoots.find((dir) => existsSync(dir));

  if (staticRoot && existsSync(staticRoot)) {
    console.log(`Serving static web assets from: ${staticRoot}`);
    await app.useStaticAssets({
      root: staticRoot,
      prefix: "/",
      decorateReply: false,
    });
  }

  const port = 3000;
  await app.listen(port, "0.0.0.0");
  console.log(`ScalpAI API ready on :${port}`);
}

void bootstrap();
