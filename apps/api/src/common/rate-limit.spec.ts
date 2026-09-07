import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { DEFAULT_LIMIT, GLOBAL_LIMIT, RateLimitGuard, resolveLimit } from "./rate-limit.guard.js";
import type { StateStore } from "./state/state.store.js";

/**
 * Phase 9 regression (L4). The limiter used to apply ONLY to the four decorated
 * routes; everything else - patients, consents, anything added later - had no
 * ceiling. These tests pin the two layers that fixed it.
 */

class FakeState {
  hits = new Map<string, number>();
  key(...parts: string[]): string {
    return ["ns", ...parts].join(":");
  }
  tenantKey(clinicId: string, ...parts: string[]): string {
    return this.key("t", clinicId, ...parts);
  }
  async hit(key: string): Promise<number> {
    const next = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, next);
    return next;
  }
}

function contextWith(declared: unknown): { context: ExecutionContext; reflector: Reflector } {
  const context = {
    getType: () => "http",
    getHandler: () => () => undefined,
    getClass: () => class Anything {},
    switchToHttp: () => ({ getRequest: () => ({ ip: "203.0.113.9" }) }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: () => declared } as unknown as Reflector;
  return { context, reflector };
}

const ENV_KEYS = [
  "RATE_LIMIT_DEFAULT_MAX",
  "RATE_LIMIT_GLOBAL_MAX",
  "RATE_LIMIT_DEFAULT_WINDOW_MS",
  "RATE_LIMIT_GLOBAL_WINDOW_MS",
];

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("L4 - every route has a budget, not just the decorated ones", () => {
  it("limits an undecorated route through the default bucket", async () => {
    process.env.RATE_LIMIT_DEFAULT_MAX = "2";
    const state = new FakeState();
    const { context, reflector } = contextWith(undefined);
    const guard = new RateLimitGuard(reflector, state as unknown as StateStore);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toThrow(/default/);
  });

  it("keys the pre-auth bucket by a digest of the IP, never the IP itself", async () => {
    const state = new FakeState();
    const { context, reflector } = contextWith(undefined);
    await new RateLimitGuard(reflector, state as unknown as StateStore).canActivate(context);
    const keys = [...state.hits.keys()];
    expect(keys.some((k) => k.includes("rl:default:ip:"))).toBe(true);
    expect(keys.join(" ")).not.toContain("203.0.113.9");
  });

  it("enforces one global ceiling across tenants", async () => {
    process.env.RATE_LIMIT_GLOBAL_MAX = "1";
    const state = new FakeState();
    const { context, reflector } = contextWith(undefined);
    const guard = new RateLimitGuard(reflector, state as unknown as StateStore);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    await expect(guard.canActivate(context)).rejects.toThrow(/global/);
  });

  it("lets a probe opt out of both layers with max = 0", async () => {
    process.env.RATE_LIMIT_GLOBAL_MAX = "1";
    const state = new FakeState();
    const { context, reflector } = contextWith({ name: "ops-probe", max: 0 });
    const guard = new RateLimitGuard(reflector, state as unknown as StateStore);
    for (let i = 0; i < 5; i++) await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(state.hits.size).toBe(0);
  });

  it("reads its ceilings from the environment, with the code default as fallback", () => {
    expect(resolveLimit(DEFAULT_LIMIT)).toEqual({ max: 600, windowMs: 60_000 });
    expect(resolveLimit(GLOBAL_LIMIT).max).toBe(5_000);
    process.env.RATE_LIMIT_GLOBAL_MAX = "120";
    expect(resolveLimit(GLOBAL_LIMIT).max).toBe(120);
  });
});
