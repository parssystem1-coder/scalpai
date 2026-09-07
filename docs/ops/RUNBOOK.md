# ScalpAI operations runbook (phase 9 / ADR-0042)

This is the incident and recovery path. Do not paste patient data into tickets,
chat or alert payloads. Use the `x-request-id` from the response and the
structured JSON logs.

## 1. First response to an alert

1. Record the alert timestamp, deployment version and request ID, not the
   request body.
2. Check `docker compose -f ops/prod.yml --env-file ops/prod.env ps` and the
   API logs. Logs are scrubbed, so do not work around that by enabling raw SQL
   or request-body logging.
3. If readiness is red, check `curl -fsS https://DOMAIN/api/v1/health/live`,
   then `/api/v1/health/ready`. Liveness proves the process; readiness proves
   Postgres is reachable. Redis `degraded` is actionable but not an excuse to
   route PHI into a broken database.
4. Preserve `/backups/last-run.json`, the matching snapshot `INDEX.txt`, the
   signed drill report and the CI evidence. These are incident evidence.

## 2. Backup failure

A failed backup writes `last-run.json`, emits `backup.failed` and exits non-zero.
Do not delete the previous snapshot or restart blindly.

- Check the mounted `BACKUP_AGE_RECIPIENTS_FILE`, Postgres connectivity and
  MinIO health.
- Check off-site credentials and object-lock status with `mc retention info`.
- Run `docker compose ... exec backup-cron /usr/local/bin/scalpai-backup` after
  the cause is corrected.
- Confirm `last-run.json` is `ok`, the off-site copy has at least the manifest,
  database and object archive, and the retention lock is present.
- If the off-site provider is unavailable, escalate before the local retention
  window expires. Never disable retention or swap in a passphrase.

## 3. Restore procedure

### Verify only

Use the restore identity from the recovery vault, never a key left on the
production host:

```bash
export BACKUP_AGE_IDENTITY_FILE=/run/secrets/scalpai_backup_identity
export POSTGRES_USER=scalpai_owner
export POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
export BACKUP_DIR=/backups
/usr/local/bin/scalpai-restore 20260907T020000Z --verify-only
```

A checksum or decryption failure is a hard stop. Do not restore a snapshot that
cannot verify.

### Restore into staging

```bash
/usr/local/bin/scalpai-restore 20260907T020000Z \
  --target-db scalpai_restore_20260907 \
  --objects --target-bucket scalpai-restore-20260907
```

Run the smoke queries in `scalpai-restore-drill` and record the measured RTO.
Do not point `--target-db` or `--target-bucket` at live data during a drill.

### Production recovery

Declare a maintenance window, stop API writes, verify the snapshot and identity,
restore the database, restore MinIO objects, run the smoke queries, validate
`/health/ready`, then reopen traffic. Keep the signed report with the incident.
A rollback is a new restore from the last known-good immutable snapshot, never a
manual edit to a recovered clinical row.

## 4. Key rotation

### Backup encryption identity

1. Generate a new age identity in the recovery vault: `age-keygen`.
2. Publish its `age1...` public recipient to the mounted recipients file.
3. Run a new backup and a `--verify-only` restore with the new identity.
4. Keep the previous identity until every snapshot inside the retention window
   has either been re-encrypted or expired under WORM retention. Then revoke it
   in the vault, not by rewriting immutable objects.

### Alert, metrics and database secrets

Rotate `ALERT_WEBHOOK_URL`, `METRICS_TOKEN`, Postgres credentials and MinIO
credentials through the secret manager. Restart only after `config -q` passes;
then check readiness and run the smoke drill. Rotate JWT/PHI keys using their
existing ADR-0035/ADR-0038 windows, not as part of a backup incident.

## 5. Tenant isolation check

If a restore or alert suggests cross-tenant data:

1. Stop writes and preserve the signed report and request IDs.
2. Verify `clinic_id` predicates and RLS with the conformance harness.
3. Use a read-only staging restore and query two clinic IDs explicitly; prove
   each returns only its own rows.
4. Do not "fix" production by deleting rows. Escalate as a security incident.

## 6. Data deletion

A patient deletion is the approved purge workflow, not a bucket delete. Use the
privacy controller's two-person approval and retention policy. Reconcile the
object orphan queue afterward. Never delete an off-site WORM snapshot to satisfy
an ad-hoc request; snapshots follow the documented retention/legal hold policy.

## 7. Rate limit and pool pressure

Check `scalpai_rate_limit_rejected_total`, request latency and Postgres activity.
Lower a noisy route's per-clinic limit through env, never by removing the global
ceiling. If statements time out, inspect indexes and locks; do not set all
timeouts to zero in production. A Redis `degraded` readiness state means the
limiter is temporarily per-process; restore Redis before increasing traffic.

## 8. Alert triage and completion

Alerts are scrubbed and deduplicated. A 5xx alert names a normalized route, status
and request ID, not a patient. Close an incident only when:

- a green `last-run.json` exists;
- the off-site copy is complete and object-locked;
- a signed restore report records checksums, smoke queries and RTO;
- readiness is `ready`, not merely liveness;
- the root cause and next prevention are captured without PHI.

## 9. Monthly restore checklist

The staging workflow is enabled only when `ENABLE_STAGING_RESTORE_DRILL=true`.
Store these GitHub Environment secrets in `staging`: `BACKUP_AGE_IDENTITY`,
`DRILL_REPORT_HMAC_KEY`, staging DB/S3 credentials, off-site credentials and
`ALERT_WEBHOOK_URL`. The workflow retains the signed report for one year.
