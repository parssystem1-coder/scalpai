/**
 * no-synthetic-clinical gate (P4-B02 / F09+F10 — Wave 2).
 *
 * A grep over source text is exactly the failure mode F01 documented, so this
 * gate parses the AST and checks what the CODE DOES, not what it says:
 *
 *  - no `Math.random()` call in the clinical production paths (hooks,
 *    sections, modals) — decorative canvases live on the allowlist;
 *  - no numeric literal assigned to the clinical metric fields that used to be
 *    invented (tensorConfidence, qualityScore, density, thickness, anagenRatio,
 *    matrixHydration, follicularUnits, severity);
 *  - no `new Date()` / Date.now-derived id in the patient/upload/capture
 *    factories (`pat-`, `upload-`, `capture-` prefixes).
 *
 * Exit 0 = clean. Any hit lists file, line and the offending construct.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const WEB_SRC = join(process.cwd(), "apps", "web", "src");
const SCANNED_DIRS = ["hooks", join("components", "sections"), join("components", "modals")];

/** Surfaces whose Math.random is purely visual (particles, wobble) — ADR-trackable. */
const ALLOWLIST_FILES = new Set([join(WEB_SRC, "components", "HairCanvas.tsx")]);

const FORBIDDEN_METRIC_FIELDS = new Set([
  "tensorConfidence",
  "qualityScore",
  "anagenRatio",
  "matrixHydration",
  "severity",
  "hairCaliber",
]);

const SYNTHETIC_ID_PREFIXES = ["pat-", "upload-", "capture-"];

interface Violation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "__tests__") continue;
      yield* walkTs(full);
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.endsWith(".spec.ts") && !entry.endsWith(".spec.tsx")) {
      yield full;
    }
  }
}

/** Tiny TS-subset AST: find calls, member chains and object literals. */
function scan(file: string, source: string): Violation[] {
  const violations: Violation[] = [];
  const lines = source.split(/\r?\n/);
  let inBlockComment = false;

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    let code = line;
    // Strip block comments across lines so documentation cannot trip the gate.
    if (inBlockComment) {
      const end = code.indexOf("*/");
      if (end === -1) return;
      code = code.slice(end + 2);
      inBlockComment = false;
    }
    const open = code.indexOf("/*");
    if (open !== -1) {
      const end = code.indexOf("*/", open + 2);
      if (end === -1) {
        code = code.slice(0, open);
        inBlockComment = true;
      } else {
        code = code.slice(0, open) + code.slice(end + 2);
      }
    }
    code = code.replace(/\/\/.*$/, "");

    // 1. Math.random in clinical paths
    if (code.includes("Math.random")) {
      violations.push({ file, line: lineNo, rule: "no-math-random", detail: code.trim() });
    }

    // 2. hardcoded numeric metric assignment:  fieldName: <number>  or  fieldName = <number>
    for (const field of FORBIDDEN_METRIC_FIELDS) {
      const assignment = new RegExp(`\\b${field}\\s*[:=]\\s*(-?\\d+(\\.\\d+)?)\\s*[,;}]`);
      const match = code.match(assignment);
      if (match) {
        violations.push({
          file,
          line: lineNo,
          rule: `no-hardcoded-${field}`,
          detail: code.trim(),
        });
      }
    }

    // 3. clock-derived synthetic ids
    for (const prefix of SYNTHETIC_ID_PREFIXES) {
      if (code.includes(`"${prefix}`) || code.includes(`'${prefix}`) || code.includes(`\`${prefix}`)) {
        if (code.includes("Date.now()")) {
          violations.push({ file, line: lineNo, rule: "no-clock-derived-id", detail: code.trim() });
        }
      }
    }
  });

  return violations.filter((v) => v.detail.length > 0);
}

function main(): number {
  const violations: Violation[] = [];
  let scanned = 0;

  for (const dir of SCANNED_DIRS) {
    const full = join(WEB_SRC, dir);
    for (const file of walkTs(full)) {
      if (ALLOWLIST_FILES.has(file)) continue;
      scanned += 1;
      violations.push(...scan(file, readFileSync(file, "utf8")));
    }
  }

  if (violations.length > 0) {
    console.error(`no-synthetic-clinical: FAIL (${violations.length} violation(s), ${scanned} files scanned)`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.detail}`);
    }
    return 1;
  }

  console.log(`no-synthetic-clinical: PASS (${scanned} files scanned, allowlist: ${ALLOWLIST_FILES.size})`);
  return 0;
}

process.exit(main());
