/**
 * phase4-gate-review gate (C13 / Wave 5).
 *
 * Criterion 13 of docs/PHASE4-CLOSURE-GATE.md may not be a self-certified PASS.
 * This checker is fail-closed:
 *
 *  - a GATE_REVIEW_phase-4-YYYY-MM-DD.md must exist;
 *  - the latest-dated file must carry YAML front-matter `verdict: PASS`;
 *  - every Section 10 row (1..13) must name a GitHub Actions run URL;
 *  - F01 is restated: no presence claim may be signed off on a source grep.
 *
 * Exit 0 = the independent review is present and complete. Anything else is red.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const FILE_RE = /^GATE_REVIEW_phase-4-(\d{4}-\d{2}-\d{2})\.md$/;
const CRITERION_RE = /^\|\s*(\d{1,2})\s*\|/;
const GITHUB_ACTIONS_HOST = "github.com";
const ACTIONS_RUN_PATH = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/\d+$/;

function isGithubActionsRunUrl(token: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(token);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname === GITHUB_ACTIONS_HOST &&
    parsed.port === "" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.search === "" &&
    parsed.hash === "" &&
    ACTIONS_RUN_PATH.test(parsed.pathname)
  );
}

function hasActionsRunUrl(line: string): boolean {
  return line.split(/[\s|]+/).some(isGithubActionsRunUrl);
}

export interface GateReviewAudit {
  ok: boolean;
  file: string | null;
  verdict: string | null;
  missingCriteria: number[];
  missingUrls: number[];
  f01: boolean;
  errors: string[];
}

function parseFrontMatter(text: string): Record<string, string> {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (m === null) return {};
  const out: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (kv) out[kv[1] ?? ""] = kv[2] ?? "";
  }
  return out;
}

function latestReview(dir: string): { file: string; date: string } | null {
  if (!existsSync(dir)) return null;
  const hits = readdirSync(dir)
    .map((name) => {
      const m = FILE_RE.exec(name);
      return m ? { file: join(dir, name), date: m[1] ?? "" } : null;
    })
    .filter((x): x is { file: string; date: string } => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return hits[hits.length - 1] ?? null;
}

export function auditPhase4GateReview(root = ROOT): GateReviewAudit {
  const errors: string[] = [];
  const latest = latestReview(join(root, "docs", "gates"));
  if (!latest) {
    return {
      ok: false,
      file: null,
      verdict: null,
      missingCriteria: [...Array(13).keys()].map((i) => i + 1),
      missingUrls: [...Array(13).keys()].map((i) => i + 1),
      f01: false,
      errors: ["no docs/gates/GATE_REVIEW_phase-4-YYYY-MM-DD.md"],
    };
  }

  const text = readFileSync(latest.file, "utf8");
  const fm = parseFrontMatter(text);
  const verdict = (fm.verdict ?? "").trim().toUpperCase();
  if (verdict !== "PASS") {
    errors.push(`front-matter verdict is '${fm.verdict ?? "(missing)"}', need PASS`);
  }

  const f01 =
    /F01/i.test(text) &&
    (/source-text grep/i.test(text) || /source grep/i.test(text) || /grep/i.test(text) && /presence/i.test(text));
  if (!f01) {
    errors.push("review must restate F01: no criterion may be signed off on a source-text grep");
  }

  const seen = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const row = CRITERION_RE.exec(line);
    if (!row) continue;
    const n = Number(row[1]);
    if (n >= 1 && n <= 13) seen.set(n, line);
  }
  const missingCriteria = [...Array(13).keys()].map((i) => i + 1).filter((n) => !seen.has(n));
  const missingUrls = [...seen.entries()]
    .filter(([, line]) => !hasActionsRunUrl(line))
    .map(([n]) => n);
  if (missingCriteria.length > 0) errors.push(`missing criterion rows: ${missingCriteria.join(", ")}`);
  if (missingUrls.length > 0) errors.push(`criterion rows without a GitHub Actions run URL: ${missingUrls.join(", ")}`);

  const rel = relative(root, latest.file).replaceAll("\\", "/");
  return {
    ok: errors.length === 0,
    file: rel,
    verdict: fm.verdict ?? null,
    missingCriteria,
    missingUrls,
    f01,
    errors,
  };
}

function main(): number {
  const result = auditPhase4GateReview();
  if (!result.ok) {
    console.error("phase4-gate-review: FAIL");
    for (const err of result.errors) console.error(`  ${err}`);
    return 1;
  }
  console.log(`phase4-gate-review: PASS (${result.file}, verdict=${result.verdict})`);
  return 0;
}

if (process.argv[1] && /phase4-gate-review\.ts$/.test(process.argv[1].replaceAll("\\", "/"))) {
  process.exit(main());
}
