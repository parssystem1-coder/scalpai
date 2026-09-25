-- 0023__phase5_wave4_aftercare_engine.sql — موج ۴ (D15/D16): موتور §6.2
-- (expand → migrate → contract · ADR-0046 · ADR-0055)
--
-- چه می‌کند:
--   D15 — کشف و برداشتن یادآوری جلسه (T−۲۴h و T−۲h) مشتق از sessions.start_at:
--         fn_aftercare_claim_session_reminders با FOR UPDATE SKIP LOCKED و
--         «ثبت پیام = قفل» (idempotency key یکتای message_log از 0017):
--         INSERT پیام داخل همان CTE، duplicate یعنی کارگر دیگری برداشته.
--         fn_aftercare_due_clinics (0018) گارد EXISTS دوم می‌گیرد تا کلینیکِ
--         دارای یادآوری سررسیده هم کشف شود.
--   D16 — شکل condition/on_reply روی گام: همان مسیر 0022 (بازتعریف
--         fn_aftercare_steps_validate) تا قرارداد zod و SQL یک مجموعه را
--         بگویند. jsonb_each روی آبجکت‌ها — pg 15 ندارد؛ حلقه صریح.
--         قید سوئیچ on_reply (که self_reply/clinic ممنوع — stop فقط از بیمار)
--         جای SQL نیست، جای zod است؛ اینجا فقط شکل بسته می‌شود.
--
-- EXPAND   — تابع جدید + بازتعریف تابع پس‌نده (additive)
-- MIGRATE  — ندارد؛ ردیف موجود در شکل قبلی معتبر می‌ماند (condition/on_reply اختیاری)
-- CONTRACT — همان اعتبارسنجی سخت‌ترشده داخل تابع (query بهنگام می‌شود)
-- ROLLBACK: packages/db/sql/rollback/0023__phase5_wave4_aftercare_engine.down.sql

-- ════════════════════════════════════════════════════════════
-- EXPAND 0 (D15) — ستون session_id روی message_log
-- یادآوری جلسه به enrollment تعلق ندارد؛ بدون این ستون، ردیف پیامِ
-- یادآوری نه به دنباله‌ای وصل است نه به جلسه‌ای — ردیف یتیم.
-- ════════════════════════════════════════════════════════════
ALTER TABLE message_log ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS message_log_session_idx ON message_log (clinic_id, session_id);

-- ════════════════════════════════════════════════════════════
-- EXPAND 1 (D16) — بازتعریف fn_aftercare_steps_validate
-- (متن 0022 + پذیرش/اعتبارسنجی condition و on_reply)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_aftercare_steps_validate() RETURNS trigger AS $$
DECLARE
  s jsonb;
  pair record;
  n integer;
  v jsonb;
  allowed text[];
  k text;
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

    -- D16: condition و on_reply اختیاری‌اند، اما اگر بیایند فقط از کلیدهای
    -- بسته می‌پذیرند (ADR-0055: شکل در SQL هم بسته می‌شود، نه فقط zod).
    IF s ? 'condition' AND (s->'condition') <> 'null'::jsonb THEN
      IF jsonb_typeof(s->'condition') <> 'object' THEN
        RAISE EXCEPTION 'step condition must be an object';
      END IF;
      FOR k IN SELECT jsonb_object_keys(s->'condition')
      LOOP
        IF k NOT IN ('sessionStatus', 'patientTag') THEN
          RAISE EXCEPTION 'step condition has unknown key "%"', k;
        END IF;
      END LOOP;
      FOR pair IN SELECT e.key, e.value FROM jsonb_each(s->'condition') e
      LOOP
        IF pair.key = 'sessionStatus' THEN
          IF jsonb_typeof(pair.value) <> 'string'
             OR pair.value #>> '{}' NOT IN ('booked', 'completed', 'cancelled', 'no_show') THEN
            RAISE EXCEPTION 'condition.sessionStatus must be one of booked, completed, cancelled, no_show';
          END IF;
        ELSIF pair.key = 'patientTag' THEN
          IF jsonb_typeof(pair.value) <> 'string' THEN
            RAISE EXCEPTION 'condition.patientTag must be a string';
          END IF;
        END IF;
      END LOOP;
      IF NOT (s->'condition' ? 'sessionStatus') AND NOT (s->'condition' ? 'patientTag') THEN
        RAISE EXCEPTION 'condition must carry at least one of sessionStatus, patientTag';
      END IF;
    END IF;

    IF s ? 'on_reply' AND (s->'on_reply') <> 'null'::jsonb THEN
      IF jsonb_typeof(s->'on_reply') <> 'object' THEN
        RAISE EXCEPTION 'step on_reply must be an object';
      END IF;
      FOR pair IN SELECT e.key, e.value FROM jsonb_each(s->'on_reply') e
      LOOP
        IF pair.key NOT IN ('intent', 'action', 'switchTo', 'skipSteps') THEN
          RAISE EXCEPTION 'on_reply has unknown key "%"', pair.key;
        END IF;
      END LOOP;
      IF (s->'on_reply'->>'intent') IS NULL
         OR (s->'on_reply'->>'intent') NOT IN ('confirm', 'reschedule', 'question', 'unknown') THEN
        RAISE EXCEPTION 'on_reply.intent must be one of confirm, reschedule, question, unknown';
      END IF;
      IF (s->'on_reply'->>'action') IS NULL
         OR (s->'on_reply'->>'action') NOT IN ('switch_to', 'pause_enrollment') THEN
        RAISE EXCEPTION 'on_reply.action must be one of switch_to, pause_enrollment';
      END IF;
      IF (s->'on_reply'->>'action') = 'switch_to' THEN
        IF NOT (s->'on_reply' ? 'switchTo') OR jsonb_typeof(s->'on_reply'->'switchTo') <> 'object' THEN
          RAISE EXCEPTION 'on_reply switch_to needs a switchTo object';
        END IF;
        FOR pair IN
          SELECT e.key, e.value FROM jsonb_each(s->'on_reply'->'switchTo') e
        LOOP
          IF pair.key = 'channel' THEN
            IF jsonb_typeof(pair.value) <> 'string'
               OR pair.value #>> '{}' NOT IN ('kavenegar', 'smsir', 'bale', 'eitaa', 'telegram', 'whatsapp') THEN
              RAISE EXCEPTION 'on_reply.switchTo.channel must be a valid messaging channel';
            END IF;
          ELSIF pair.key = 'templateKey' THEN
            IF jsonb_typeof(pair.value) <> 'string'
               OR pair.value #>> '{}' !~ '^[a-z][a-z0-9_.-]{0,79}$' THEN
              RAISE EXCEPTION 'on_reply.switchTo.templateKey must match ^[a-z][a-z0-9_.-]{0,79}$';
            END IF;
          ELSE
            RAISE EXCEPTION 'on_reply.switchTo has unknown key "%"', pair.key;
          END IF;
        END LOOP;
        IF NOT (s->'on_reply'->'switchTo' ? 'channel') AND NOT (s->'on_reply'->'switchTo' ? 'templateKey') THEN
          RAISE EXCEPTION 'on_reply switch_to needs a channel or templateKey in switchTo';
        END IF;
      ELSE
        -- pause_enrollment: switchTo جایی ندارد
        IF (s->'on_reply' ? 'switchTo') THEN
          RAISE EXCEPTION 'on_reply.switchTo is only valid for action=switch_to';
        END IF;
      END IF;
      IF (s->'on_reply' ? 'skipSteps') THEN
        IF jsonb_typeof(s->'on_reply'->'skipSteps') <> 'array' THEN
          RAISE EXCEPTION 'on_reply.skipSteps must be an array of step indexes';
        END IF;
        n := 0;
        FOR v IN SELECT jsonb_array_elements(s->'on_reply'->'skipSteps')
        LOOP
          IF jsonb_typeof(v) <> 'number' OR v #>> '{}' !~ '^[0-9]{1,2}$' THEN
            RAISE EXCEPTION 'on_reply.skipSteps must be an array of step indexes (0-99)';
          END IF;
          n := n + 1;
          IF n > 40 THEN
            RAISE EXCEPTION 'on_reply.skipSteps has too many entries';
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تریگر خودش IF NOT EXISTS ندارد؛ همان مسیر idempotent 0017/0022
DROP TRIGGER IF EXISTS trg_aftercare_sequences_steps_validate ON aftercare_sequences;
CREATE TRIGGER trg_aftercare_sequences_steps_validate
  BEFORE INSERT OR UPDATE ON aftercare_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_aftercare_steps_validate();

-- ════════════════════════════════════════════════════════════
-- EXPAND 2 (D15) — برداشتن اتمیک یادآوری‌های سررسیده جلسه
-- ════════════════════════════════════════════════════════════
-- دو پرسش که ریویور می‌پرسد و پاسخ‌هایش:
--
--   چرا schedule از یک فایل ENV و نه جدول؟ چون هیچ UI و هیچ مدیریتی برایش
--   وجود ندارد و یک جدول بی‌مدیر، دروغِ پیکربندی است. دو نقطه (۲۴ ساعت و
--   ۲ ساعت پیش از جلسه) با ADR-0055 سازگار است.
--
--   چرا «ثبت پیام = قفل» و نه FOR UPDATE روی sessions؟ چون قفل سطر جلسه،
--   مسیرهای دیگر (check-in، ویرایش نوبت) را بی‌دلیل بلاک می‌کند. رقابت
--   کارگرها روی یکتایی idempotency_key حل می‌شود که دقیقاً همان معنا را
--   دارد: «هر (جلسه، یادآوری) فقط یک پیام».
--
--   چرا state='queued' می‌ماند اگر ثبت شد ولی ارسال نشد؟ چون بعداً worker
--   خط دوم (runSessionReminders در apps/api) همان ردیف‌ها را برمی‌دارد و
--   ارسال می‌کند؛ claiming همانجا اتفاق می‌افتد.
CREATE OR REPLACE FUNCTION fn_aftercare_claim_session_reminders(
  p_clinic uuid,
  p_session_offsets integer[] DEFAULT ARRAY[24, 2]
)
RETURNS TABLE (
  session_id uuid,
  patient_id uuid,
  start_at timestamptz,
  offset_hours integer,
  message_id uuid,
  duplicate boolean
) AS $$
DECLARE
  r record;
  off integer;
  msg uuid;
  dup boolean;
  rec record;
BEGIN
  IF p_session_offsets IS NULL OR array_length(p_session_offsets, 1) IS NULL THEN
    RAISE EXCEPTION 'session offsets must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  FOR off IN SELECT unnest(p_session_offsets)
  LOOP
    -- سررسید: جلسه‌ی booked و آینده‌ای که به نقطه‌ی یادآوری رسیده یا گذشته است.
    -- duplicate=false فقط وقتی است که ردیف واقعا INSERT شده باشد.
    FOR rec IN
      WITH candidates AS (
        SELECT se.id, se.patient_id, se.start_at
          FROM sessions se
         WHERE se.clinic_id = p_clinic
           AND se.status = 'booked'
           AND se.deleted_at IS NULL
           AND se.start_at > now()
           AND se.start_at - make_interval(hours => off) <= now()
         ORDER BY se.start_at
         LIMIT 500
           FOR UPDATE OF se SKIP LOCKED
      ), ins AS (
        INSERT INTO message_log (
          clinic_id, session_id, patient_id, step_index, channel, template_key,
          locale, recipient_hash, body_sha256, body_chars, vars_redacted,
          state, idempotency_key
        )
        SELECT p_clinic, c.id, c.patient_id, off, 'kavenegar', 'session.reminder', 'fa',
               repeat('0', 64), repeat('0', 64), 0, '{}'::jsonb,
               'queued', 'sessrem:' || c.id::text || ':' || off::text
          FROM candidates c
        ON CONFLICT (clinic_id, idempotency_key) DO NOTHING
        RETURNING id, message_log.session_id AS msg_session_id, message_log.patient_id AS msg_patient_id
      )
      SELECT se.id AS sid, se.patient_id AS pid, se.start_at AS sstart,
             m.id AS mid, (m.id IS NULL) AS isdup,
             CASE WHEN m.id IS NULL THEN sess.id ELSE m.id END AS effective_mid
        FROM candidates sess
        LEFT JOIN ins m ON m.msg_session_id = sess.id
        JOIN sessions se ON se.id = sess.id
    LOOP
      session_id := rec.sid;
      patient_id := rec.pid;
      start_at := rec.sstart;
      offset_hours := off;
      message_id := rec.effective_mid;
      duplicate := rec.isdup;
      IF message_id IS NOT NULL THEN
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_aftercare_claim_session_reminders(uuid, integer[]) IS
  'Wave 4 (D15) — atomically claims session reminders due at T-24h and T-2h. The INSERT of a message_log row IS the claim: a unique idempotency key (sessrem:<session>:<offset>) makes a double-claim impossible, so no session lock is held beyond the statement. Recipient/body placeholders are zero-hashes; the API worker fills them at render time and resets them before send.';

-- ════════════════════════════════════════════════════════════
-- MIGRATE — fn_aftercare_due_clinics: کشف کلینیک دارای یادآوری سررسیده
-- (بازنویسی همان تابع 0018 — گارد EXISTS دوم)
-- ════════════════════════════════════════════════════════════
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
     AND (
       EXISTS (
         SELECT 1
           FROM aftercare_enrollments e
          WHERE e.clinic_id = c.id
            AND e.state = 'active'
            AND e.next_run_at IS NOT NULL
            AND e.next_run_at <= now()
       )
       OR EXISTS (
         SELECT 1
           FROM sessions se
          WHERE se.clinic_id = c.id
            AND se.status = 'booked'
            AND se.deleted_at IS NULL
            AND se.start_at > now()
            AND (se.start_at - interval '24 hours' <= now()
              OR se.start_at - interval '2 hours' <= now())
       )
     )
   ORDER BY c.id
   LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION fn_aftercare_due_clinics(integer) IS
  'The scheduler''s ONLY cross-tenant read (phase 5a / ADR-0046). Wave 4 (D15) extends it with a second EXISTS over booked sessions at T-24h/T-2h; the contract is unchanged — clinic identity only, no patient row, no message, no due count.';

-- CONTRACT — دسترسی همان 0018 می‌ماند؛ ولی چون تابع بازتعریف شد، grant دوباره
-- صادر می‌شود تا بازتعریف، دسترسی را از بین نبرده باشد.
GRANT EXECUTE ON FUNCTION fn_aftercare_due_clinics(integer) TO scalpai_app;
GRANT EXECUTE ON FUNCTION fn_aftercare_claim_session_reminders(uuid, integer[]) TO scalpai_app;

-- اثبات زنده‌ی CONTRACT (الگوی 0022): وضعیت نامعتبر جلسه نباید claim شود؛
-- آن را با یک session_status و یک session ظاهراً سررسیده می‌سازیم.
DO $$
DECLARE
  probe_clinic uuid;
  probe_patient uuid;
  claimed int;
BEGIN
  SELECT c.id INTO probe_clinic
    FROM clinics c
   WHERE c.status = 'active'
   ORDER BY c.id
   LIMIT 1;
  IF probe_clinic IS NULL THEN
    RETURN; -- محیط خالی از کلینیک — پروب معنا ندارد
  END IF;
  SELECT p.id INTO probe_patient
    FROM patients p
   WHERE p.clinic_id = probe_clinic AND p.deleted_at IS NULL
   ORDER BY p.id
   LIMIT 1;
  IF probe_patient IS NULL THEN
    RETURN;
  END IF;

  -- جلسه‌ی cancelled که ظاهراً سررسید است؛ باید توسط تابع برندارد شود
  INSERT INTO sessions (id, clinic_id, patient_id, start_at, status)
  VALUES (gen_random_uuid(), probe_clinic, probe_patient, now() + interval '1 hour', 'cancelled');

  SELECT count(*) INTO claimed
    FROM fn_aftercare_claim_session_reminders(probe_clinic, ARRAY[24, 2]::integer[]);
  IF claimed <> 0 THEN
    RAISE EXCEPTION 'CONTRACT BROKEN: fn_aftercare_claim_session_reminders claimed a cancelled session';
  END IF;
END $$;
