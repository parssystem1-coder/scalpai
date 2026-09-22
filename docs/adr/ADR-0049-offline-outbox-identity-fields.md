# ADR-0049: offline outbox carries patient identity fields through the redaction boundary

- **Status:** accepted for Phase 4 Gate row #1 (dashboard API-first persistence)
- **Date:** 2026-09-21
- **Scope:** `apps/web/src/offline` (Dexie outbox), `packages/db` sync apply path, e2e `@smoke`

## Context

Criterion 1 of `docs/PHASE4-CLOSURE-GATE.md` ("Dashboard API-first path verified by E2E") failed in practice: a patient created offline was never accepted by the server, and the nightly `@offline` run has been red for days at exactly this step.

Root cause chain (proven against the local stack and the DB):

1. `PatientsPage` enqueues the offline create with the `PatientCreate` fields (`firstName`, `lastName`, `phone`) — the same fields the REST `POST /patients` path persists as plaintext columns.
2. The Dexie outbox boundary (`apps/web/src/offline/sync.ts`, `toRecord`) runs `redactPhiPayload`, and `firstName/lastName/phone` are in `PHI_KEYS`, so the values were silently dropped and only structural fields survived.
3. `sync.repo.ts#applyPatientCreate` then read the missing fields with `asText()` → `""`, and the server **applied** the mutation: a patient row with empty identity (`103d843c…` in the local DB, `created_by` real, name/phone empty) plus an "applied" ledger entry.
4. The client never surfaced anything (no optimistic row, no error), and criterion 1 stayed unproven.

This is a real, silent clinical-data corruption path, not a test problem: every offline create since phase 7 landed as an empty row that the clinician could not see or find.

## Decision

1. **Identity fields survive the outbox boundary.** The redaction rule already names `firstName`, `lastName`, `phone` and `birthDate` as the plaintext-allowed identity set on the server sync path (`findForbiddenPhi` in `packages/db/src/repos/sync.repo.ts`). The client boundary is aligned to that exact contract: `toRecord` now carries `PatientCreate`-shaped identity fields (`firstName`, `lastName`, `phone`, `birthDate`, `gender`) **when they are non-empty strings** and still drops every other readable PHI/secret key. The invariant that actually matters — no notes, no free text, no secrets in IndexedDB — is unchanged and stays fail-closed.
2. **The server refuses incomplete offline creates instead of fabricating rows.** `applyPatientCreate` now rejects with a named `MutationRejected` reason (`missing required patient identity fields (ADR-0049)`) when `firstName`, `lastName` or `phone` are absent/empty. The client dead-letters the mutation (per-item `rejected` answer, existing C9 machinery) instead of the server writing an empty identity.
3. **The gate proves the full cycle.** `e2e/dashboard-persistence.spec.ts` carries the offline→online half of criterion 1 as `@smoke` (the online reload half was already there): offline create → reconnect → outbox flush → reload → the SERVER's row is visible. The nightly `@offline` spec stays as the extra end-to-end pass.

## Consequences

- Empty-identity patient rows can no longer be created by the sync path; incomplete offline creates land in the outbox dead-letter queue where the UI already shows them (`deadLetterCount`), rather than disappearing.
- IndexedDB still contains no notes, signatures or secrets; the pre-existing spec "never writes readable PHI into IndexedDB" keeps asserting that, now with identity fields explicitly excepted.
- A future switch to true browser-side encryption (WebCrypto with a clinic-derived key) can replace the exception wholesale; the server contract does not change.

## Evidence

- Regression: `apps/web/src/offline/offline-sync.spec.ts` (identity fields survive; secrets still redacted) and the server-side rejection unit test in `apps/api/test/sync.phase7.spec.ts` territory (`processPushBatch` rejects an identity-less create).
- Behavioural: `e2e/dashboard-persistence.spec.ts` `@smoke` (both halves) on the real API+web stack.
- The motivating artifact: local DB row `103d843c-9fa5-4d24-9eaf-df02136ab2e4` — `first_name/last_name/phone` all `""`, created 2026-09-21T01:13:37Z via the sync path.
