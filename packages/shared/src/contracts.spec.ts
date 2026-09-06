import { describe, expect, it } from "vitest";
import { PLAN_LIMIT_MAX, PLAN_PRICE_MAX, PlanUpsert } from "./contracts.js";

/** WEAKNESSES C4 — plan limits/price schema hardening (integer, min 0, capped). */
describe("PlanUpsert limits", () => {
  const base = { code: "growth_plus", name: { fa: "رشد", en: "Growth" }, price: 12_900_000 };

  it("parses a valid plan and fills defaults", () => {
    const parsed = PlanUpsert.parse(base);
    expect(parsed.interval).toBe("month");
    expect(parsed.features).toEqual([]);
    expect(parsed.limits).toEqual({});
  });

  it("accepts integer limits at the boundaries", () => {
    const parsed = PlanUpsert.parse({ ...base, limits: { monthly_sessions: 0, storage_mb: PLAN_LIMIT_MAX } });
    expect(parsed.limits.storage_mb).toBe(PLAN_LIMIT_MAX);
  });

  it("rejects negative, fractional and overflowing limits", () => {
    expect(PlanUpsert.safeParse({ ...base, limits: { monthly_sessions: -1 } }).success).toBe(false);
    expect(PlanUpsert.safeParse({ ...base, limits: { monthly_sessions: 2.5 } }).success).toBe(false);
    expect(PlanUpsert.safeParse({ ...base, limits: { storage_mb: PLAN_LIMIT_MAX + 1 } }).success).toBe(false);
    expect(PlanUpsert.safeParse({ ...base, limits: { storage_mb: Number.MAX_SAFE_INTEGER } }).success).toBe(false);
  });

  it("rejects a price beyond numeric(12,0) and non-integer prices", () => {
    expect(PlanUpsert.safeParse({ ...base, price: PLAN_PRICE_MAX + 1 }).success).toBe(false);
    expect(PlanUpsert.safeParse({ ...base, price: -5 }).success).toBe(false);
    expect(PlanUpsert.safeParse({ ...base, price: 1.5 }).success).toBe(false);
  });

  it("still rejects malformed plan codes", () => {
    expect(PlanUpsert.safeParse({ ...base, code: "Bad-Code" }).success).toBe(false);
  });
});
