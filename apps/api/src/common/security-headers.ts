import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";

/**
 * W17 — security headers on every API response. CSP for HTML documents is
 * owned by the web app (phase 4 design system); this API serves JSON and the
 * swagger UI only, so CSP stays off here while HSTS/frame/nosniff apply.
 */
export async function registerSecurityHeaders(app: NestFastifyApplication): Promise<void> {
  await app.register(helmet as any, { contentSecurityPolicy: false, hsts: { maxAge: 15_552_000 } });
}
