-- 0022__phase5_wave2_smsir_channel.sql — موج ۲ (D07): کانال SMS.ir + بازکردن قفل enum
-- (expand → migrate → contract)
--
-- چرا: 0017 کانال را در سه جا به پنج مقدار قفل بود — تابع پس‌نده‌ی steps و دو
-- CHECK روی message_log / inbound_messages. آداپتور واقعی SMS.ir (ADR-0052)
-- کانال ششم را می‌آورد؛ بدون این migration هر enqueue روی `smsir` در سطح
-- دیتابیس مرد.
--
-- عمداً این migration ردیفی برای webhook_providers seed نمی‌کند: وب‌هوک ورودی
-- SMS.ir در موج ۲ سیم‌کشی نشده (پس ردیف provider یعنی مسیر احراز هویت‌شده‌ای
-- که وجود ندارد) و ستون کلیدِ آن هم webhook_secret است نه secret.
--
-- EXPAND   — بازتعریف fn_aftercare_steps_validate + DROP/ADD دو CHECK با `smsir`
-- MIGRATE  — ندارد؛ همه‌ی مقادیر موجود در مجموعه‌ی قبلی معتبرند و معتبر می‌مانند
-- CONTRACT — همان قیدها با مجموعه‌ی شش‌تایی (قید سخت‌تر نمی‌شود؛ باز می‌شود)
--
-- ROLLBACK: packages/db/sql/rollback/0022__phase5_wave2_smsir_channel.down.sql

-- ── EXPAND: تابع پس‌نده‌ی steps (متن 0017 با یک مقدار بیشتر) ──────────────
CREATE OR REPLACE FUNCTION fn_aftercare_steps_validate() RETURNS trigger AS $$
DECLARE
  s jsonb;
BEGIN
  IF jsonb_typeof(NEW.steps) <> 'array' THEN
    RAISE EXCEPTION 'steps must be a jsonb array';
  END IF;
  FOR s IN SELECT jsonb_array_elements(NEW.steps)
  LOOP
    IF jsonb_typeof(s) <> 'object' THEN
      RAISE EXCEPTION 'each step must be a jsonb object';
    END IF;
    IF s->>'templateKey' IS NULL OR s->>'channel' IS NULL THEN
      RAISE EXCEPTION 'each step must have templateKey and channel';
    END IF;
    IF (s->>'channel') NOT IN ('kavenegar', 'smsir', 'bale', 'eitaa', 'telegram', 'whatsapp') THEN
      RAISE EXCEPTION 'step channel must be one of kavenegar, smsir, bale, eitaa, telegram, whatsapp';
    END IF;
    IF (s->>'offsetHours') IS NULL OR (s->>'offsetHours') !~ '^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'step offsetHours must be a numeric string (1-5 digits)';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تریگر خودش CREATE TRIGGER IF NOT EXISTS ندارد؛ همان مسیر idempotent 0017:
DROP TRIGGER IF EXISTS trg_aftercare_sequences_steps_validate ON aftercare_sequences;
CREATE TRIGGER trg_aftercare_sequences_steps_validate
  BEFORE INSERT OR UPDATE ON aftercare_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_aftercare_steps_validate();

-- ── EXPAND: CHECK ستون message_log.channel ────────────────────────────────
ALTER TABLE message_log DROP CONSTRAINT IF EXISTS message_log_channel_check;
ALTER TABLE message_log
  ADD CONSTRAINT message_log_channel_check
  CHECK (channel IN ('kavenegar', 'smsir', 'bale', 'eitaa', 'telegram', 'whatsapp'));

-- ── EXPAND: CHECK ستون inbound_messages.channel ───────────────────────────
ALTER TABLE inbound_messages DROP CONSTRAINT IF EXISTS inbound_messages_channel_check;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_channel_check
  CHECK (channel IN ('kavenegar', 'smsir', 'bale', 'eitaa', 'telegram', 'whatsapp'));

-- ── MIGRATE: ندارد — هیچ ردیفی مقدار نامعتبر ندارد ────────────────────────

-- ── CONTRACT: همان قیدها با مجموعه‌ی شش‌تایی؛ سخت‌گیری کاهش یافته نه افزوده ─
-- (بالا همین کار انجام شد — این بخش به تعهد expand→contract صادق می‌ماند)

-- اثبات زنده‌ی CONTRACT (هر دو باید داخل همین تراکنش رد شوند؛ بسته‌بودن
-- مجموعه برای کانال‌های خارج از آن معنای عملی دارد):
DO $$
BEGIN
  BEGIN
    INSERT INTO message_log (clinic_id, patient_id, channel, template_key, locale, body_sha256, body_chars)
    VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
            'unknown-channel', 'probe', 'fa', repeat('0', 64::int), 0);
    RAISE EXCEPTION 'CONTRACT BROKEN: message_log accepted a channel outside the closed set';
  EXCEPTION WHEN check_violation THEN
    NULL; -- مورد انتظار
  END;
  BEGIN
    INSERT INTO inbound_messages (clinic_id, channel, sender_hash, body_encrypted)
    VALUES ('00000000-0000-0000-0000-000000000000', 'unknown-channel', repeat('0', 64::int), ''::bytea);
    RAISE EXCEPTION 'CONTRACT BROKEN: inbound_messages accepted a channel outside the closed set';
  EXCEPTION WHEN check_violation THEN
    NULL; -- مورد انتظار
  END;
END $$;
