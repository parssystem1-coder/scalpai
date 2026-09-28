-- ════════════════════════════════════════════════════════════
-- موج ۵ / D22 — message_log و inbound_messages append-only (ADR-0057)
-- ════════════════════════════════════════════════════════════
--
-- سند بدهی برای D22 دو مسیر مجاز گذاشته بود: `deleted_at` یا ADR append-only.
-- تصمیم (ADR-0057): append-only با قید دیتابیسی. حذف نرم «قابلیت حذفِ قابل
-- انکار» می‌خرد (هیچ‌چیز جلوی UPDATE ... SET deleted_at را نمی‌گیرد) و فیلتر
-- live را به ۷+ محل کوئری تزریق می‌کند؛ در مقابل، trigger اینجا هر DELETE و هر
-- بازنویسیِ خارج از الگو را در سطح دیتابیس رد می‌کند.
--
-- الگوی مجاز (همان‌هایی که code امروز انجام می‌دهد — هیچ مسیر محصولی نمی‌شکند):
--
-- message_log (ردیف بدو تولد placeholder است: state='queued'، بدون body):
--   · گذر وضعیت فقط رو به جلو: queued→sent|failed|suppressed، sent→delivered|failed
--     و بی‌اثر (s→s). گذر به عقب یا پرش نامجاز خطاست.
--   · در فاز queued پر کردن placeholder مجاز است (fillSessionReminder:
--     channel/locale/recipient_hash/body_*/vars_redacted/provider/shadows و
--     markMessageSent: provider/provider_message_id/sent_at).
--   · پس از خروج از queued فقط state/زمان‌ها/attempts/last_error/updated_at
--     تغییر می‌کنند؛ محتوای پیام ثابت است.
--   · attempts و last_error همیشه مجازند (شمارنده‌ی تلاش و دلیلِ خواندنی).
--
-- inbound_messages (پیام بیمار — بدنه phi.v1 bound به خود ردیف):
--   · زنجیره‌ی وضعیت فقط رو به جلو: new→read|replied|archived،
--     read→replied|archived، replied→archived (قرارداد InboundMessageUpdate) و
--     بی‌اثر. handled_by/handled_at/intent آزادند — متادیتای رسیدگی/طبقه‌بندی‌اند
--     نه محتوا؛ setInboundState در هر PATCH مجازِ state آن‌ها را می‌نویسد.
--   · بقیه‌ی ستون‌ها (channel/provider/sender_hash/patient/enrollment/reply و
--     shadows و body_*/received_at) پس از درج ثابت‌اند.
--
-- DELETE روی هر دو جدول همیشه خطاست. TRUNCATE عمداً بای‌پس می‌ماند — row-level
-- trigger روی TRUNCATE اجرا نمی‌شود و این تنها مسیر ابزارهای تست/بازیابی است؛
-- نقش‌های اپ به هیچ‌کدام دسترسی ندارند (مثل بقية گاردهای 0012/0017).

-- ════════════════════════════════════════════════════════════
-- ۱) تابع گارد (شاخه بر اساس TG_TABLE_NAME)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_message_no_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    RAISE EXCEPTION
      'append-only (ADR-0057/D22): % rows may not be deleted (msg_no_mutate)',
      TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- ── message_log ────────────────────────────────────────────
  IF (TG_TABLE_NAME = 'message_log') THEN
    IF NOT (
      NEW.state = OLD.state
      OR (OLD.state = 'queued' AND NEW.state IN ('sent', 'failed', 'suppressed'))
      OR (OLD.state = 'sent'   AND NEW.state IN ('delivered', 'failed'))
    ) THEN
      RAISE EXCEPTION
        'append-only (ADR-0057/D22): illegal message_log state transition % -> % (msg_no_mutate)',
        OLD.state, NEW.state
        USING ERRCODE = 'check_violation';
    END IF;

    -- محتوای پیام پس از فاز queued (placeholder) ثابت است.
    IF OLD.state <> 'queued' THEN
      IF NEW.clinic_id                        IS DISTINCT FROM OLD.clinic_id
         OR NEW.enrollment_id                 IS DISTINCT FROM OLD.enrollment_id
         OR NEW.enrollment_parent_clinic_id   IS DISTINCT FROM OLD.enrollment_parent_clinic_id
         OR NEW.session_id                    IS DISTINCT FROM OLD.session_id
         OR NEW.session_parent_clinic_id      IS DISTINCT FROM OLD.session_parent_clinic_id
         OR NEW.patient_id                    IS DISTINCT FROM OLD.patient_id
         OR NEW.patient_parent_clinic_id      IS DISTINCT FROM OLD.patient_parent_clinic_id
         OR NEW.step_index                    IS DISTINCT FROM OLD.step_index
         OR NEW.channel                       IS DISTINCT FROM OLD.channel
         OR NEW.template_key                  IS DISTINCT FROM OLD.template_key
         OR NEW.locale                        IS DISTINCT FROM OLD.locale
         OR NEW.recipient_hash                IS DISTINCT FROM OLD.recipient_hash
         OR NEW.body_sha256                   IS DISTINCT FROM OLD.body_sha256
         OR NEW.body_chars                    IS DISTINCT FROM OLD.body_chars
         OR NEW.vars_redacted                 IS DISTINCT FROM OLD.vars_redacted
         OR NEW.queued_at                     IS DISTINCT FROM OLD.queued_at
      THEN
        RAISE EXCEPTION
          'append-only (ADR-0057/D22): message_log content is immutable after the queued phase (msg_no_mutate)'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- ── inbound_messages ───────────────────────────────────────
  IF NOT (
    NEW.state = OLD.state
    OR (OLD.state = 'new'     AND NEW.state IN ('read', 'replied', 'archived'))
    OR (OLD.state = 'read'    AND NEW.state IN ('replied', 'archived'))
    OR (OLD.state = 'replied' AND NEW.state = 'archived')
  ) THEN
    RAISE EXCEPTION
      'append-only (ADR-0057/D22): illegal inbound_messages state transition % -> % (msg_no_mutate)',
      OLD.state, NEW.state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.clinic_id                       IS DISTINCT FROM OLD.clinic_id
     OR NEW.channel                      IS DISTINCT FROM OLD.channel
     OR NEW.provider                     IS DISTINCT FROM OLD.provider
     OR NEW.provider_message_id          IS DISTINCT FROM OLD.provider_message_id
     OR NEW.sender_hash                  IS DISTINCT FROM OLD.sender_hash
     OR NEW.patient_id                   IS DISTINCT FROM OLD.patient_id
     OR NEW.patient_parent_clinic_id     IS DISTINCT FROM OLD.patient_parent_clinic_id
     OR NEW.enrollment_id                IS DISTINCT FROM OLD.enrollment_id
     OR NEW.enrollment_parent_clinic_id  IS DISTINCT FROM OLD.enrollment_parent_clinic_id
     OR NEW.reply_to_message_id          IS DISTINCT FROM OLD.reply_to_message_id
     OR NEW.reply_parent_clinic_id       IS DISTINCT FROM OLD.reply_parent_clinic_id
     OR NEW.body_encrypted               IS DISTINCT FROM OLD.body_encrypted
     OR NEW.body_key_id                  IS DISTINCT FROM OLD.body_key_id
     OR NEW.body_sha256                  IS DISTINCT FROM OLD.body_sha256
     OR NEW.body_preview                 IS DISTINCT FROM OLD.body_preview
     OR NEW.received_at                  IS DISTINCT FROM OLD.received_at
  THEN
    RAISE EXCEPTION
      'append-only (ADR-0057/D22): inbound_messages content is immutable after insert (msg_no_mutate)'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- ۲) اتصال trigger به هر دو جدول
-- ════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_message_log_no_mutate ON message_log;
CREATE TRIGGER trg_message_log_no_mutate
  BEFORE UPDATE OR DELETE ON message_log
  FOR EACH ROW
  EXECUTE FUNCTION fn_message_no_mutate();

DROP TRIGGER IF EXISTS trg_inbound_no_mutate ON inbound_messages;
CREATE TRIGGER trg_inbound_no_mutate
  BEFORE UPDATE OR DELETE ON inbound_messages
  FOR EACH ROW
  EXECUTE FUNCTION fn_message_no_mutate();
