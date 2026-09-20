import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Rule, RuleContext, Violation } from "../lib/types.js";
import { readRoot } from "../lib/walk.js";

/**
 * C7 / wave 4 (P4-B07) - doc-status-consistency.
 *
 * Phase 4 nearly shipped with docs claiming mutually exclusive things:
 * WEAKNESSES ticked phases the gate document listed as FAIL and the Roadmap's
 * Success Checklist contradicted its own Phase 4 section. Prose is reviewed by
 * humans; this rule makes the contradiction itself machine-checkable.
 *
 * Mechanism (grep is the right tool here because status claims are ABSENCE
 * rules, exactly like the no-dir="rtl" walk - docs/PHASE4-REMEDIATION-PLAN.md
 * section 5):
 *
 *   1. The gate document declares the mandatory [ ] checkboxes per phase id.
 *   2. Every other ledger doc may only claim [x] for a phase the gate
 *      document also marks [x]; the gate document's own claims are exempt
 *      because it IS the ledger (F01: a self-signed claim still needs a
 *      criterion row pointing at evidence).
 *   3. An allowlist file (same directory, JSON with ADR refs, validated like
 *      exceptions.json) carries decisions the ledger has not caught up with.
 *
 * SCOPE IS A RATCHET like the persian-literals rule: status claims are only
 * read from the ledger docs below; adding a file is deliberate, never
 * accidental.
 */

const RULE_NAME = "doc-status-consistency";
const FIXTURE_DIR = "tools/conformance/fixtures";
const ALLOWLIST = "tools/conformance/doc-status-allowlist.json";

/** Ledger docs whose [x] claims must agree with the gate document. */
const STATUS_DOCS = [
  "docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md",
  "docs/PROGRESS.md",
  "docs/WEAKNESSES-V2-10-PHASES.md",
];

/** The gate document - the ledger. Its own claims are not cross-checked. */
const GATE_DOC = "docs/PHASE4-CLOSURE-GATE.md";

/** `# heading` or `## heading` lines, lowercased for matching. */
const HEADING = /^#{1,4}\s+(.*)$/;

/** A Markdown checkbox in either state, captured with its line text. */
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/;

/** Phase id like "Phase 4", "فاز 4", "M5", "L2", "Slice M4", "Wave 3". */
const PHASE_TOKEN = /\b(phase|فاز|slice|wave|موج)\s*#?(\d{1,2})\b|\b([MLW]\d{1,2}[a-z]?)\b/i;

interface PhaseId {
  /** Canonical form, e.g. "phase-4", "m5", "l2". */
  key: string;
  display: string;
}

function parsePhaseId(text: string): PhaseId | null {
  const m = PHASE_TOKEN.exec(text);
  if (m === null) return null;
  if (m[3] !== undefined) return { key: m[3].toLowerCase(), display: m[3] };
  const kind = m[1] ?? "";
  const num = m[2] ?? "";
  if (kind.toLowerCase() === "phase" || kind === "فاز") return { key: `phase-${num}`, display: `Phase ${num}` };
  if (kind.toLowerCase() === "slice") return { key: `m${num}`, display: `Slice M${num}` };
  if (kind.toLowerCase() === "wave" || kind === "موج") return { key: `wave-${num}`, display: `Wave ${num}` };
  return null;
}

interface CheckEntry {
  line: number;
  done: boolean;
  phase: PhaseId;
}

interface DocScan {
  /** [x] claims per canonical phase id. */
  claims: Map<string, CheckEntry[]>;
  exists: boolean;
}

function scanDoc(root: string, rel: string): DocScan {
  const out: Map<string, CheckEntry[]> = new Map();
  if (!existsSync(join(root, rel))) return { claims: out, exists: false };

  let heading = "";
  readRoot(root, rel)
    .split("\n")
    .forEach((line, i) => {
      const h = HEADING.exec(line);
      if (h !== null) {
        heading = h[1] ?? "";
        return;
      }
      const cb = CHECKBOX.exec(line);
      if (cb === null) return;
      const context = `${heading} ${cb[2] ?? ""}`;
      const phase = parsePhaseId(context);
      if (phase === null) return;
      const list = out.get(phase.key) ?? [];
      list.push({ line: i + 1, done: (cb[1] ?? " ").toLowerCase() === "x", phase });
      out.set(phase.key, list);
    });
  return { claims: out, exists: true };
}

/**
 * Allowlist entries mirror exceptions.json: rule + file + ADR, validated the
 * same way so a stale exemption cannot ride along silently.
 */
interface AllowlistEntry {
  phase: string;
  file: string;
  adr: string;
  reason?: string;
}

const ADR_RE = /^ADR-\d{3,4}$/;

function loadAllowlist(root: string): AllowlistEntry[] {
  const full = join(root, ALLOWLIST);
  if (!existsSync(full)) return [];
  const parsed: unknown = JSON.parse(readRoot(root, ALLOWLIST));
  const arr = Array.isArray((parsed as { allowlist?: unknown }).allowlist)
    ? ((parsed as { allowlist: unknown[] }).allowlist)
    : [];
  return arr.map((e) => {
    const entry = e as AllowlistEntry;
    if (!entry.adr || !ADR_RE.test(entry.adr)) {
      throw new Error(`doc-status-consistency allowlist entry without valid ADR ref (${ADR_RE.source}): ${JSON.stringify(entry)}`);
    }
    return entry;
  });
}

/** Pure scan, so the fixture self-test and the regression suite can call it. */
export function scanDocStatus(root: string): Violation[] {
  const out: Violation[] = [];
  const gate = scanDoc(root, GATE_DOC);
  if (!gate.exists) {
    // No gate document = nothing to agree with. The gate job enforces the
    // document's existence; this rule only cross-checks claims.
    return out;
  }

  let allowlist: AllowlistEntry[] = [];
  try {
    allowlist = loadAllowlist(root);
  } catch (err) {
    out.push({
      rule: RULE_NAME,
      file: ALLOWLIST,
      message: (err as Error).message,
      fix: "give every allowlist entry an adr field matching ADR-\\d{3,4}",
    });
  }

  for (const doc of STATUS_DOCS) {
    const scan = scanDoc(root, doc);
    if (!scan.exists) continue;
    for (const [key, entries] of scan.claims) {
      for (const entry of entries) {
        if (!entry.done) continue;
        const gateEntries = gate.claims.get(key) ?? [];
        const gateAgrees = gateEntries.length > 0 && gateEntries.every((g) => g.done);
        if (gateAgrees) continue;
        if (allowlist.some((a) => a.phase === key && a.file === doc)) continue;
        out.push({
          rule: RULE_NAME,
          file: `${doc}:${entry.line}`,
          message: `[x] برای ${entry.phase.display} در حالی که سند گیت آن را کامل اعلام نکرده`,
          fix: `align ${doc} with ${GATE_DOC}, untick the claim, or register { phase: "${key}", file: "${doc}" } in ${ALLOWLIST} with an ADR`,
        });
      }
    }
  }
  return out;
}

/**
 * Fixture self-test (ADR-21): the committed fixture is a miniature repo whose
 * ledger doc claims [x] for a phase the gate doc leaves [ ]. If the rule
 * stops detecting it, the rule reports ITSELF.
 */
function fixtureSelfTest(root: string): Violation[] {
  const dir = join(root, ...FIXTURE_DIR.split("/"), RULE_NAME);
  if (!existsSync(dir)) return [];
  const hits = scanDocStatus(dir);
  if (hits.length > 0) return [];
  return [
    {
      rule: RULE_NAME,
      file: `${FIXTURE_DIR}/${RULE_NAME}`,
      message: `rule '${RULE_NAME}' دیگر تخلف نمونهٔ خود را تشخیص نمی‌دهد (self-test failed)`,
      fix: "restore the seeded violation in the fixture, or fix the rule that stopped detecting it (ADR-21)",
    },
  ];
}

export const docStatusConsistency: Rule = {
  name: RULE_NAME,
  source: "C7 (P4-B07, wave 4)",
  check(ctx: RuleContext): Violation[] {
    return [...scanDocStatus(ctx.root), ...fixtureSelfTest(ctx.root)];
  },
};
