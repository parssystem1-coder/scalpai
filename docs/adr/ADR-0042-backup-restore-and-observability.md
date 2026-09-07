# ADR-0042: authenticated backup, verified restore and operational evidence

- **Status:** Accepted
- **Date:** 2026-09-07
- **Owners:** ScalpAI platform
- **Closes:** phase 9 (C10, L3, L4)

## Context

The previous backup path was not a recovery system. It ran `pg_dump` only, so
MinIO clinical media was missing; it used AES-256-CBC without authentication;
passed a passphrase as `pass:`; silently fell back to a shared default; kept the
only copy on the same host; and had no restore test. Logs had request IDs but no
metrics, readiness contract or alert sink. Rate limits protected only routes
where somebody remembered to add a decorator, and the database pool had no
statement or idle-transaction ceiling.

For a clinical system, each of these is an integrity failure, not an ops nicety:
"the backup job was green" is not evidence that the record can be recovered.

## Decision

### 1. One snapshot contains both stores

`ops/backup.sh` captures:

- a PostgreSQL custom-format dump;
- a complete MinIO bucket mirror, packed as `objects.tar.gz`;
- a manifest containing the capture timestamp, database/object counts and a
  SHA-256 digest of each plaintext artifact.

The snapshot is useless unless all three artifacts exist. The restore path checks
the manifest before it touches a database or bucket.

### 2. age for authenticated encryption

Every payload and the manifest is encrypted with `age` using X25519 recipients
and ChaCha20-Poly1305 authentication. The writer host stores only the PUBLIC
recipients file. The private identity is held by the restore operator or a
separate recovery environment and is supplied via `BACKUP_AGE_IDENTITY_FILE`.

This rejects tampering at decryption time and removes the `pass:` process-list
problem. A missing recipient/identity is a hard failure; there is no fallback
secret.

### 3. off-site plus WORM retention

The snapshot is copied to an object-lock-enabled off-site bucket. The backup
fails if the copy is incomplete or `mc retention set` cannot apply the requested
COMPLIANCE/GOVERNANCE retention. Local pruning is independent, so local cleanup
cannot shorten the off-site lock.

### 4. restore is a gate, not a promise

`ops/restore-drill.sh` creates a scratch database and bucket, decrypts and
checksums the snapshot, runs smoke queries against `clinics`, `users`, `patients`
and the public schema, measures recovery time, signs a JSON report with
HMAC-SHA256, then removes the scratch targets. The CI `backup-restore` job runs
this on every PR; Nightly repeats it; the monthly staging workflow restores the
real off-site snapshot when `ENABLE_STAGING_RESTORE_DRILL=true`.

### 5. observability is fail-closed and PHI-free

- Every finished request feeds a bounded-cardinality Prometheus registry.
- `/api/v1/health` is liveness; `/api/v1/health/ready` probes Postgres and
  reports Redis degradation without pretending the database is available.
- `/api/v1/metrics` is disabled unless `METRICS_TOKEN` is set and uses a
  constant-time bearer comparison.
- Production refuses to boot without a valid `ALERT_WEBHOOK_URL`.
- Alerts are allowlisted, scrubbed, deduplicated and non-blocking.
- PostgreSQL connections have statement, client query and idle-transaction
  timeouts.
- Every route receives a default per-clinic/per-IP budget plus a global ceiling;
  probes opt out explicitly with max=0.

## Consequences

Positive: a lost host is recoverable, tampering is detected, media is included,
restore time is measurable, and an operator gets paged instead of discovering a
failure from a missing patient. Operational endpoints do not become a PHI
channel, and a forgotten route cannot evade all rate limiting.

Trade-off: backups temporarily stage encrypted-input material in a private
`umask 077` work directory; operators must protect the private age identity and
HMAC report key; object locking complicates deletion and requires an explicit
retention policy; an alert webhook is a production dependency.

## Alternatives rejected

- **Postgres only:** does not recover clinical media.
- **AES-CBC + HMAC:** workable, but two keys and two verification paths are an
  avoidable footgun; age gives authenticated encryption as one primitive.
- **Passphrase in env/CLI:** leaks through process inspection and makes secret
  rotation ambiguous.
- **Same-host snapshots:** fail with the host they protect.
- **Cron log as proof:** only a verified restore proves recoverability.
- **Unbounded in-process metrics:** leaks route identifiers and can become a
  memory exhaustion path.

## Evidence

- Regression: `tools/ops/backup.phase9.spec.ts`, `apps/api/src/common/*spec.ts`,
  `apps/api/src/ops/ops.spec.ts`, `packages/db/src/pool.spec.ts`.
- CI: `backup-image`, `backup-run`, `backup-offsite`, `restore-drill` gates.
- Scheduled: `.github/workflows/nightly.yml` and
  `.github/workflows/restore-drill.yml`.
- Operator procedure: `docs/ops/RUNBOOK.md`.
