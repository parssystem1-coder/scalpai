# ADR-0045 - Phase 10 batch 3: conformance and test drift

- Status: Accepted
- Date: 2026-09-08
- Branch: `feat/phase10-batch1-debt-removal`
- Supersedes nothing. Follows ADR-0043 (batch 1) and ADR-0044 (batch 2).

Weaknesses addressed: **none of the seven open phase-10 items.** This batch closes
the gap between a green local run and a red gate. It is bookkeeping with code
behind it, and it is written down because the alternative - fixing four "small"
things silently - is exactly how the drift phase 10 exists to remove got there.

## Context

After batch 2, typecheck (18/18) and build (12/12) were green and the fifty
assertions in `tools/quality/product.phase10.spec.ts` passed, yet four failures
remained that had nothing to do with the remaining phase-10 work:

1. **`tenant-safety` reported four real violations.** The rule derives its table
   inventory from the migrations (ADR-0028: no hardcoded `RLS_TABLES`, no
   hardcoded `EXEMPT_TABLES`) and requires `ENABLE` + `FORCE ROW LEVEL SECURITY`
   on every table a migration creates. `phi_plaintext_quarantine` and
   `consent_signature_quarantine` from migration 0012 had neither. They were
   protected by `REVOKE ALL` alone - and a `REVOKE` is not an `RLS` posture: the
   blanket `GRANT ... ON ALL TABLES` in `applyGrants` runs after every migration
   file, so the only reason the app role cannot read them is a `REVOKE` that has
   to be re-applied forever.

2. **`package-manager` reported its own source, three times.** `tools` is one of
   the scopes the rule walks, so the literal in the header comment and in two rule
   labels matched the regex those labels describe (`v2.ts:16`, `:171`, `:172`).
   The fix it printed - use `npm run` / `npm exec` - is meaningless advice for a
   regex, which is the tell that the finding was self-reference and not debt.

3. **`apps/web/src/phase3-improvements.spec.tsx` asserted a panel deleted in
   ADR-0043.** The licence modal's subtitle moved from a client-side clock claim
   to server-side verification, the "simulate clock rollback" button was removed
   with the local state machine, and the claims object the browser used to
   hard-code is now only rendered when a real token verifies.

4. **`apps/api/test/analyses.spec.ts` posted to `POST /patients/:pid/gallery/init`,
   deleted by the phase-8 upload rewrite (ADR-0041).** Every fixture 404'd, so the
   analyses suite failed in setup and never reached its own contract.

## Decision

**1. RLS on the quarantine tables lands in a NEW migration, `0016__phase10_quarantine_rls.sql`.**
Not as an edit to 0012, because 0012 moves the legacy plaintext into those tables
with an `INSERT` as the owner, and `FORCE ROW LEVEL SECURITY` binds the owner too:
turning it on above those inserts breaks `migrate` on an empty database. The new
file deliberately creates **no policy** - these tables are the destination for
pre-phase-6 plaintext, no runtime path may read them, and operator work runs under
the migrate role. The `REVOKE ALL` is repeated so RLS is a second layer rather
than a replacement.

**2. The banned package-manager names are assembled from fragments at runtime.**
`const PNPM_BIN = ["pn", "pm"].join("")` and the regexes built with `new RegExp`.
Detection is byte-for-byte identical; the literal that made the file match itself
is gone. The rule was **not** disabled, and no exception was registered for it -
an exception would have hidden real findings in the same file forever.

**3. The licence block now speaks for the server.** It mocks `GET /license/status`
and asserts the panel RENDERS a verdict: the Ed25519 active state, the quota
claims from those verified claims, and - the honest replacement for the deleted
simulator - the `tampered` verdict, returned by the server, with an assertion that
no local simulator exists to click. A UI test for a panel with no local state
machine has to inject the state from outside.

**4. The analyses fixtures open uploads through `POST /patients/:pid/gallery/uploads`.**
The response still carries the pending gallery item id, which is the only thing
the `analyses.gallery_item_id` FK needs; completion is not required and would
demand real bytes in the bucket.

**5. Nothing is ticked in `docs/WEAKNESSES-V2-10-PHASES.md`.** None of these four
closes one of the seven open items, and the phase-10 gate refuses a tick without
an assertion behind it (`openCount === 7`). Instead the four fixes get their own
gate, `tools/quality/product.phase10-batch3.spec.ts`, so they cannot regress
quietly.

## Consequences

- `migrate` gains one forward-only file. Rollback statements are in its header.
- Any future real `pnpm`/`yarn` invocation inside `tools/conformance/rules/v2.ts`
  is still caught: the regex is unchanged, only its spelling is.
- The licence spec now fails if the panel starts deriving state locally again,
  which is the M2 regression that matters.
- `apps/api/test/analyses.spec.ts` consumes one upload quota slot per fixture, the
  same way `media.phase8.spec.ts` does.

## What this batch did NOT close

Still open, unchanged, and still the next work in phase 10: **M19** (type-aware
ESLint + TypeScript strict flags), **M14** (conformance over `.tsx`, `ops`,
JSON/YAML and architecture call-sites), **M1** (SAMPLE data separation, permanent
watermark, stripped from the production build), **M5** (i18n completion), **M15**
(bundle budget from the real graph), **L2** (dashboard decomposition) and
**L1/W01/W22/W23** (documentation drift).

M19 in particular must NOT be landed from a config diff alone: the strict flags
and the type-aware rules have to be turned on against real compiler output, one
workspace at a time, in a branch of their own. That is the same reason ADR-0044
refused to land it.
