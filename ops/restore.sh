#!/usr/bin/env bash
#
# ScalpAI restore - PostgreSQL AND MinIO, checksum-verified (ADR-0042 / C10).
#
# Usage:
#   scalpai-restore <snapshot-id|snapshot-dir|offsite:<snapshot-id>> [options]
#
# Options:
#   --target-db NAME   restore into NAME instead of the live database (creates it)
#   --objects          also push the media objects back into the bucket
#   --target-bucket B  restore objects into B instead of ${S3_BUCKET}
#   --verify-only      decrypt and verify checksums, restore nothing
#
# The snapshot is only usable with the age IDENTITY (BACKUP_AGE_IDENTITY_FILE),
# which lives with the restore operator - never on the host that writes backups.
# Every artifact is checksummed against the manifest AFTER decryption, so a
# truncated or tampered snapshot fails loudly instead of restoring silence.
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
TARGET_DB=""
TARGET_BUCKET=""
RESTORE_OBJECTS=0
VERIFY_ONLY=0
WORK_DIR=""
STARTED_EPOCH="$(date +%s)"

log() {
  printf '{"at":"%s","level":"%s","event":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "${3:-}"
}

die() {
  log error restore.failed "$1"
  exit 1
}

cleanup() {
  local code=$?
  [ -n "${WORK_DIR}" ] && rm -rf "${WORK_DIR}"
  exit "${code}"
}
trap cleanup EXIT

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
  command -v "$1" >/dev/null 2>&1 || die "required tool '$1' is not installed"
}

[ "$#" -ge 1 ] || die "usage: $0 <snapshot-id|snapshot-dir|offsite:<snapshot-id>> [--target-db NAME] [--objects] [--target-bucket B] [--verify-only]"
SNAPSHOT_REF="$1"
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --target-db) TARGET_DB="${2:?--target-db needs a name}"; shift 2 ;;
    --target-bucket) TARGET_BUCKET="${2:?--target-bucket needs a name}"; shift 2 ;;
    --objects) RESTORE_OBJECTS=1; shift ;;
    --verify-only) VERIFY_ONLY=1; shift ;;
    *) die "unknown option: $1" ;;
  esac
done

require_tool age
require_tool pg_restore
require_tool psql
require_tool jq

IDENTITY_FILE="${BACKUP_AGE_IDENTITY_FILE:-}"
[ -n "${IDENTITY_FILE}" ] || die "BACKUP_AGE_IDENTITY_FILE is required to decrypt a snapshot"
[ -s "${IDENTITY_FILE}" ] || die "BACKUP_AGE_IDENTITY_FILE is empty or unreadable: ${IDENTITY_FILE}"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/scalpai-restore.XXXXXX")"

# ---------------------------------------------------------------------------
# 1. Locate the snapshot (local directory, local id, or off-site id).
# ---------------------------------------------------------------------------
if [ -d "${SNAPSHOT_REF}" ]; then
  SNAPSHOT_DIR="${SNAPSHOT_REF}"
elif [ -d "${BACKUP_DIR}/${SNAPSHOT_REF}" ]; then
  SNAPSHOT_DIR="${BACKUP_DIR}/${SNAPSHOT_REF}"
elif [ "${SNAPSHOT_REF#offsite:}" != "${SNAPSHOT_REF}" ]; then
  require_tool mc
  SNAPSHOT_ID="${SNAPSHOT_REF#offsite:}"
  OFFSITE_ENDPOINT="${BACKUP_OFFSITE_ENDPOINT:?BACKUP_OFFSITE_ENDPOINT is required to pull an off-site snapshot}"
  OFFSITE_BUCKET="$(secret BACKUP_OFFSITE_BUCKET)"
  OFFSITE_KEY="$(secret BACKUP_OFFSITE_ACCESS_KEY)"
  OFFSITE_SECRET="$(secret BACKUP_OFFSITE_SECRET_KEY)"
  export MC_HOST_offsite="$(printf '%s://%s:%s@%s' "${OFFSITE_ENDPOINT%%://*}" "${OFFSITE_KEY}" "${OFFSITE_SECRET}" "${OFFSITE_ENDPOINT#*://}")"
  SNAPSHOT_DIR="${WORK_DIR}/${SNAPSHOT_ID}"
  mkdir -p "${SNAPSHOT_DIR}"
  mc cp --quiet --recursive "offsite/${OFFSITE_BUCKET}/${SNAPSHOT_ID}/" "${SNAPSHOT_DIR}/" \
    || die "could not pull off-site snapshot ${SNAPSHOT_ID}"
else
  die "snapshot not found: ${SNAPSHOT_REF}"
fi

for required in manifest.json.age postgres.dump.age objects.tar.gz.age; do
  [ -f "${SNAPSHOT_DIR}/${required}" ] || die "snapshot ${SNAPSHOT_DIR} is missing ${required}"
done

# ---------------------------------------------------------------------------
# 2. Decrypt + verify. age is AEAD, so a failed decrypt already means tampering;
#    the manifest checksums additionally prove the snapshot is the one recorded.
# ---------------------------------------------------------------------------
age -d -i "${IDENTITY_FILE}" -o "${WORK_DIR}/manifest.json" "${SNAPSHOT_DIR}/manifest.json.age" \
  || die "manifest decryption failed (wrong identity or tampered snapshot)"
MANIFEST="${WORK_DIR}/manifest.json"
SNAPSHOT_ID="$(jq -r '.snapshot' "${MANIFEST}")"
SOURCE_DB="$(jq -r '.postgres.database' "${MANIFEST}")"
SOURCE_BUCKET="$(jq -r '.objects.bucket' "${MANIFEST}")"
EXPECTED_OBJECTS="$(jq -r '.objects.objectCount' "${MANIFEST}")"
log info restore.manifest_ok "snapshot=${SNAPSHOT_ID} db=${SOURCE_DB} objects=${EXPECTED_OBJECTS}"

verify_artifact() {
  local encrypted="$1" plain="$2" expected="$3" actual
  age -d -i "${IDENTITY_FILE}" -o "${plain}" "${encrypted}" || die "decryption failed: ${encrypted}"
  actual="$(sha256sum "${plain}" | cut -d' ' -f1)"
  [ "${actual}" = "${expected}" ] || die "checksum mismatch for ${encrypted} (expected ${expected}, got ${actual})"
}

verify_artifact "${SNAPSHOT_DIR}/postgres.dump.age" "${WORK_DIR}/postgres.dump" "$(jq -r '.postgres.plaintextSha256' "${MANIFEST}")"
verify_artifact "${SNAPSHOT_DIR}/objects.tar.gz.age" "${WORK_DIR}/objects.tar.gz" "$(jq -r '.objects.plaintextSha256' "${MANIFEST}")"
log info restore.checksums_ok "snapshot=${SNAPSHOT_ID}"

if [ "${VERIFY_ONLY}" -eq 1 ]; then
  log info restore.verify_only_done "snapshot=${SNAPSHOT_ID} seconds=$(( $(date +%s) - STARTED_EPOCH ))"
  exit 0
fi

# ---------------------------------------------------------------------------
# 3. Restore PostgreSQL.
# ---------------------------------------------------------------------------
DB_USER="$(secret POSTGRES_USER)"
DB_PASSWORD="$(secret POSTGRES_PASSWORD)"
DB_NAME="${TARGET_DB:-${SOURCE_DB}}"
export PGPASSWORD="${DB_PASSWORD}"

if [ -n "${TARGET_DB}" ]; then
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres \
    -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\"" >/dev/null
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres \
    -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\"" >/dev/null
  log info restore.scratch_db_created "db=${TARGET_DB}"
fi

RESTORE_LOG="${WORK_DIR}/pg_restore.log"
set +e
pg_restore -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  --clean --if-exists --no-owner --no-privileges --single-transaction \
  "${WORK_DIR}/postgres.dump" > "${RESTORE_LOG}" 2>&1
PG_CODE=$?
set -e
if [ "${PG_CODE}" -ne 0 ] || grep -qi 'errors ignored on restore' "${RESTORE_LOG}"; then
  tail -n 40 "${RESTORE_LOG}" >&2
  die "pg_restore reported errors (exit=${PG_CODE})"
fi
log info restore.postgres_ok "db=${DB_NAME}"

# ---------------------------------------------------------------------------
# 4. Restore the media objects (opt-in: a database-only drill must not touch the
#    live bucket).
# ---------------------------------------------------------------------------
if [ "${RESTORE_OBJECTS}" -eq 1 ]; then
  require_tool mc
  S3_ENDPOINT_URL="${S3_ENDPOINT:?S3_ENDPOINT is required to restore objects}"
  S3_KEY="$(secret S3_ACCESS_KEY)"
  S3_SECRET="$(secret S3_SECRET_KEY)"
  BUCKET="${TARGET_BUCKET:-${S3_BUCKET:-${SOURCE_BUCKET}}}"
  export MC_HOST_local="$(printf 'http://%s:%s@%s' "${S3_KEY}" "${S3_SECRET}" "${S3_ENDPOINT_URL#*://}")"
  mkdir -p "${WORK_DIR}/unpacked"
  tar -C "${WORK_DIR}/unpacked" -xzf "${WORK_DIR}/objects.tar.gz"
  mc mb --ignore-existing "local/${BUCKET}" >/dev/null
  mc mirror --quiet --overwrite "${WORK_DIR}/unpacked/objects" "local/${BUCKET}" || die "restoring objects failed"
  RESTORED_OBJECTS="$(mc ls --recursive "local/${BUCKET}" | wc -l | tr -d ' ')"
  [ "${RESTORED_OBJECTS}" -ge "${EXPECTED_OBJECTS}" ] \
    || die "object count after restore is ${RESTORED_OBJECTS}, manifest recorded ${EXPECTED_OBJECTS}"
  log info restore.objects_ok "bucket=${BUCKET} objects=${RESTORED_OBJECTS}"
fi

log info restore.completed "snapshot=${SNAPSHOT_ID} db=${DB_NAME} seconds=$(( $(date +%s) - STARTED_EPOCH ))"
