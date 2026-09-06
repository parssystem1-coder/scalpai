#!/usr/bin/env bash
set -euo pipefail

# ScalpAI Clinic Encrypted Backup Restore Script
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <path_to_backup_file.sql.gz.enc>"
    exit 1
fi

BACKUP_FILE="$1"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-scalpai}"
DB_USER="${POSTGRES_USER:-scalpai}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-scalpai_secure_backup_key}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}"
    exit 1
fi

echo "[$(date)] Decrypting and restoring ${BACKUP_FILE} to ${DB_NAME}..."
PGPASSWORD="${POSTGRES_PASSWORD:-scalpai_secure_pwd}" openssl enc -d -aes-256-cbc -pbkdf2 -pass "pass:${PASSPHRASE}" -in "${BACKUP_FILE}" \
  | gunzip \
  | pg_restore \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      --clean \
      --if-exists \
      --no-owner \
      --no-privileges

echo "[$(date)] Restore completed successfully."
