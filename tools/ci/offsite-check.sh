#!/usr/bin/env bash
#
# Off-site immutability check (phase 9 / C10, ADR-0042).
#
# Two claims are worth nothing unless something tries to break them:
#   1. the snapshot really left the host, complete;
#   2. it cannot be deleted while its retention lock is in force.
#
# So this script counts the uploaded objects and then ATTEMPTS A DELETE, failing
# the gate if the delete succeeds. "Immutable" is a test result here, not a
# sentence in a README.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR is required}"
BUCKET="${BACKUP_OFFSITE_BUCKET:?BACKUP_OFFSITE_BUCKET is required}"
ENDPOINT="${BACKUP_OFFSITE_ENDPOINT:?BACKUP_OFFSITE_ENDPOINT is required}"
KEY="${BACKUP_OFFSITE_ACCESS_KEY:?BACKUP_OFFSITE_ACCESS_KEY is required}"
SECRET="${BACKUP_OFFSITE_SECRET_KEY:?BACKUP_OFFSITE_SECRET_KEY is required}"

export MC_HOST_offsite="$(printf '%s://%s:%s@%s' "${ENDPOINT%%://*}" "${KEY}" "${SECRET}" "${ENDPOINT#*://}")"

SNAPSHOT="$(find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -name '20*' | sort | tail -n 1 | xargs -r basename)"
if [ -z "${SNAPSHOT}" ]; then
  echo "::error::no local snapshot found in ${BACKUP_DIR}"
  exit 1
fi
echo "checking off-site copy of snapshot ${SNAPSHOT}"

FILES="$(mc ls --recursive "offsite/${BUCKET}/${SNAPSHOT}/" | wc -l | tr -d ' ')"
echo "off-site files: ${FILES}"
if [ "${FILES}" -lt 4 ]; then
  echo "::error::off-site snapshot is incomplete (${FILES} files, expected at least 4)"
  exit 1
fi

for required in manifest.json.age postgres.dump.age objects.tar.gz.age; do
  if ! mc stat "offsite/${BUCKET}/${SNAPSHOT}/${required}" > /dev/null 2>&1; then
    echo "::error::off-site snapshot is missing ${required}"
    exit 1
  fi
done

mc retention info "offsite/${BUCKET}/${SNAPSHOT}/manifest.json.age" || true

if mc rm --force "offsite/${BUCKET}/${SNAPSHOT}/manifest.json.age" > /dev/null 2>&1; then
  echo "::error::the off-site snapshot could be DELETED - the retention lock is not in force"
  exit 1
fi
echo "off-site snapshot is complete and refuses deletion while locked"
