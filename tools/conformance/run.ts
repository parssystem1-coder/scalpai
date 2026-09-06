import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Violation, Rule, RuleContext } from "./lib/types.js";
import { RULES } from "./rules/index.js";

export interface ConformanceResult {
  violations: Violation[];
  rulesRun: number;
  suppressed: number;
}

/**
 * ADR-21: an exception is only legitimate with an ADR reference. Entries
 * without a valid `adr` field abort the build instead of being ignored.
 */
export interface ExceptionEntry {
  rule?: string;
  file?: string;
  adr: string;
  reason?: string;
  since?: string;
}

const ADR_RE = /^ADR-\d{3,4}$/;

export function loadExceptions(root: string, path = join("tools", "conformance", "exceptions.json")): ExceptionEntry[] {
  const full = join(root, path);
  if (!existsSync(full)) return [];
  const parsed: unknown = JSON.parse(readFileSync(full, "utf8"));
  const arr = Array.isArray((parsed as { exceptions?: unknown }).exceptions) ? (parsed as { exceptions: unknown[] }).exceptions : [];
  return arr.map((e) => {
    const entry = e as ExceptionEntry;
    if (!entry.adr || !ADR_RE.test(entry.adr)) {
      throw new Error(`conformance exception without valid ADR ref (${ADR_RE.source}): ${JSON.stringify(entry)}`);
    }
    return entry;
  });
}

export function applyExceptions(violations: Violation[], exceptions: ExceptionEntry[]): { kept: Violation[]; suppressed: number } {
  const kept = violations.filter(
    (v) =>
      !exceptions.some(
        (e) => (!e.rule || e.rule === v.rule) && (!e.file || v.file === e.file || v.file.startsWith(`${e.file}:`) || v.file.startsWith(e.file)),
      ),
  );
  return { kept, suppressed: violations.length - kept.length };
}

/** Pure runner — CLI main() wraps this so tests can call it without process side effects. */
export async function runRules(rules: Rule[], ctx: RuleContext): Promise<ConformanceResult> {
  const raw: Violation[] = [];
  for (const rule of rules) {
    raw.push(...(await rule.check(ctx)));
  }
  const { kept, suppressed } = applyExceptions(raw, loadExceptions(ctx.root));
  return { violations: kept, rulesRun: rules.length, suppressed };
}

function render(violations: Violation[]): string {
  const lines: string[] = [];
  for (const v of violations) {
    lines.push(`[${v.rule}] ${v.file}`);
    lines.push(`  ${v.message}`);
    lines.push(`  fix: ${v.fix}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const root = process.cwd();
  let result: ConformanceResult;
  try {
    result = await runRules(RULES, { root });
  } catch (err) {
    console.error(`Conformance harness: ABORT — ${(err as Error).message}`);
    process.exit(2);
  }

  if (result.violations.length === 0) {
    const sup = result.suppressed > 0 ? `, ${result.suppressed} suppressed via ADR exceptions` : "";
    console.log(`Conformance harness: PASS (${result.rulesRun} rule(s), 0 violations${sup})`);
    process.exit(0);
  }

  console.error(`Conformance harness: FAIL (${result.violations.length} violation(s))\n`);
  console.error(render(result.violations));
  process.exit(1);
}

const invoked = process.argv[1] ?? "";
if (invoked.replaceAll("\\", "/").endsWith("tools/conformance/run.ts")) {
  await main();
}
