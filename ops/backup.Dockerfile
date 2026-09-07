# ScalpAI backup runner (ADR-0042).
#
# The old backup-cron service ran `apk add --no-cache openssl gzip bash` on every
# container start: a restart needed working network access to a package mirror,
# and the tooling was never pinned. It is baked in here instead, and the scripts
# are COPIED in rather than bind-mounted so what runs is what was reviewed.
ARG POSTGRES_IMAGE=postgres:17-alpine
FROM ${POSTGRES_IMAGE}

ARG BACKUP_CRON="0 2 * * *"

# age -> authenticated encryption (X25519 + ChaCha20-Poly1305). Replaces
#        `openssl enc -aes-256-cbc`, which had no integrity protection.
# mc  -> MinIO client: the media bucket is half of the clinical record, so it is
#        backed up next to the database and pushed off-site (ADR-0026 pattern).
RUN apk add --no-cache bash age jq curl tar gzip coreutils openssl ca-certificates \
 && curl -fsSL -o /usr/local/bin/mc https://dl.min.io/client/mc/release/linux-amd64/mc \
 && chmod 0755 /usr/local/bin/mc \
 && mc --version \
 && age --version

COPY ops/backup.sh /usr/local/bin/scalpai-backup
COPY ops/restore.sh /usr/local/bin/scalpai-restore
COPY ops/restore-drill.sh /usr/local/bin/scalpai-restore-drill
RUN chmod 0755 /usr/local/bin/scalpai-backup /usr/local/bin/scalpai-restore /usr/local/bin/scalpai-restore-drill \
 && printf '%s /usr/local/bin/scalpai-backup >> /var/log/backup.log 2>&1\n' "${BACKUP_CRON}" > /etc/crontabs/root

# A dead cron daemon means no backups at all, which is exactly the failure this
# phase exists to remove - so it is a container health signal.
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 \
  CMD pgrep crond > /dev/null || exit 1

CMD ["crond", "-f", "-l", "2"]
