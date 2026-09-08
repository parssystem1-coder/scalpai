-- 0016__phase10_quarantine_rls.sql — فاز ۱۰: بستن RLS روی جدول‌های quarantine
-- (ADR-0045 — انحراف گیت batch 3)
--
-- مایگریشن 0012 دو جدول quarantine ساخت و آن‌ها را فقط با REVOKE از نقش اپلیکیشن
-- دور نگه داشت. قاعده `tenant-safety` در tools/conformance/rules/v1.ts فهرست
-- جدول‌ها را از خودِ SQL استخراج می‌کند و برای هر جدولی که migration می‌سازد
-- ENABLE + FORCE ROW LEVEL SECURITY می‌خواهد؛ این دو جدول تنها موارد بی‌RLS بودند:
-- چهار violation واقعی، نه نویز — و REVOKE جای RLS را نمی‌گیرد، چون یک
-- `GRANT ... ON ALL TABLES` بعدی می‌تواند دسترسی را برگرداند.
--
-- چرا فایل جدید و نه ویرایش 0012: خود 0012 در همان تراکنش متن خام PHI را با نقش
-- owner به این جدول‌ها INSERT می‌کند و FORCE RLS مالک جدول را هم مقید می‌کند. روشن
-- کردن آن پیش از آن INSERTها مایگریشن را روی یک دیتابیس تازه می‌شکند.
--
-- عمداً بدون هیچ policy: این جدول‌ها مقصد داده‌ی پیش از فاز ۶ هستند و هیچ مسیر
-- runtime نباید بخواندشان. کار اپراتور (رمزکردن دوباره و حذف) با نقش migrate
-- انجام می‌شود، نه با نقش اپلیکیشن.
--
-- Rollback:
--   ALTER TABLE phi_plaintext_quarantine NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE phi_plaintext_quarantine DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE consent_signature_quarantine NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE consent_signature_quarantine DISABLE ROW LEVEL SECURITY;

ALTER TABLE phi_plaintext_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE phi_plaintext_quarantine FORCE ROW LEVEL SECURITY;

ALTER TABLE consent_signature_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_signature_quarantine FORCE ROW LEVEL SECURITY;

-- همان مرز دسترسی 0012 و applyGrants، تکرارشده تا RLS لایه دوم باشد نه تنها لایه.
REVOKE ALL ON phi_plaintext_quarantine FROM scalpai_app;
REVOKE ALL ON consent_signature_quarantine FROM scalpai_app;
