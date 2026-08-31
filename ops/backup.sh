#!/usr/bin/env bash
set -euo pipefail

# ScalpAI Clinic Encrypted Backup Script (AES-256-CBC)
BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="scalpai_backup_${TIMESTAMP}.sql.gz.enc"
DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-scalpai}"
DB_USER="${POSTGRES_USER:-scalpai}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-scalpai_secure_backup_key}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date)] Starting encrypted database backup for ${DB_NAME}..."
PGPASSWORD="${POSTGRES_PASSWORD:-scalpai_secure_pwd}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --format=custom \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:${PASSPHRASE}" \
  > "${BACKUP_DIR}/${BACKUP_NAME}"

echo "[$(date)] Backup completed successfully: ${BACKUP_DIR}/${BACKUP_NAME}"

# Retention: keep last 14 daily backups
find "${BACKUP_DIR}" -name "scalpai_backup_*.sql.gz.enc" -mtime +14 -delete || true
