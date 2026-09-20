import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { login } from "./helpers/session.js";

/**
 * @perf — hologram time-to-first-rendered-frame (Phase 4 C12/F20, wave 4).
 *
 * HologramSection opens the `hologram:mount:start` mark before the lazy 3D
 * chunk is requested; LuxuryScalp3D closes `hologram:ttfr` after its first
 * real renderer.render(). This spec is the behavioural half of the
 * `perf-baseline` gate: the measurement must EXIST (a silent marks module can
 * never pass) and must stay under the committed baseline plus its regression
 * tolerance - exactly how tools/bundle-budget.policy.json is judged.
 *
 * The ceiling is intentionally read from the committed baseline, never from an
 * environment variable a step could raise.
 *
 * tsconfig.repo.json type-checks this file with the node lib only (no DOM
 * lib), so no DOM global is named at module scope; the browser is reached
 * through page.evaluate.
 */
const ROOT = fileURLToPath(new URL("..", import.meta.url));

interface HologramTtfrBaseline {
  schemaVersion: number;
  metric: string;
  valueMs: number;
  regressionTolerance: number;
}

const baseline = JSON.parse(
  readFileSync(join(ROOT, "tools", "perf", "hologram-ttfr.baseline.json"), "utf8"),
) as HologramTtfrBaseline;

const CEILING_MS = baseline.valueMs * (1 + baseline.regressionTolerance);

interface TtfrEntry {
  name: string;
  duration: number;
}

test("@perf hologram first rendered frame lands under the committed baseline", async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);

  // The hologram section mounts last on the dashboard - scroll it into view so
  // the lazy chunk is actually requested and rendered.
  const section = page.locator("#section-3d-model");
  await section.scrollIntoViewIfNeeded();
  await section.getByRole("status").waitFor({ state: "detached", timeout: 30_000 }).catch(() => {
    // Suspense fallback may already be gone by the time we look - the canvas
    // assertion below is the real proof.
  });
  await expect(section.locator("canvas").first()).toBeVisible({ timeout: 30_000 });

  const entries = (await page.evaluate(() =>
    performance.getEntriesByName("hologram:ttfr").map((e) => ({ name: e.name, duration: e.duration })),
  )) as TtfrEntry[];

  // The marks must exist: a silently disabled measurement can never pass.
  expect(entries.length).toBeGreaterThanOrEqual(1);

  const measured = Math.min(...entries.map((e) => e.duration));
  console.log(`[perf] hologram ttfr ${Math.round(measured)}ms (baseline ${baseline.valueMs}ms + ${baseline.regressionTolerance * 100}%)`);

  expect(measured).toBeGreaterThan(0);
  expect(measured).toBeLessThanOrEqual(CEILING_MS);
});
