-- rollback/0021__payment_attempts.down.sql — بازگردانی payment_attempts
--
-- اجرا با نقش migrate:
--   psql "$MIGRATE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f packages/db/sql/rollback/0021__payment_attempts.down.sql
--
-- هشدار: با رفتن این جدول، حالت پرداخت به Map درون‌حافظه برنمی‌گردد —
-- کدِ 0021 به بعد به این جدول تکیه دارد. rollback فقط همراه با برگرداندن
-- همان کامیت اپلیکیشن معنا دارد.

BEGIN;

DROP TRIGGER IF EXISTS trg_payment_attempts_updated_at ON payment_attempts;
DROP FUNCTION IF EXISTS fn_payment_attempt_clinic(text);
DROP TABLE IF EXISTS payment_attempts;

DELETE FROM __migrations WHERE name = '0021__payment_attempts.sql';

COMMIT;

-- REVOKE گام CONTRACT برگردانده نمی‌شود: جدول رفته است و applyGrants در اجرای
-- بعدی migrate() دسترسی پایه را از نو می‌سازد.
