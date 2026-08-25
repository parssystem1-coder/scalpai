import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { runRules } from "./run.js";
import { RULES } from "./rules/index.js";
import type { Rule, Violation } from "./lib/types.js";

describe("conformance harness scaffold", () => {
  it("passes with the empty phase-0 registry", async () => {
    const res = await runRules(RULES, { root: process.cwd() });
    expect(res.rulesRun).toBe(0);
    expect(res.violations).toEqual([]);
  });

  it("collects violations from a failing rule (proves the runner, not just the empty case)", async () => {
    const bad: Violation = {
      rule: "demo",
      file: "x.ts",
      message: "demo violation",
      fix: "fix it",
    };
    const demoRule: Rule = {
      name: "demo",
      source: "test",
      check: () => [bad],
    };
    const res = await runRules([demoRule], { root: join(process.cwd(), "tools") });
    expect(res.rulesRun).toBe(1);
    expect(res.violations).toHaveLength(1);
    expect(res.violations[0]?.rule).toBe("demo");
  });
});
