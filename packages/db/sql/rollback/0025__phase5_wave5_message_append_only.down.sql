-- ════════════════════════════════════════════════════════════
-- Rollback 0025 — حذف گاردهای append-only (ADR-0057 / D22)
-- ════════════════════════════════════════════════════════════
-- ساختار دیتا تغییر نمی‌کند (هیچ ستون/جدولی اضافه نشده بود)؛ فقط triggerها و
-- تابع گارد حذف می‌شوند تا جدول‌ها به رفتار پیش از 0025 برگردند.

DROP TRIGGER IF EXISTS trg_message_log_no_mutate ON message_log;
DROP TRIGGER IF EXISTS trg_inbound_no_mutate ON inbound_messages;
DROP FUNCTION IF EXISTS fn_message_no_mutate();
