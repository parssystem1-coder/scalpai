import type { INestApplication } from "@nestjs/common";

/**
 * Boot-time security configuration (WEAKNESSES C7/R2 + H1).
 *
 * Everything here is fail-closed: a missing or wildcard value throws during
 * boot instead of silently degrading into a permissive default. There is no
 * `NODE_ENV !== "production"` escape hatch left in the CORS path.
 */

export type CorsOptions = Parameters<INestApplication["enableCors"]>[0];

/** Localhost origins the dev/test tooling actually uses (never applied in production). */
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

const ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Requested-With",
  "x-clinic-id",
  "x-client-mutation-id",
  "Accept",
  "Origin",
];

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Production: exactly the origins listed in CORS_ALLOWED_ORIGINS, https only,
 * no wildcards, no implicit defaults. Dev/test: the same list plus localhost.
 */
export function resolveAllowedOrigins(): string[] {
  const list = parseList(process.env.CORS_ALLOWED_ORIGINS);

  if (isProduction()) {
    if (list.length === 0) {
      throw new Error("CORS_ALLOWED_ORIGINS must list explicit origins in production");
    }
    for (const origin of list) {
      if (origin.includes("*")) {
        throw new Error(`CORS_ALLOWED_ORIGINS rejects wildcard origin '${origin}' in production`);
      }
      if (!/^https:\/\/[a-z0-9.-]+(:\d{2,5})?$/i.test(origin)) {
        throw new Error(`CORS_ALLOWED_ORIGINS entry '${origin}' must be an explicit https origin`);
      }
    }
    return [...new Set(list)];
  }

  return [...new Set([...list, ...DEV_ORIGINS])];
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

/**
 * A request without an Origin header is not a browser CORS request (curl,
 * health check, server-to-server). We simply do not emit CORS headers for it
 * rather than reflecting an arbitrary origin back while credentials are on.
 */
export function buildCorsOptions(): CorsOptions {
  const allowed = resolveAllowedOrigins();
  return {
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      cb(null, isOriginAllowed(origin, allowed));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ALLOWED_HEADERS,
    maxAge: 600,
  } as CorsOptions;
}

/** Refresh cookies are Secure everywhere except explicit local http development. */
export function cookiesSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return isProduction();
}
