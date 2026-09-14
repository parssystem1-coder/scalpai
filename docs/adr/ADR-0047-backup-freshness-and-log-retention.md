# ADR-0047: Backup freshness and bounded log retention

- **Status:** accepted for Phase 4 Wave 2
- **Date:** 2026-09-14
- **Scope:** backup RPO monitoring and self-hosted container logs

## Decision

The backup service writes `last-run.json` after a successful encrypted PostgreSQL and MinIO snapshot. A separate `scalpai-backup-freshness` cron check reads that evidence every 15 minutes. Missing, failed, malformed, future-dated, or older-than-`BACKUP_RPO_HOURS` evidence produces a critical `backup.stale` alert and exits non-zero. A live cron process is not considered proof of a fresh backup.

Production services use Docker's `json-file` driver with a maximum log size of 10 MiB and five rotated files. This bounds local disk use while retaining a finite operational window; long-term audit evidence remains in the dedicated CI/artifact and alerting paths rather than unbounded container logs.

## Evidence

The implementation is in `ops/backup-freshness.sh`, `ops/backup.Dockerfile`, and `ops/prod.yml`. Regression coverage is in `tools/ops/backup.phase9.spec.ts`.
