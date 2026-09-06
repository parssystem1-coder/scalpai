# ADR-0038: PHI at rest, audit evidence, and controlled retention

- **Status:** accepted for Phase 6
- **Date:** 2026-09-06
- **Scope:** patients.notes_encrypted, mutation ledger, consent signatures,
  audit anchors, storage reconciliation, patient purge

## Decision

Clinical notes are encrypted in the application with AES-256-GCM. Key material
comes from a mounted secret file in production, with a versioned key ring and a
`kid` on every envelope. The envelope binds the clinic, entity, row and field as
GCM AAD, so moving ciphertext between patients fails authentication. Rotation is
additive: old keys remain readable while a batch job re-wraps rows under the
active key. There is no plaintext fallback.

The database CHECK constraint accepts only `phi.v1` envelopes. A legacy plaintext
value is moved to an app-inaccessible quarantine table during migration, never
silently discarded.

Mutation ledger and offline IndexedDB contain only redacted deltas: structural
field names and ciphertext/digests. Raw notes, signatures, tokens and passwords
are rejected or removed before persistence. Audit metadata is allowlisted and
canonicalized; row hashes are recomputed from canonical JSON with millisecond UTC
timestamps.

Audit anchors are real Merkle roots with inclusion proofs, persisted in an
insert-only RLS table and optionally written as signed, exclusive-create files on
an object-lock/WORM mount. A chained digest is not called a Merkle tree.

Consent traces are bounded by MIME and 256 KiB, stored in MinIO under a
clinic-scoped key, and represented in PostgreSQL by key, digest, size, MIME,
request context and revocation state. Reports may display an authenticity label
only when an Ed25519 seal verifies and its content digest matches the rendered
bytes. Otherwise the UI must say unsealed or omit the label.

Patient purge is explicit, scoped, two-person approved, delayed by a grace
window, and audited with counts. `audit_log` is never purgeable. Object keys are
queued transactionally; failed deletes retry and eventually quarantine. Bucket
reconciliation reports missing referenced objects as data loss and never deletes
those keys.

## Consequences

The API has separate encrypted-note endpoints, a privacy maintenance surface,
and request IDs in scrubbed structured logs. Operators must provision PHI and
Ed25519 key material before production boot and must run restore/reconciliation
jobs as part of operational evidence.
