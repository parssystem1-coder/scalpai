import type { Violation, Rule, RuleContext } from "./lib/types.js";
import { RULES } from "./rules/index.js";

export interface ConformanceResult {
  violations: Violation[];
  rulesRun: number;
}

/** Pure runner — CLI main() wraps this so tests can call it without process side effects. */
export async function runRules(rules: Rule[], ctx: RuleContext): Promise<ConformanceResult> {
  const violations: Violation[] = [];
  for (const rule of rules) {
    violations.push(...(await rule.check(ctx)));
  }
  return { violations, rulesRun: rules.length };
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
  const { violations, rulesRun } = await runRules(RULES, { root });

  if (violations.length === 0) {
    console.log(`Conformance harness: PASS (${rulesRun} rule(s), 0 violations)`);
    process.exit(0);
  }

  console.error(`Conformance harness: FAIL (${violations.length} violation(s))\n`);
  console.error(render(violations));
  process.exit(1);
}

const invoked = process.argv[1] ?? "";
if (invoked.replaceAll("\\", "/").endsWith("tools/conformance/run.ts")) {
  await main();
}
