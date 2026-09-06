import { describe, expect, it } from "vitest";
import { PLAN_LIMIT_MAX, PLAN_PRICE_MAX, validatePlanInput } from "./plans-admin.js";

/**
 * WEAKNESSES C4 — the platform catalog validator. Limits must be non-negative
 * integers with a hard ceiling so a bad value can neither overflow the bigint
 * usage counters nor silently switch a quota off.
 */
describe("validatePlanInput (platform catalog)", () => {
  const base = { code: "pro_plan", name: { fa: "حرفه‌ای", en: "Pro" }, price: 9_900_000 };

  it("accepts a well-formed plan and applies defaults", () => {
    const plan = validatePlanInput(base);
    expect(plan.interval).toBe("month");
    expect(plan.features).toEqual([]);
    expect(plan.limits).toEqual({});
  });

  it("keeps integer limits inside the ceiling", () => {
    const plan = validatePlanInput({ ...base, limits: { monthly_sessions: 0, storage_mb: PLAN_LIMIT_MAX } });
    expect(plan.limits.monthly_sessions).toBe(0);
    expect(plan.limits.storage_mb).toBe(PLAN_LIMIT_MAX);
  });

  it("rejects negative limits", () => {
    expect(() => validatePlanInput({ ...base, limits: { monthly_sessions: -1 } })).toThrow(/limit/);
  });

  it("rejects fractional limits", () => {
    expect(() => validatePlanInput({ ...base, limits: { monthly_sessions: 1.5 } })).toThrow(/limit/);
  });

  it("rejects limits above the ceiling (overflow guard)", () => {
    expect(() => validatePlanInput({ ...base, limits: { storage_mb: PLAN_LIMIT_MAX + 1 } })).toThrow(/limit/);
    expect(() => validatePlanInput({ ...base, limits: { storage_mb: Number.MAX_SAFE_INTEGER } })).toThrow(/limit/);
  });

  it("rejects non-numeric limits", () => {
    expect(() => validatePlanInput({ ...base, limits: { storage_mb: "1000" } })).toThrow(/limit/);
  });

  it("rejects a price that would overflow numeric(12,0)", () => {
    expect(() => validatePlanInput({ ...base, price: PLAN_PRICE_MAX + 1 })).toThrow(/price/);
    expect(() => validatePlanInput({ ...base, price: -1 })).toThrow(/price/);
    expect(() => validatePlanInput({ ...base, price: 10.5 })).toThrow(/price/);
  });

  it("rejects malformed codes, names, intervals and features", () => {
    expect(() => validatePlanInput({ ...base, code: "BAD CODE" })).toThrow(/plan code/);
    expect(() => validatePlanInput({ ...base, name: {} })).toThrow(/locale/);
    expect(() => validatePlanInput({ ...base, name: { fa: 42 } })).toThrow(/locale/);
    expect(() => validatePlanInput({ ...base, interval: "week" })).toThrow(/interval/);
    expect(() => validatePlanInput({ ...base, features: [""] })).toThrow(/feature/);
    expect(() => validatePlanInput(null)).toThrow(/object/);
  });
});
