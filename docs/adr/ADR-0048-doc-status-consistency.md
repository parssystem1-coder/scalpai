# ADR-0048: doc-status-consistency rule and the ledger allowlist bridge

- **Status:** accepted for Phase 4 Wave 4 (C7 / P4-B07)
- **Date:** 2026-09-21
- **Scope:** documentation status claims; conformance rule `doc-status-consistency`

## Decision

Checkbox status claims in the ledger docs (`docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md`, `docs/PROGRESS.md`, `docs/WEAKNESSES-V2-10-PHASES.md`) are machine-checked against `docs/PHASE4-CLOSURE-GATE.md` (the ledger of record for the clinical phase 4 closure):

1. A checkbox line is a **phase-status claim** only when the item text itself opens with an explicit phase id (`Phase N:`, `فاز N`, `Slice N`, `Wave N`). Bare `M`/`W` tokens mid-sentence are task/weakness history, not phase closures — the first version of the rule treated those as claims and produced 94 false findings in CI.
2. A `[x]` phase-status claim must be **agreed by the gate document** (which needs `[x]` entries for the same phase) **or registered** in `tools/conformance/doc-status-allowlist.json` with an ADR reference. Allowlist entries are validated like `exceptions.json` (ADR-\d{3,4} required).
3. The gate document's own claims are exempt because it IS the ledger.
4. Scanning splits on `/\r?\n/`. The repo is edited on Windows; a `(.*)$`-style line regex leaves a trailing `\r` that silently blinds the rule on a CRLF checkout while firing on CI. The first CI run of this rule was green locally and red remotely on the identical tree for exactly this reason.

## Why the roadmap claims are allowlisted

The `Phase 1..5` checklist in the roadmap ledger is the **dashboard-refactor project's own internal milestone list** (data extraction → sections → modals → i18n), each row closed with PR evidence (#69, #70). The phase-4 **clinical** closure that `docs/PHASE4-CLOSURE-GATE.md` adjudicates is a different, larger gate (API-first data path, security waves, release engineering). The two numbering spaces collide; until the gate document adopts explicit phase rows, the five refactor-local claims are registered here instead of being unticked or inflated into false closures. When the gate document grows explicit `[x]` phase rows, the corresponding allowlist entries must be deleted.

## Evidence

Rule: `tools/conformance/rules/doc-status-consistency.ts` (with ADR-21 fixture self-test). Allowlist: `tools/conformance/doc-status-allowlist.json`. The rule caught a real contradiction in wave 4: docs ticked phases the gate document marked FAIL.
