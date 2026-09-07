#!/usr/bin/env bash
#
# ScalpAI encrypted backup - PostgreSQL AND MinIO (WEAKNESSES C10, ADR-0042).
#
# What was wrong before:
#   * only `pg_dump` ran, so every consent signature, thumbnail and clinical
#     photo in MinIO was outside the backup. Losing the bucket lost the record.
#   * AES-256-CBC has no integrity protection: a flipped byte in cold storage
#     produced garbage plaintext instead of a loud failure.
#   * the passphrase travelled through `-pass pass:...` (visible in `ps`) and
#     fell back to a shared default, so a misconfigured host still "succeeded".
#   * nothing left the host, nothing was ever restored, nothing was checksummed.
#
# What this does:
#   1. dumps Postgres (custom format) and mirrors the whole media bucket;
#   2. checksums both artifacts, then encrypts them with `age` - X25519 +
#      ChaCha20-Poly1305, i.e. AEAD: tampering fails to decrypt;
#   3. only the PUBLIC recipients file lives on this host. The identity that can
#      decrypt lives with the restore operator, so a compromised clinic host
#      cannot read its own backup history;
#   4. copies the snapshot off-site and puts a WORM retention lock on it;
#   5. prunes local snapshots by age and records a machine-readable status;
#   6. any failure alerts the webhook and exits non-zero. Never silent.
set -euo pipefail
umask 077

SCRIPT_VERSION="2"
SNAPSHOT_FORMAT="scalpai-snapshot/2"

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OFFSITE_RETENTION_DAYS="${BACKUP_OFFSITE_RETENTION_DAYS:-90}"
OFFSITE_LOCK_MODE="${BACKUP_OFFSITE_LOCK_MODE:-COMPLIANCE}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH="$(date +%s)"
SNAPSHOT_ID="${BACKUP_SNAPSHOT_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
SNAPSHOT_DIR="${BACKUP_DIR}/${SNAPSHOT_ID}"
WORK_DIR=""

log() {
  printf '{"at":"%s","level":"%s","event":"%s","snapshot":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "${SNAPSHOT_ID}" "${3:-}"
}

# Ops alerting (L3): a backup that fails quietly is worse than no backup, so the
# failure path is a page, not a line in a log nobody reads.
notify() {
  local event="$1" severity="$2" detail="$3" url="${ALERT_WEBHOOK_URL:-}"
  [ -n "${url}" ] || return 0
  curl -fsS -m 10 -X POST -H 'content-type: application/json' \
    --data "{\"event\":\"${event}\",\"severity\":\"${severity}\",\"source\":\"backup\",\"snapshot\":\"${SNAPSHOT_ID}\",\"detail\":\"${detail}\"}" \
    "${url}" >/dev/null 2>&1 || log warn alert.delivery_failed "${event}"
}

die() {
  log error backup.failed "$1"
  exit 1
}

# Secrets come from a mounted file when `<NAME>_FILE` is set. The value form is
# still accepted for a single-host install, but there is NO default: a missing
# secret aborts the run.
secret() {
  local name="$1" file_var="$1_FILE" file value
  file="${!file_var:-}"
  if [ -n "${file}" ]; then
    [ -r "${file}" ] || die "${file_var} points at a file that cannot be read: ${file}"
    value="$(tr -d '\r\n' < "${file}")"
  else
    value="${!name:-}"
  fi
  [ -n "${value}" ] || die "${name} (or ${name}_FILE) is required - this script has no defaults"
  printf '%s' "${value}"
}

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "required tool '$1' is not installed ($2)"
}

write_status() {
  local state="$1" detail="$2"
  mkdir -p "${BACKUP_DIR}"
  cat > "${BACKUP_DIR}/last-run.json" <<STATUS
{
  "state": "${state}",
  "snapshot": "${SNAPSHOT_ID}",
  "startedAt": "${STARTED_AT}",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "durationSeconds": $(( $(date +%s) - STARTED_EPOCH )),
  "scriptVersion": "${SCRIPT_VERSION}",
  "detail": "${detail}"
}
STATUS
}

cleanup() {
  local code=$?
  [ -n "${WORK_DIR}" ] && rm -rf "${WORK_DIR}"
  if [ "${code}" -ne 0 ]; then
    write_status "failed" "exit=${code}"
    notify "backup.failed" "critical" "exit=${code}"
    rm -rf "${SNAPSHOT_DIR}"
  fi
  exit "${code}"
}
trap cleanup EXIT

sha256_of() {
  sha256sum "$1" | cut -d' ' -f1
}

# ---------------------------------------------------------------------------
# 1. Preconditions - tools and secrets, before a single byte is written.
# ---------------------------------------------------------------------------
require_tool pg_dump "postgresql-client"
require_tool age "authenticated encryption, replaces openssl enc -aes-256-cbc"
require_tool mc "MinIO client - the object store is part of the clinical record"
require_tool sha256sum "checksum manifest"

RECIPIENTS_FILE="${BACKUP_AGE_RECIPIENTS_FILE:-}"
[ -n "${RECIPIENTS_FILE}" ] || die "BACKUP_AGE_RECIPIENTS_FILE is required: encryption needs an age recipients file (mounted secret)"
[ -s "${RECIPIENTS_FILE}" ] || die "BACKUP_AGE_RECIPIENTS_FILE is empty or unreadable: ${RECIPIENTS_FILE}"
grep -qE '^(age1|ssh-)' "${RECIPIENTS_FILE}" || die "BACKUP_AGE_RECIPIENTS_FILE contains no age1/ssh recipient"

DB_NAME="$(secret POSTGRES_DB)"
DB_USER="$(secret POSTGRES_USER)"
DB_PASSWORD="$(secret POSTGRES_PASSWORD)"
S3_BUCKET_NAME="$(secret S3_BUCKET)"
S3_ENDPOINT_URL="${S3_ENDPOINT:?S3_ENDPOINT is required}"
S3_KEY="$(secret S3_ACCESS_KEY)"
S3_SECRET="$(secret S3_SECRET_KEY)"

OFFSITE_ENDPOINT="${BACKUP_OFFSITE_ENDPOINT:-}"
[ -n "${OFFSITE_ENDPOINT}" ] || die "BACKUP_OFFSITE_ENDPOINT is required: a copy that never leaves this host is not a backup"
OFFSITE_BUCKET="$(secret BACKUP_OFFSITE_BUCKET)"
OFFSITE_KEY="$(secret BACKUP_OFFSITE_ACCESS_KEY)"
OFFSITE_SECRET="$(secret BACKUP_OFFSITE_SECRET_KEY)"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/scalpai-backup.XXXXXX")"
mkdir -p "${SNAPSHOT_DIR}"
log info backup.started "db=${DB_NAME} bucket=${S3_BUCKET_NAME}"

# `mc` is configured through MC_HOST_* so no credential is ever written to a
# config file on disk, and no alias survives this process.
export MC_HOST_local="$(printf 'http://%s:%s@%s' "${S3_KEY}" "${S3_SECRET}" "${S3_ENDPOINT_URL#*://}")"
export MC_HOST_offsite="$(printf '%s://%s:%s@%s' "${OFFSITE_ENDPOINT%%://*}" "${OFFSITE_KEY}" "${OFFSITE_SECRET}" "${OFFSITE_ENDPOINT#*://}")"

# ---------------------------------------------------------------------------
# 2. PostgreSQL dump.
#
# The plaintext dump is staged in a private tmpfs-style directory (umask 077,
# removed by the EXIT trap) purely so its checksum can be taken BEFORE
# encryption - that checksum is what a restore drill verifies. It never leaves
# this directory unencrypted.
# ---------------------------------------------------------------------------
DB_PLAIN="${WORK_DIR}/postgres.dump"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  --format=custom --compress=9 --file="${DB_PLAIN}" \
  || die "pg_dump failed"
DB_SHA="$(sha256_of "${DB_PLAIN}")"
DB_BYTES="$(wc -c < "${DB_PLAIN}" | tr -d ' ')"
DB_SERVER_VERSION="$(PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -tAc 'show server_version' 2>/dev/null | tr -d ' ' || echo unknown)"
age -R "${RECIPIENTS_FILE}" -o "${SNAPSHOT_DIR}/postgres.dump.age" "${DB_PLAIN}" || die "age encryption of the database dump failed"
log info backup.postgres_done "bytes=${DB_BYTES}"

# ---------------------------------------------------------------------------
# 3. MinIO bucket (C10 - `pg_dump` alone is not enough).
# ---------------------------------------------------------------------------
OBJ_DIR="${WORK_DIR}/objects"
mkdir -p "${OBJ_DIR}"
mc mirror --quiet --preserve "local/${S3_BUCKET_NAME}" "${OBJ_DIR}" || die "mirroring the media bucket failed"
OBJ_COUNT="$(find "${OBJ_DIR}" -type f | wc -l | tr -d ' ')"
OBJ_PLAIN="${WORK_DIR}/objects.tar.gz"
tar -C "${WORK_DIR}" -czf "${OBJ_PLAIN}" objects || die "packing the mirrored objects failed"
OBJ_SHA="$(sha256_of "${OBJ_PLAIN}")"
OBJ_BYTES="$(wc -c < "${OBJ_PLAIN}" | tr -d ' ')"
age -R "${RECIPIENTS_FILE}" -o "${SNAPSHOT_DIR}/objects.tar.gz.age" "${OBJ_PLAIN}" || die "age encryption of the object archive failed"
log info backup.objects_done "objects=${OBJ_COUNT} bytes=${OBJ_BYTES}"

# ---------------------------------------------------------------------------
# 4. Manifest. Encrypted like the payload: verifying a snapshot is the
#    restorer's job, and the restorer is the only party holding the identity.
# ---------------------------------------------------------------------------
MANIFEST_PLAIN="${WORK_DIR}/manifest.json"
cat > "${MANIFEST_PLAIN}" <<MANIFEST
{
  "format": "${SNAPSHOT_FORMAT}",
  "snapshot": "${SNAPSHOT_ID}",
  "createdAt": "${STARTED_AT}",
  "scriptVersion": "${SCRIPT_VERSION}",
  "encryption": "age-x25519-chacha20poly1305",
  "postgres": {
    "file": "postgres.dump.age",
    "plaintextSha256": "${DB_SHA}",
    "plaintextBytes": ${DB_BYTES},
    "database": "${DB_NAME}",
    "serverVersion": "${DB_SERVER_VERSION}"
  },
  "objects": {
    "file": "objects.tar.gz.age",
    "plaintextSha256": "${OBJ_SHA}",
    "plaintextBytes": ${OBJ_BYTES},
    "bucket": "${S3_BUCKET_NAME}",
    "objectCount": ${OBJ_COUNT}
  },
  "retention": {
    "localDays": ${RETENTION_DAYS},
    "offsiteDays": ${OFFSITE_RETENTION_DAYS},
    "offsiteLockMode": "${OFFSITE_LOCK_MODE}"
  }
}
MANIFEST
age -R "${RECIPIENTS_FILE}" -o "${SNAPSHOT_DIR}/manifest.json.age" "${MANIFEST_PLAIN}" || die "age encryption of the manifest failed"

# A plaintext index carries NO integrity claim - it exists so an operator can
# list snapshots without the restore identity.
cat > "${SNAPSHOT_DIR}/INDEX.txt" <<INDEX
format=${SNAPSHOT_FORMAT}
snapshot=${SNAPSHOT_ID}
createdAt=${STARTED_AT}
database=${DB_NAME}
bucket=${S3_BUCKET_NAME}
objects=${OBJ_COUNT}
encryption=age (checksums live inside manifest.json.age)
INDEX

# ---------------------------------------------------------------------------
# 5. Off-site copy with a WORM retention lock. `mc retention set` fails when the
#    target bucket has no object-lock configuration - and a failure here fails
#    the backup, because "immutable" has to be verified, not assumed.
# ---------------------------------------------------------------------------
OFFSITE_PREFIX="offsite/${OFFSITE_BUCKET}/${SNAPSHOT_ID}"
mc cp --quiet --recursive "${SNAPSHOT_DIR}/" "${OFFSITE_PREFIX}/" || die "off-site upload failed"
mc retention set --recursive "${OFFSITE_LOCK_MODE}" "${OFFSITE_RETENTION_DAYS}d" "${OFFSITE_PREFIX}/" \
  || die "off-site retention lock failed - is object locking enabled on ${OFFSITE_BUCKET}?"
OFFSITE_FILES="$(mc ls --recursive "${OFFSITE_PREFIX}/" | wc -l | tr -d ' ')"
[ "${OFFSITE_FILES}" -ge 4 ] || die "off-site copy is incomplete (${OFFSITE_FILES} files)"
log info backup.offsite_done "files=${OFFSITE_FILES} lock=${OFFSITE_LOCK_MODE} days=${OFFSITE_RETENTION_DAYS}"

# ---------------------------------------------------------------------------
# 6. Local retention. Off-site retention is enforced by the object lock, not by
#    this loop - which is the point of the lock.
# ---------------------------------------------------------------------------
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + || true
# Legacy single-file snapshots from the pre-phase-9 script.
find "${BACKUP_DIR}" -maxdepth 1 -name 'scalpai_backup_*.sql.gz.enc' -mtime "+${RETENTION_DAYS}" -delete || true

write_status "ok" "objects=${OBJ_COUNT} offsiteFiles=${OFFSITE_FILES}"
log info backup.completed "duration=$(( $(date +%s) - STARTED_EPOCH ))s"
notify "backup.completed" "info" "objects=${OBJ_COUNT}"
