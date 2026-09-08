import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Gate report (WEAKNESSES L1/W23, ADR-0037).
 *
 * A gate is only PASSED when tools/ci/run-gate.sh recorded the command it ran,
 * its output and `exit=0`. This module reads those logs and refuses to report
 * success when one is missing, truncated or non-zero - which is what makes a
 * "self-certified PASS" impossible: nobody can claim a gate that never ran.
 */

export interface GateEvidence {
  gate: string;
  command: string;
  commit: string;
  exit: number | null;
  file: string;
}

/** Every gate the CI workflow must produce evidence for. Keep in sync with .github/workflows/ci.yml. */
export const REQUIRED_GATES = [
  "lockfile",
  "typecheck",
  "lint",
  "db-migrate",
  "db-seed",
  "test-coverage",
  "build",
  "bundle-budget",
  "conformance",
  "graph",
  "audit",
  "secret-scan",
  "e2e-smoke",
  "compose-config",
  "compose-secrets-negative",
  "docker-build",
  "image-scan",
  "stack-boot",
  "migrate-once",
  "api-health",
  // Phase 9 (C10/ADR-0042): the backup pipeline is proven by running it and
  // restoring from it, not by reading a cron log.
  "backup-image",
  "backup-run",
  "backup-offsite",
  "restore-drill",
] as const;

/**
 * The subset a scheduled restore drill has to produce (nightly + the monthly
 * staging run). It deliberately omits the image build: a drill proves recovery,
 * not packaging.
 */
export const DRILL_GATES = ["backup-run", "backup-offsite", "restore-drill"] as const;

export const GATE_SETS: Record<string, readonly string[]> = {
  ci: REQUIRED_GATES,
  drill: DRILL_GATES,
};

export type GateStatus = "pass" | "fail" | "missing";

export interface GateRow {
  gate: string;
  status: GateStatus;
  exit: number | null;
  command: string;
}

export interface GateAudit {
  ok: boolean;
  rows: GateRow[];
  missing: string[];
  failed: string[];
  /** Logs found that no required gate asked for - reported, never fatal. */
  extra: string[];
}

function field(text: string, key: string): string | null {
  const m = new RegExp(`^${key}=(.*)$`, "m").exec(text);
  return m ? m[1]!.trim() : null;
}

export function parseEvidence(file: string, text: string): GateEvidence {
  const exitRaw = field(text, "exit");
  const parsed = exitRaw === null ? Number.NaN : Number(exitRaw);
  return {
    gate: field(text, "gate") ?? basename(file).replace(/\.log$/, ""),
    command: field(text, "command") ?? "",
    commit: field(text, "commit") ?? "unknown",
    exit: Number.isFinite(parsed) ? parsed : null,
    file,
  };
}

/** Collects every *.log below `dir` (artifacts may land in per-job subfolders). */
export function collectEvidence(dir: string): GateEvidence[] {
  const out: GateEvidence[] = [];
  const walk = (current: string): void => {
    // M19: the catch branch returns, so the `= []` initialiser this used to
    // carry was never read (no-useless-assignment).
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".log")) {
        try {
          out.push(parseEvidence(full, readFileSync(full, "utf8")));
        } catch {
          // Ignore unreadable files
        }
      }
    }
  };
  walk(dir);
  return out;
}

export function auditGates(dir: string, required: readonly string[] = REQUIRED_GATES): GateAudit {
  const evidence = collectEvidence(dir);
  const byGate = new Map<string, GateEvidence>();
  for (const e of evidence) {
    const known = byGate.get(e.gate);
    // a re-run that failed must never be masked by an earlier green log
    if (!known || (known.exit === 0 && e.exit !== 0)) byGate.set(e.gate, e);
  }

  const rows: GateRow[] = [];
  const missing: string[] = [];
  const failed: string[] = [];
  for (const gate of required) {
    const e = byGate.get(gate);
    if (!e || !e.command) {
      rows.push({ gate, status: "missing", exit: null, command: e?.command ?? "" });
      missing.push(gate);
      continue;
    }
    const status: GateStatus = e.exit === 0 ? "pass" : "fail";
    if (status === "fail") failed.push(gate);
    rows.push({ gate, status, exit: e.exit, command: e.command });
  }
  const extra = [...byGate.keys()].filter((g) => !required.includes(g)).sort();
  return { ok: missing.length === 0 && failed.length === 0, rows, missing, failed, extra };
}

export function renderTable(rows: GateRow[]): string {
  const lines = ["| gate | status | exit | command |", "|---|---|---|---|"];
  for (const r of rows) {
    const icon = r.status === "pass" ? "PASS" : r.status === "fail" ? "FAIL" : "MISSING";
    lines.push(`| \`${r.gate}\` | ${icon} | ${r.exit ?? "-"} | \`${r.command || "(no command recorded)"}\` |`);
  }
  return lines.join("\n");
}

/** `gate-report.ts [dir] [--set=ci|drill]` */
export function parseArgs(argv: readonly string[]): { dir: string; set: string } {
  const set = argv.find((a) => a.startsWith("--set="))?.slice("--set=".length) ?? "ci";
  const dir = argv.find((a) => !a.startsWith("--")) ?? process.env.CI_EVIDENCE_DIR ?? "ci-evidence";
  return { dir, set };
}

function main(): void {
  const { dir, set } = parseArgs(process.argv.slice(2));
  const required = GATE_SETS[set];
  if (!required) {
    console.error(`unknown gate set '${set}' (known: ${Object.keys(GATE_SETS).join(", ")})`);
    process.exit(2);
  }
  const result = auditGates(dir, required);
  const table = renderTable(result.rows);
  console.log(`Gate report (${set}) from ${dir}\n`);
  console.log(table);
  if (result.extra.length > 0) console.log(`\nextra evidence (not required): ${result.extra.join(", ")}`);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(
      summary,
      `## Gate report (${set})\n\n${table}\n\n${result.ok ? "All required gates ran and passed." : "Missing or failed gates - see above."}\n`,
      "utf8",
    );
  }

  if (!result.ok) {
    if (result.missing.length > 0) console.error(`\nno evidence for: ${result.missing.join(", ")}`);
    if (result.failed.length > 0) console.error(`failed gates: ${result.failed.join(", ")}`);
    console.error("\nGate report: FAIL - a PASS requires a recorded command log with exit=0 for every gate.");
    process.exit(1);
  }
  console.log(`\nGate report: PASS (${result.rows.length} gates, all with a recorded command log and exit=0)`);
}

const invoked = (process.argv[1] ?? "").replaceAll("\\", "/");
if (invoked.endsWith("tools/ci/gate-report.ts")) {
  main();
}
