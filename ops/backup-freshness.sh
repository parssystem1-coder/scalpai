#!/usr/bin/env bash
# Backup freshness monitor (R10): stale or missing evidence is an alert and a
# non-zero result. It never treats a cron process being alive as fresh data.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RPO_HOURS="${BACKUP_RPO_HOURS:-24}"
STATUS_FILE="${BACKUP_DIR}/last-run.json"
WEBHOOK="${ALERT_WEBHOOK_URL:-}"

alert() {
  local event="$1" detail="$2"
  if [ -n "${WEBHOOK}" ]; then
    curl -fsS -m 10 -X POST -H 'content-type: application/json' \
      --data "{\"event\":\"${event}\",\"severity\":\"critical\",\"source\":\"backup-freshness\",\"detail\":\"${detail}\"}" \
      "${WEBHOOK}" >/dev/null 2>&1 || true
  fi
}

fail() {
  alert "backup.stale" "$1"
  printf 'backup freshness check failed: %s\n' "$1" >&2
  exit 1
}

[ -r "${STATUS_FILE}" ] || fail "missing ${STATUS_FILE}"
command -v jq >/dev/null 2>&1 || fail "jq is required"

state="$(jq -r '.state // empty' "${STATUS_FILE}")"
finished="$(jq -r '.finishedAt // empty' "${STATUS_FILE}")"
[ "${state}" = "ok" ] || fail "last backup state is '${state:-unknown}'"
[ -n "${finished}" ] || fail "last backup has no finishedAt"

finished_epoch="$(date -u -d "${finished}" +%s 2>/dev/null || true)"
[ -n "${finished_epoch}" ] || fail "invalid finishedAt"
now_epoch="$(date -u +%s)"
age_seconds=$((now_epoch - finished_epoch))
max_age_seconds=$((RPO_HOURS * 3600))
[ "${age_seconds}" -ge 0 ] || fail "finishedAt is in the future"
[ "${age_seconds}" -le "${max_age_seconds}" ] || fail "last backup is ${age_seconds}s old (RPO=${RPO_HOURS}h)"

printf 'backup freshness ok: age=%ss rpo=%sh\n' "${age_seconds}" "${RPO_HOURS}"
