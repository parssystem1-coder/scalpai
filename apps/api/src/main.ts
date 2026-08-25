import "reflect-metadata";
import { loadEnv } from "@scalpai/db";

loadEnv();

import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/error.filter.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("/api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  // Web dev server (:5173) and future desktop shell call the API cross-origin.
  app.enableCors({ origin: true, credentials: false });
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  console.log(`ScalpAI API ready on :${port}`);
}

void bootstrap();
