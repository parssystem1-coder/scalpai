import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { auditPhase4GateReview } from "./phase4-gate-review.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function review(body: string): string {
  const root = mkdtempSync(join(tmpdir(), "p4-gate-"));
  mkdirSync(join(root, "docs", "gates"), { recursive: true });
  writeFileSync(join(root, "docs", "gates", "GATE_REVIEW_phase-4-2026-09-22.md"), body, "utf8");
  return root;
}

const CI_RUN = "https://github.com/parssystem1-coder/scalpai/actions/runs/35779837690";

function rows(withUrl: boolean): string {
  return [...Array(13).keys()]
    .map((i) => `| ${i + 1} | criterion ${i + 1} | PASS | ${withUrl ? CI_RUN : "local grep"} |`)
    .join("\n");
}

describe("phase4-gate-review (C13)", () => {
  it("fails when no GATE_REVIEW_phase-4 file exists", () => {
    const root = mkdtempSync(join(tmpdir(), "p4-empty-"));
    mkdirSync(join(root, "docs", "gates"), { recursive: true });
    const result = auditPhase4GateReview(root);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/no docs\/gates/);
  });

  it("fails a self-certified PASS without per-row CI URLs or F01", () => {
    const root = review(`---\nverdict: PASS\n---\n\n| # | Criterion | Status |\n${rows(false)}\n`);
    const result = auditPhase4GateReview(root);
    expect(result.ok).toBe(false);
    expect(result.missingUrls).toHaveLength(13);
  });

  it("passes a review with PASS, F01 restatement and a CI URL per row", () => {
    const root = review(
      `---\nverdict: PASS\n---\n\nF01: no criterion may be signed off on a source-text grep.\n\n| # | Criterion | Status | Evidence |\n${rows(true)}\n`,
    );
    const result = auditPhase4GateReview(root);
    expect(result.ok).toBe(true);
    expect(result.verdict).toBe("PASS");
    expect(result.f01).toBe(true);
    expect(result.missingCriteria).toEqual([]);
    expect(result.missingUrls).toEqual([]);
  });

  it("accepts the committed Phase 4 GATE_REVIEW on this tree", () => {
    const result = auditPhase4GateReview(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.verdict).toBe("PASS");
    expect(result.file).toMatch(/^docs\/gates\/GATE_REVIEW_phase-4-\d{4}-\d{2}-\d{2}\.md$/);
  });
});
