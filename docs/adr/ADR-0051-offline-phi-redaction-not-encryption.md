# ADR-0051 — offline IndexedDB stores a redacted delta, not a ciphertext envelope

- Status: Accepted
- Date: 2026-09-22
- Phase: 4 (Gate row #5, P4-B05 / B05)
- Blocks: honest PASS on criterion 5 of `docs/PHASE4-CLOSURE-GATE.md`

## زمینه (Context)

Criterion 5 of the Phase 4 closure gate originally demanded: "IndexedDB inspection after mutation: name/phone ciphertext only. Logout/principal change destroys key. PutObject without encryption fails."

The code never did that. IndexedDB is not a secret store. The accepted Phase 6 control (ADR-0038) already said the browser never receives `PHI_KEY_RING`, so the B05 boundary is **redaction**, not reuse of the server envelope. Wave 5 of the live wave plan then flagged the Section 10 PASS as misleading because the evidence cited `redactPhiPayload` while the criterion text still said "encryption".

ADR-0049 additionally made five patient-identity fields (`firstName`, `lastName`, `phone`, `birthDate`, `gender`) survive the outbox boundary as plaintext, because they are the same fields the §8 sync contract persists as columns. Notes, free text and secrets stay fail-closed.

Shipping WebCrypto around Dexie without a clinic-derived key that the browser is allowed to hold would either (a) put `PHI_KEY_RING` in the client or (b) invent a second key hierarchy the rest of the stack does not know about. Both are worse than an honest redaction boundary.

## تصمیم (Decision)

1. **Redaction is the B05 control.** The Dexie outbox (`apps/web/src/offline/sync.ts` `toRecord`) writes the redacted delta the server ledger already accepts, plus the five identity fields ADR-0049 names. `assertRedactedPhiPayload` fails closed on notes, signatures, tokens and passwords. There is no client-side AES envelope and there will not be one until a future ADR introduces a browser key that is not `PHI_KEY_RING`.
2. **Logout wipes the store, it does not destroy a key that does not exist.** `closeOfflineScope({ wipe: true })` deletes the per-clinic-per-user Dexie database. A later principal cannot read the previous principal's queue.
3. **Criterion 5 is restated to match the control.** The live ledger (`docs/PHASE4-CLOSURE-GATE.md` Section 10 row 5) PASSes on redaction + wipe + fail-closed assertion, not on ciphertext-at-rest. The original audit wording in Section 1 stays as history and points here.
4. **A future encryption envelope is a new ADR**, not a silent widening of this one. Until then, any PR that writes readable notes/secrets into IndexedDB is a regression (covered by `apps/web/src/offline/offline-sync.spec.ts`).

## جایگزین‌های ردشده (Alternatives)

- Reuse server `PHI_KEY_RING` in the browser — ships the production key to every clinic workstation; rejected by ADR-0038.
- WebCrypto with an ephemeral per-session key — ciphertext becomes unreadably lost on lock/refresh, so offline create cannot flush; rejected.
- Leave criterion 5 as "encryption verified" while the code only redacts — the exact ledger lie Wave 5 exists to remove; rejected.

## پیامدها (Consequences)

- مثبت: Section 10 row 5 is no longer a self-certified PASS on a different control than the audit asked for; the test already asserts the real invariant.
- منفی/هزینه پذیرفته‌شده: a stolen workstation disk can still yield identity fields of queued offline creates until logout wipes the DB. That is the same exposure the REST `POST /patients` body has on the wire, and it is documented rather than hidden behind a "ciphertext" label.

## تأثیر بر قوانین

No change to `docs/engineering-rules.md` §2 (PHI still never belongs in logs; notes still encrypt at rest on the server via ADR-0038). This ADR only names the **browser** persistence boundary.
