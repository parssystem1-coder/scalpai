// @vitest-environment node
//
// C12/F20: the committed hologram:ttfr baseline is the ceiling the @perf e2e
// judges the live measurement against. A malformed baseline must fail at parse
// time - never pass vacuously, never silently loosen the ceiling. The same
// fail-closed contract tools/bundle-budget.policy.json enforces (M15b).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BASELINE_PATH = "tools/perf/hologram-ttfr.baseline.json";

interface HologramTtfrBaseline {
  schemaVersion: number;
  metric: string;
  valueMs: number;
  regressionTolerance: number;
  environment: string;
  provenance: string;
  updatedAt: string;
}

describe("hologram ttfr baseline (C12/F20)", () => {
  const raw = JSON.parse(readFileSync(join(ROOT, BASELINE_PATH), "utf8")) as HologramTtfrBaseline;

  it("carries the current schema and the metric the marks module emits", () => {
    expect(raw.schemaVersion).toBe(1);
    expect(raw.metric).toBe("hologram:ttfr");
  });

  it("has a positive integer ceiling", () => {
    expect(Number.isInteger(raw.valueMs)).toBe(true);
    expect(raw.valueMs).toBeGreaterThan(0);
  });

  it("tolerance stays inside [0, 1) - the ceiling can never be silently widened away", () => {
    expect(raw.regressionTolerance).toBeGreaterThanOrEqual(0);
    expect(raw.regressionTolerance).toBeLessThan(1);
  });
});
