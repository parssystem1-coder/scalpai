import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { isProduction } from "./security.config.js";

/**
 * OpenAPI exposure (WEAKNESSES R12). In production the docs are off unless
 * SWAGGER_ENABLED=true, and then only behind SWAGGER_TOKEN. A token set in any
 * environment is enforced, which is how the guard is tested.
 */

export const DOCS_PATH = "api/v1/docs";
const MIN_TOKEN_LENGTH = 16;

export function swaggerToken(): string | null {
  const token = process.env.SWAGGER_TOKEN?.trim();
  return token && token.length >= MIN_TOKEN_LENGTH ? token : null;
}

export function shouldExposeSwagger(): boolean {
  if (!isProduction()) return true;
  return process.env.SWAGGER_ENABLED === "true";
}

export function assertSwaggerConfig(): void {
  if (!isProduction()) return;
  if (process.env.SWAGGER_ENABLED !== "true") return;
  if (!swaggerToken()) {
    throw new Error(`SWAGGER_ENABLED=true requires SWAGGER_TOKEN of at least ${MIN_TOKEN_LENGTH} characters`);
  }
}

/** onRequest hook so the guard also covers /docs-json and static swagger assets. */
export function registerSwaggerGuard(fastify: FastifyInstance): void {
  fastify.addHook("onRequest", (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    if (!req.url.startsWith(`/${DOCS_PATH}`)) {
      done();
      return;
    }
    const token = swaggerToken();
    if (!token) {
      if (isProduction()) {
        void reply.status(404).send({ code: "NOT_FOUND", message: "یافت نشد" });
        return;
      }
      done();
      return;
    }
    const presented = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const query = (req.query ?? {}) as { token?: unknown };
    const fromQuery = typeof query.token === "string" ? query.token : "";
    if (presented === token || fromQuery === token) {
      done();
      return;
    }
    void reply.status(401).send({ code: "UNAUTHORIZED", message: "دسترسی به مستندات نیازمند توکن است" });
  });
}

export function setupSwagger(app: NestFastifyApplication): void {
  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle("ScalpAI API")
      .setDescription("ScalpAI v2 clinic platform — core backbone API")
      .setVersion("0.1.0")
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, doc);
}
