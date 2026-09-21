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
 * SCOPE - a checkbox line is a PHASE-STATUS CLAIM only when the item text
 * itself opens with an explicit phase id ("Phase 4:", "فاز ۳", "Slice M2",
 * "Wave 1"). Bare M/W tokens buried mid-sentence or inherited from a section
 * heading are NOT claims: PROGRESS.md and WEAKNESSES are task/weakness ledgers
 * whose every line cites its own PR, and treating them as phase closures made
 * the first version of this rule flag 94 legitimate history entries on CI.
 * Scope is a ratchet like the persian-literals rule: widening it is a
 * deliberate edit, never an accident.
 *
 * SEMANTICS - a [x] phase-status claim in a ledger doc must be agreed by the
 * gate document (which needs [x] entries for the same phase) or registered in
 * the allowlist with an ADR. The gate document's own claims are exempt because
 * it IS the ledger (F01: a self-signed claim still needs a criterion row).
 *
 * LINE SPLITTING MUST BE /\r?\n/ - this repo is edited on Windows, and a
 * naive (.*)$ leaves a trailing \r that silently blinds every regex on one
 * checkout while firing on another. The first CI run of this rule proved the
 * point: green locally, 94 findings in CI, same tree.
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

/** A Markdown checkbox in either state, captured with its item text. */
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/;

/**
 * A phase-status claim opens the ITEM TEXT with an explicit phase id. The
 * leading markdown emphasis/backticks are stripped first, so "- [x] **W02**
 * ..." is a weakness closure, not a phase claim.
 */
const CLAIM_RX = /^(?:phase|فاز|slice|wave|موج)\s*#?(\d{1,2})\b/i;

/** Phase id like "Phase 4", "فاز 4", "Slice M4", "Wave 3". */
const WORD_TO_KIND: Record<string, string> = {
  phase: "phase",
  فاز: "phase",
  slice: "m",
  wave: "wave",
  موج: "wave",
};

interface PhaseId {
  /** Canonical form, e.g. "phase-4", "m4", "wave-3". */
  key: string;
  display: string;
}

function parseClaim(itemText: string): PhaseId | null {
  const m = CLAIM_RX.exec(itemText.replace(/^[\s>*_`#-]+/, ""));
  if (m === null) return null;
  const kind = WORD_TO_KIND[(m[0].match(/[a-z\u0600-\u06FF]+/i)?.[0] ?? "").toLowerCase()] ?? "phase";
  const num = m[1] ?? "";
  if (kind === "m") return { key: `m${num}`, display: `Slice M${num}` };
  if (kind === "wave") return { key: `wave-${num}`, display: `Wave ${num}` };
  return { key: `phase-${num}`, display: `Phase ${num}` };
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

  readRoot(root, rel)
    .split(/\r?\n/)
    .forEach((line, i) => {
      const cb = CHECKBOX.exec(line);
      if (cb === null) return;
      const phase = parseClaim(cb[2] ?? "");
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
