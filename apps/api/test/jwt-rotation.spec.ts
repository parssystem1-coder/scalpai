import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keyId, previousKeyUsable, resetJwtConfigCache, resolveJwtConfig } from "../src/auth/jwt.config.js";

/**
 * WEAKNESSES R12 — secret rotation without a synchronized deploy (ADR-0035).
 *
 * The active key signs, the previous key only verifies, each is addressed by a
 * `kid` derived from the key itself, and the acceptance window has an explicit
 * end — evaluated per verification, so it really does close.
 */

const ACTIVE = "phase3_active_signing_key_long_enough_0123456789";
const PREVIOUS = "phase3_retiring_signing_key_long_enough_987654321";

function clearEnv(): void {
  delete process.env.JWT_SECRET;
  delete process.env.JWT_SECRET_PREVIOUS;
  delete process.env.JWT_SECRET_PREVIOUS_UNTIL;
}

beforeEach(() => {
  resetJwtConfigCache();
  clearEnv();
});

afterEach(() => {
  resetJwtConfigCache();
  clearEnv();
});

describe("jwt key rotation policy", () => {
  it("derives a distinct, stable kid per key", () => {
    process.env.JWT_SECRET = ACTIVE;
    process.env.JWT_SECRET_PREVIOUS = PREVIOUS;
    const cfg = resolveJwtConfig();
    expect(cfg.kid).toBe(keyId(ACTIVE));
    expect(cfg.previousKid).toBe(keyId(PREVIOUS));
    expect(cfg.kid).not.toBe(cfg.previousKid);
  });

  it("keeps the previous key verifiable while no deadline is set", () => {
    process.env.JWT_SECRET = ACTIVE;
    process.env.JWT_SECRET_PREVIOUS = PREVIOUS;
    expect(previousKeyUsable(resolveJwtConfig())).toBe(true);
  });

  it("stops accepting the previous key once the window closes", () => {
    process.env.JWT_SECRET = ACTIVE;
    process.env.JWT_SECRET_PREVIOUS = PREVIOUS;
    process.env.JWT_SECRET_PREVIOUS_UNTIL = new Date(Date.now() + 60_000).toISOString();
    const cfg = resolveJwtConfig();
    expect(previousKeyUsable(cfg)).toBe(true);
    expect(previousKeyUsable(cfg, new Date(Date.now() + 120_000))).toBe(false);
  });

  it("refuses an unparseable deadline instead of ignoring it", () => {
    process.env.JWT_SECRET = ACTIVE;
    process.env.JWT_SECRET_PREVIOUS = PREVIOUS;
    process.env.JWT_SECRET_PREVIOUS_UNTIL = "whenever";
    expect(() => resolveJwtConfig()).toThrow(/ISO-8601/);
  });

  it("refuses a previous key identical to the active one", () => {
    process.env.JWT_SECRET = ACTIVE;
    process.env.JWT_SECRET_PREVIOUS = ACTIVE;
    expect(() => resolveJwtConfig()).toThrow(/must differ/);
  });

  it("has no previous key at all once the env var is removed (rotation complete)", () => {
    process.env.JWT_SECRET = ACTIVE;
    const cfg = resolveJwtConfig();
    expect(cfg.previousSecret).toBeNull();
    expect(cfg.previousKid).toBeNull();
    expect(previousKeyUsable(cfg)).toBe(false);
  });
});
