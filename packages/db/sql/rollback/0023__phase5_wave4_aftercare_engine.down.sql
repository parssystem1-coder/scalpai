-- 0023__phase5_wave4_aftercare_engine.down.sql — rollback موج ۴
-- بازگشت به وضعیت 0022: بدون condition/on_reply و بدون یادآوری جلسه.
-- ⚠ داده‌ها: ردیف‌های پیام ساخته‌شده با پیشوند sessrem: در message_log می‌مانند
-- (append-only طبق 0017)؛ فقط منطق حذف می‌شود نه ردیف‌ها.

-- ۱) ستون session_id (اگر ردیفی ندارد، ستون هم بی‌خطر حذف می‌شود)
ALTER TABLE message_log DROP CONSTRAINT IF EXISTS message_log_session_id_fkey;
DROP INDEX IF EXISTS message_log_session_idx;
ALTER TABLE message_log DROP COLUMN IF EXISTS session_id;

-- ۲) تابع یادآوری جلسه
DROP FUNCTION IF EXISTS fn_aftercare_claim_session_reminders(uuid, integer[]);

-- ۲) تابع کشف کلینیک — به متن 0018/0021 (فقط enrollments) برمی‌گردد
CREATE OR REPLACE FUNCTION fn_aftercare_due_clinics(p_limit integer DEFAULT 200)
RETURNS TABLE (clinic_id uuid, clinic_name text, clinic_timezone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'clinic discovery limit must be between 1 and 1000' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.timezone
    FROM clinics c
   WHERE c.status = 'active'
     AND EXISTS (
       SELECT 1
         FROM aftercare_enrollments e
        WHERE e.clinic_id = c.id
          AND e.state = 'active'
          AND e.next_run_at IS NOT NULL
          AND e.next_run_at <= now()
     )
   ORDER BY c.id
   LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_aftercare_due_clinics(integer) TO scalpai_app;

-- ۳) تابع پس‌نده‌ی steps — متن 0022 (بدون condition/on_reply)
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

DROP TRIGGER IF EXISTS trg_aftercare_sequences_steps_validate ON aftercare_sequences;
CREATE TRIGGER trg_aftercare_sequences_steps_validate
  BEFORE INSERT OR UPDATE ON aftercare_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_aftercare_steps_validate();
