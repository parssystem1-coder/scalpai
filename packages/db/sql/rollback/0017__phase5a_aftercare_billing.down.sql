-- rollback/0017__phase5a_aftercare_billing.down.sql — بازگردانی فاز ۵a
--
-- این فایل عمداً بیرون از packages/db/sql است: migrate() فقط فایل‌های `.sql` را از
-- خودِ آن پوشه (بدون بازگشت به زیرپوشه) برمی‌دارد، پس یک down file اینجا هرگز
-- به‌عنوان مایگریشن پیش‌رو اجرا نمی‌شود.
--
-- اجرا با نقش migrate (همان MIGRATE_DATABASE_URL)، نه با نقش اپلیکیشن:
--   psql "$MIGRATE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f packages/db/sql/rollback/0017__phase5a_aftercare_billing.down.sql
--
-- هشدار صریح: این rollback داده‌ای را که 0017 نگه می‌داشت از بین می‌برد —
-- ثبت‌نام‌های aftercare، دفتر پیام و کل صورتحساب‌ها. روی محیطی که پیام فرستاده یا
-- فاکتور صادر کرده، اول backup بگیرید؛ برگرداندنِ یک سند مالی حذف‌شده کار این
-- فایل نیست.
--
-- ترتیب DROP از برگ به ریشه است تا FK ها نشکنند:
--   invoice_items → invoices → products
--   inbound_messages → message_log → aftercare_enrollments → aftercare_sequences

BEGIN;

-- 1) تریگرها و توابع، قبل از جدول‌هایشان
DROP TRIGGER IF EXISTS trg_invoice_items_recalc ON invoice_items;
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
DROP TRIGGER IF EXISTS trg_inbound_messages_updated_at ON inbound_messages;
DROP TRIGGER IF EXISTS trg_message_log_updated_at ON message_log;
DROP TRIGGER IF EXISTS trg_aftercare_enrollments_updated_at ON aftercare_enrollments;
DROP TRIGGER IF EXISTS trg_aftercare_sequences_updated_at ON aftercare_sequences;

DROP FUNCTION IF EXISTS fn_invoice_items_recalc();
DROP FUNCTION IF EXISTS fn_invoice_recalc(uuid, uuid);
DROP FUNCTION IF EXISTS fn_invoice_next_number(uuid);
DROP FUNCTION IF EXISTS fn_aftercare_claim_due(uuid, integer);

-- fn_touch_updated_at عمداً DROP نمی‌شود: مال 0004 است و patients/sessions هنوز
-- به آن تریگر دارند. حذفش این rollback را به یک regression فاز ۳ تبدیل می‌کند.

-- 2) جدول‌ها، از برگ به ریشه
DROP TABLE IF EXISTS invoice_items;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS inbound_messages;
DROP TABLE IF EXISTS message_log;
DROP TABLE IF EXISTS aftercare_enrollments;
DROP TABLE IF EXISTS aftercare_sequences;

-- 3) شمارنده‌هایی که گام MIGRATE باز کرد. فقط ردیف‌های صفر پاک می‌شوند: یک
--    شمارنده غیرصفر مصرف واقعی همان دوره است و صورتحساب پلن به آن تکیه دارد.
DELETE FROM usage_counters
 WHERE metric IN ('messages_sent', 'upload_mb')
   AND value = 0;

-- 4) ردیف مایگریشن، تا migrate بعدی 0017 را دوباره اجرا کند
DELETE FROM __migrations WHERE name = '0017__phase5a_aftercare_billing.sql';

COMMIT;

-- REVOKE های گام CONTRACT برگردانده نمی‌شوند: جدول‌ها رفته‌اند، و applyGrants در
-- اجرای بعدی migrate() دسترسی پایه را از نو می‌سازد.
