import { createHash } from "node:crypto";
import { isProduction } from "../common/security.config.js";

/**
 * JWT signing configuration (WEAKNESSES C6/R2 + R12).
 *
 * There is no fallback secret: a missing or weak JWT_SECRET aborts boot. The
 * active secret gets a `kid` derived from its own digest, and JWT_SECRET_PREVIOUS
 * stays verifiable for one rotation window so secrets can be rotated without a
 * synchronized deploy.
 */

const MIN_SECRET_LENGTH = 32;

/** Values that must never reach production, however long they are. */
const FORBIDDEN_IN_PRODUCTION = [/dev_only/i, /change_?me/i, /placeholder/i, /example/i, /\bci_/i];

export interface JwtConfig {
  secret: string;
  previousSecret: string | null;
  kid: string;
  previousKid: string | null;
  issuer: string;
  audience: string;
  accessTtl: string;
}

export function keyId(secret: string): string {
  return createHash("sha256").update(secret).digest("hex").slice(0, 16);
}

function assertUsable(name: string, secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`${name} must be at least ${MIN_SECRET_LENGTH} characters (got ${secret.length})`);
  }
  if (/^(.)\1*$/.test(secret)) {
    throw new Error(`${name} must not be a single repeated character`);
  }
  if (isProduction()) {
    for (const pattern of FORBIDDEN_IN_PRODUCTION) {
      if (pattern.test(secret)) {
        throw new Error(`${name} looks like a development placeholder and is refused in production`);
      }
    }
  }
}

let cached: JwtConfig | null = null;

export function resolveJwtConfig(): JwtConfig {
  if (cached) return cached;

  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("JWT_SECRET is required — the API refuses to boot without an explicit signing secret");
  }
  assertUsable("JWT_SECRET", secret);

  const previousSecret = process.env.JWT_SECRET_PREVIOUS?.trim() ?? null;
  if (previousSecret) {
    assertUsable("JWT_SECRET_PREVIOUS", previousSecret);
    if (previousSecret === secret) {
      throw new Error("JWT_SECRET_PREVIOUS must differ from JWT_SECRET");
    }
  }

  cached = {
    secret,
    previousSecret,
    kid: keyId(secret),
    previousKid: previousSecret ? keyId(previousSecret) : null,
    issuer: process.env.JWT_ISSUER?.trim() ?? "scalpai",
    audience: process.env.JWT_AUDIENCE?.trim() ?? "scalpai-api",
    accessTtl: process.env.JWT_ACCESS_TTL?.trim() ?? "15m",
  };
  return cached;
}

/** Tests mutate env between cases; production never calls this. */
export function resetJwtConfigCache(): void {
  cached = null;
}

/** Key material for anything that must not reuse the raw JWT secret verbatim. */
export function derivedKey(purpose: string): Buffer {
  return createHash("sha256").update(`${resolveJwtConfig().secret}|${purpose}`).digest();
}
