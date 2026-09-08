import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";

/**
 * W17 — security headers on every API response. CSP for HTML documents is
 * owned by the web app (phase 4 design system); this API serves JSON and the
 * swagger UI only, so CSP stays off here while HSTS/frame/nosniff apply.
 */

/**
 * Phase 10 (M19): `helmet as any` turned the register() call into a
 * no-unsafe-argument error — the plugin arrived as `any` and nothing about the
 * options bag was checked either. @fastify/helmet is typed against the Fastify
 * generics it bundles, which do not line up with the instance Nest exposes, so
 * the plugin is bridged through ONE narrow structural type instead of `any`.
 */
type FastifyPluginLike = (instance: unknown, opts: unknown, done: (err?: Error) => void) => void;

export async function registerSecurityHeaders(app: NestFastifyApplication): Promise<void> {
  const plugin = helmet as unknown as FastifyPluginLike;
  await app.register(plugin, { contentSecurityPolicy: false, hsts: { maxAge: 15_552_000 } });
}
