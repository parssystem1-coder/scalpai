DROP INDEX IF EXISTS webhook_providers_provider_active_uq;
CREATE UNIQUE INDEX webhook_providers_provider_active_uq
  ON webhook_providers (provider)
  WHERE active = true;

ALTER TABLE webhook_providers DROP COLUMN IF EXISTS deleted_at;
