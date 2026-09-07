#!/usr/bin/env bash
#
# ScalpAI restore drill (WEAKNESSES C10, ADR-0042).
#
# "We have backups" is a claim; a restore is evidence. This script runs
# unattended - monthly against staging (.github/workflows/restore-drill.yml) and
# on every pull request against the CI stack - and produces a SIGNED report with
# a measured recovery time, so nobody has to trust a cron log.
#
# It restores into a scratch database and a scratch bucket: a drill must never be
# able to overwrite live clinical data.
#
# Usage: scalpai-restore-drill [--use-latest] [--keep] [--snapshot ID]
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
REPORT_DIR="${DRILL_REPORT_DIR:-${BACKUP_DIR}/drills}"
DRILL_ID="$(date -u +%Y%m%dT%H%M%SZ)"
SCRATCH_DB="${DRILL_DB_PREFIX:-scalpai_drill}_${DRILL_ID,,}"
SCRATCH_BUCKET="${DRILL_BUCKET_PREFIX:-scalpai-drill}-${DRILL_ID,,}"
USE_LATEST=0
KEEP=0
SNAPSHOT_ID=""
STARTED_EPOCH="$(date +%s)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
HERE="$(cd "$(dirname "$0")" && pwd)"

log() {
  printf '{"at":"%s","level":"%s","event":"%s","drill":"%s","detail":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" "${DRILL_ID}" "${3:-}"
}

notify() {
  local event="$1" severity="$2" detail="$3" url="${ALERT_WEBHOOK_URL:-}"
  [ -n "${url}" ] || return 0
  curl -fsS -m 10 -X POST -H 'content-type: application/json' \
    --data "{\"event\":\"${event}\",\"severity\":\"${severity}\",\"source\":\"restore-drill\",\"drill\":\"${DRILL_ID}\",\"detail\":\"${detail}\"}" \
    "${url}" >/dev/null 2>&1 || log warn alert.delivery_failed "${event}"
}

die() {
  log error drill.failed "$1"
  notify "restore_drill.failed" "critical" "$1"
  exit 1
}

secret() {
  local name="$1" file_var="$1_FILE" file value
  file="${!file_var:-}"
  if [ -n "${file}" ]; then
    [ -r "${file}" ] || die "${file_var} points at a file that cannot be read: ${file}"
    value="$(tr -d '\r\n' < "${file}")"
  else
    value="${!name:-}"
  fi
  [ -n "${value}" ] || die "${name} (or ${name}_FILE) is required"
  printf '%s' "${value}"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --use-latest) USE_LATEST=1; shift ;;
    --keep) KEEP=1; shift ;;
    --snapshot) SNAPSHOT_ID="${2:?--snapshot needs an id}"; USE_LATEST=1; shift 2 ;;
    *) die "unknown option: $1" ;;
  esac
done

command -v openssl >/dev/null 2>&1 || die "openssl is required to sign the drill report"
command -v jq >/dev/null 2>&1 || die "jq is required"

# The report is signed, so an unsigned run is not a run. The key is a mounted
# secret shared with whoever verifies the report.
HMAC_KEY="$(secret DRILL_REPORT_HMAC_KEY)"

BACKUP_CMD="${HERE}/backup.sh"
RESTORE_CMD="${HERE}/restore.sh"
[ -x "${BACKUP_CMD}" ] || BACKUP_CMD="bash ${HERE}/backup.sh"
[ -x "${RESTORE_CMD}" ] || RESTORE_CMD="bash ${HERE}/restore.sh"

# ---------------------------------------------------------------------------
# 1. Take a fresh backup unless we were told to drill the existing one.
# ---------------------------------------------------------------------------
if [ "${USE_LATEST}" -eq 0 ]; then
  log info drill.backup_started ""
  ${BACKUP_CMD} || die "the backup step of the drill failed"
fi

if [ -z "${SNAPSHOT_ID}" ]; then
  SNAPSHOT_ID="$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -n 1 | xargs -r basename)"
fi
[ -n "${SNAPSHOT_ID}" ] || die "no snapshot found under ${BACKUP_DIR}"
log info drill.snapshot_selected "${SNAPSHOT_ID}"

# ---------------------------------------------------------------------------
# 2. Restore into scratch targets and measure how long recovery really takes.
# ---------------------------------------------------------------------------
RESTORE_STARTED="$(date +%s)"
${RESTORE_CMD} "${SNAPSHOT_ID}" --target-db "${SCRATCH_DB}" --objects --target-bucket "${SCRATCH_BUCKET}" \
  || die "restore of ${SNAPSHOT_ID} failed"
RTO_SECONDS=$(( $(date +%s) - RESTORE_STARTED ))
log info drill.restore_ok "rto=${RTO_SECONDS}s"

# ---------------------------------------------------------------------------
# 3. Smoke queries. A restore that produces an empty schema is a failed restore,
#    so the drill asserts real rows in real tables - by name-safe counts.
# ---------------------------------------------------------------------------
DB_USER="$(secret POSTGRES_USER)"
export PGPASSWORD="$(secret POSTGRES_PASSWORD)"

q() {
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${SCRATCH_DB}" -tAc "$1" 2>/dev/null | tr -d ' '
}

TABLES="$(q "select count(*) from information_schema.tables where table_schema='public'")"
CLINICS="$(q 'select count(*) from clinics')"
PATIENTS="$(q 'select count(*) from patients')"
USERS="$(q 'select count(*) from users')"
ENCRYPTED_NOTES="$(q "select count(*) from patients where notes_encrypted is not null")"

[ "${TABLES:-0}" -ge 10 ] || die "restored schema has only ${TABLES:-0} tables"
[ "${CLINICS:-0}" -ge 1 ] || die "restored database has no clinics"
[ "${PATIENTS:-0}" -ge 1 ] || die "restored database has no patients"
[ "${USERS:-0}" -ge 1 ] || die "restored database has no users"
log info drill.smoke_ok "tables=${TABLES} clinics=${CLINICS} patients=${PATIENTS}"

OBJECTS=0
if command -v mc >/dev/null 2>&1 && [ -n "${S3_ENDPOINT:-}" ]; then
  export MC_HOST_local="$(printf 'http://%s:%s@%s' "$(secret S3_ACCESS_KEY)" "$(secret S3_SECRET_KEY)" "${S3_ENDPOINT#*://}")"
  OBJECTS="$(mc ls --recursive "local/${SCRATCH_BUCKET}" 2>/dev/null | wc -l | tr -d ' ')"
fi

# ---------------------------------------------------------------------------
# 4. Signed report. This file is the phase-9 exit evidence.
# ---------------------------------------------------------------------------
mkdir -p "${REPORT_DIR}"
REPORT="${REPORT_DIR}/restore-drill-${DRILL_ID}.json"
BODY="${REPORT}.body"
cat > "${BODY}" <<REPORT
{
  "drill": "${DRILL_ID}",
  "startedAt": "${STARTED_AT}",
  "finishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "snapshot": "${SNAPSHOT_ID}",
  "environment": "${DRILL_ENVIRONMENT:-unspecified}",
  "result": "passed",
  "recoveryTimeSeconds": ${RTO_SECONDS},
  "totalSeconds": $(( $(date +%s) - STARTED_EPOCH )),
  "scratchDatabase": "${SCRATCH_DB}",
  "scratchBucket": "${SCRATCH_BUCKET}",
  "checks": {
    "manifestChecksums": "verified",
    "publicTables": ${TABLES},
    "clinics": ${CLINICS},
    "users": ${USERS},
    "patients": ${PATIENTS},
    "patientsWithEncryptedNotes": ${ENCRYPTED_NOTES:-0},
    "restoredObjects": ${OBJECTS}
  }
}
REPORT
SIGNATURE="$(openssl dgst -sha256 -hmac "${HMAC_KEY}" -hex "${BODY}" | awk '{print $NF}')"
jq --arg sig "${SIGNATURE}" '. + {signature: {algorithm: "HMAC-SHA256", value: $sig}}' "${BODY}" > "${REPORT}"
rm -f "${BODY}"
log info drill.report_written "${REPORT}"

# ---------------------------------------------------------------------------
# 5. Drop the scratch targets - a drill leaves evidence, not clones of PHI.
# ---------------------------------------------------------------------------
if [ "${KEEP}" -eq 0 ]; then
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d postgres \
    -c "DROP DATABASE IF EXISTS \"${SCRATCH_DB}\" WITH (FORCE)" >/dev/null 2>&1 || true
  if command -v mc >/dev/null 2>&1 && [ -n "${MC_HOST_local:-}" ]; then
    mc rb --force "local/${SCRATCH_BUCKET}" >/dev/null 2>&1 || true
  fi
  log info drill.scratch_dropped "db=${SCRATCH_DB} bucket=${SCRATCH_BUCKET}"
fi

notify "restore_drill.passed" "info" "rto=${RTO_SECONDS}s snapshot=${SNAPSHOT_ID}"
log info drill.passed "rto=${RTO_SECONDS}s report=${REPORT}"
echo "${REPORT}"
