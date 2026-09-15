-- rollback/0018__phase5a_worker_discovery.down.sql
--
-- مانند 0017، عمداً بیرون از packages/db/sql تا هرگز به‌عنوان مایگریشن پیش‌رو
-- برداشته نشود.
--
--   psql "$MIGRATE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f packages/db/sql/rollback/0018__phase5a_worker_discovery.down.sql
--
-- این rollback داده‌ای را از بین نمی‌برد. تنها اثرش این است که ورکر aftercare
-- دیگر نمی‌تواند کلینیک‌های دارای کار را پیدا کند و عملاً خاموش می‌شود —
-- مسیرهای HTTP (ساخت دنباله، ثبت‌نام، inbox) دست‌نخورده کار می‌کنند.

BEGIN;

REVOKE EXECUTE ON FUNCTION fn_aftercare_due_clinics(integer) FROM scalpai_app;
DROP FUNCTION IF EXISTS fn_aftercare_due_clinics(integer);

DELETE FROM __migrations WHERE name = '0018__phase5a_worker_discovery.sql';

COMMIT;
