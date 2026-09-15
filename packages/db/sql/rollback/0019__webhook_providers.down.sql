-- rollback/0019__webhook_providers.down.sql — بازگردانی webhook_providers
--
-- اجرا با نقش migrate:
--   psql "$MIGRATE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f packages/db/sql/rollback/0019__webhook_providers.down.sql

BEGIN;

DROP TRIGGER IF EXISTS trg_webhook_providers_updated_at ON webhook_providers;
DROP TABLE IF EXISTS webhook_providers;

DELETE FROM __migrations WHERE name = '0019__webhook_providers.sql';

COMMIT;
