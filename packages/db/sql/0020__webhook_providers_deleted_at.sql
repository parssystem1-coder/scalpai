-- 0020__webhook_providers_deleted_at.sql — B5: soft-delete for webhook_providers
-- (expand → migrate → contract)

-- EXPAND: add deleted_at column
ALTER TABLE webhook_providers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Update partial unique index to exclude soft-deleted rows
DROP INDEX IF EXISTS webhook_providers_provider_active_uq;
CREATE UNIQUE INDEX webhook_providers_provider_active_uq
  ON webhook_providers (provider)
  WHERE active = true AND deleted_at IS NULL;

-- MIGRATE: no data to backfill (new table, all existing rows have deleted_at = NULL)

-- CONTRACT: nothing to revoke (RLS + REVOKE DELETE already in 0019)
