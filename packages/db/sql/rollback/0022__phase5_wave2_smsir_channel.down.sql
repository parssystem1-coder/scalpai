-- 0022 down — بازگشت به مجموعه‌ی بسته‌ی پنج‌تایی 0017
--
-- اجرا با نقش migrate:
--   psql "$MIGRATE_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f packages/db/sql/rollback/0022__phase5_wave2_smsir_channel.down.sql
--
-- اگر ردیفی با channel='smsir' نوشته شده باشد، ADD CONSTRAINT مرد — عمدی است:
-- rollback نباید داده‌ی قابل‌استناد را بی‌صدا حذف کند. ابتدا آن ردیف‌ها را
-- پردازش/منتقل کنید، سپس rollback را دوباره اجرا کنید. این فایل داده‌ای از بین
-- نمی‌برد؛ فقط قیدها را به متن 0017 برمی‌گرداند.

-- ── تابع/تریگر steps به متن 0017 ───────────────────────────────────────────
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
    IF (s->>'channel') NOT IN ('kavenegar', 'bale', 'eitaa', 'telegram', 'whatsapp') THEN
      RAISE EXCEPTION 'step channel must be one of kavenegar, bale, eitaa, telegram, whatsapp';
    END IF;
    IF (s->>'offsetHours') IS NULL OR (s->>'offsetHours') !~ '^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'step offsetHours must be a numeric string (1-5 digits)';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aftercare_sequences_steps_validate ON aftercare_sequences;
CREATE TRIGGER trg_aftercare_sequences_steps_validate
  BEFORE INSERT OR UPDATE ON aftercare_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_aftercare_steps_validate();

-- ── CHECK ها به مجموعه‌ی پنج‌تایی ──────────────────────────────────────────
ALTER TABLE message_log DROP CONSTRAINT IF EXISTS message_log_channel_check;
ALTER TABLE message_log
  ADD CONSTRAINT message_log_channel_check
  CHECK (channel IN ('kavenegar', 'bale', 'eitaa', 'telegram', 'whatsapp'));

ALTER TABLE inbound_messages DROP CONSTRAINT IF EXISTS inbound_messages_channel_check;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_channel_check
  CHECK (channel IN ('kavenegar', 'bale', 'eitaa', 'telegram', 'whatsapp'));

DELETE FROM __migrations WHERE name = '0022__phase5_wave2_smsir_channel.sql';
