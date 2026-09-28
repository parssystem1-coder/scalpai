-- 0024__phase5_wave5_composite_fk.sql — موج ۵ (D21 / بلاکر B4): FK ترکیبی (clinic_id, id)
-- (expand → migrate → contract)
--
-- مشکل (PHASE-5AB-REVIEW B4): FKهای tenant-owned فاز ۵a تک‌ستونی‌اند —
--   enrollment.patient_id REFERENCES patients(id)
--   invoice.patient_id   REFERENCES patients(id)
--   invoice.session_id   REFERENCES sessions(id)
--   item.invoice_id      REFERENCES invoices(id)
--   item.product_id      REFERENCES products(id)
--   log.enrollment_id / log.patient_id / log.session_id
--   inbound.enrollment_id / inbound.patient_id / inbound.reply_to_message_id
-- یکتایی جهانی id یعنی کلینیک A می‌تواند به ردیف معتبر کلینیک B ارجاع بدهد:
-- RLS سطر خودِ رکورد را می‌بندد اما رابطه‌اش به شیءِ متعلق به کلینیک دیگر
-- باقی می‌ماند — tenant isolation در سطح رابطه نقض می‌شود.
--
-- راه‌حل: هر ارجاع، هم‌زمان به (id, clinic_id)ِ جدول والد گره می‌خورد؛ چون
-- clinic_id روی هر دو سمت باید برابر باشد، ردیفِ cross-tenant دیگر امکانِ
-- ارجاع ندارد — نه از مسیر بگ و نه از مسیر آپدیت. والد بدون clinic_id
-- (services/sessions/patients) هم‌زمان با والدِ بلافصل (clinics) گره می‌خورد،
-- پس گرهِ ترکیبی گرهِ قدیم را کامل جایگزین می‌کند، نه اینکه موازی با آن بماند.
--
-- EXPAND   — ستون‌های shadow `<fk>_parent_clinic_id` (NOT NULL، بدون ایندکس و
--            بدون RLS تعهد تازه) + درج مجدد همان FKها به‌صورت
--            DEFERRABLE INITIALLY IMMEDIATE NOT VALID و VALIDATE جداگانه.
--            NOT VALID یعنی دیپلوی قدیمی که این ستون‌ها را نمی‌شناسد، در
--            فرآیندِ در حال اجرا هیچ INSERT عادی‌ای نمی‌شکند؛ VALIDATE
--            در تراکنشِ خودش داده‌ی موجود را اثبات می‌کند.
-- MIGRATE  — backfill: هر سطر از والدِ بلافصلِ تازه‌بندِ خودش، clinic_idِ
--            واقعی را می‌گیرد. اگر سازوکارهای قبلی درست کار کرده باشند
--            صفر سطر تغییر می‌کند؛ وگرنه این گام همان جایی است که
--            انحراف، نام‌برده و رد می‌شود (کم‌هزینه‌ترین نقطهٔ کشف).
-- CONTRACT — نویسنده‌های سمت SQL به‌روز می‌شوند (fn_aftercare_claim_session_reminders
--            ستون‌های shadow را پر می‌کند) و سپس والدِ قدیمی تک‌ستونی DROP
--            می‌شود؛ گرهِ ترکیبی تنها ارجاع باقی می‌ماند.
--
-- ROLLBACK: packages/db/sql/rollback/0024__phase5_wave5_composite_fk.down.sql
--   ستون‌های shadow می‌مانند (خطرناک نیستند؛ فقط فضای ذخیره‌سازی ریز) و
--   FKهای تک‌ستونی قدیمی از روی گره‌های ترکیبی بازساخته می‌شوند.

-- ════════════════════════════════════════════════════════════
-- EXPAND 1 — پیش‌نیاز REFERENCES (id, clinic_id): unique ترکیبی روی والد
-- ════════════════════════════════════════════════════════════
-- Postgres اجازه نمی‌دهد UNIQUE constraint با NOT VALID ساخته شود
-- (NOT VALID فقط برای CHECK و FK است)، و UNIQUE constraint همیشه به یک
-- ایندکس وابسته است. شکل expand→validate اینجا CREATE UNIQUE INDEX است —
-- همیشه معتبر و همیشه valid؛ ساختنش روی جداول زنده فقط قفل ACCESS EXCLUSIVE
-- کوتاه می‌خواهد و درون همین تراکنش اتمیک است.
CREATE UNIQUE INDEX IF NOT EXISTS aftercare_sequences_id_clinic_key
  ON aftercare_sequences (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS aftercare_enrollments_id_clinic_key
  ON aftercare_enrollments (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS message_log_id_clinic_key
  ON message_log (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_id_clinic_key
  ON invoices (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_id_clinic_key
  ON products (id, clinic_id);
-- patients / sessions فقط مقصدِ ارجاع‌های ترکیبی‌اند (خودشان فرزندِ ترکیبیِ
-- این موج نیستند)؛ unique ترکیبی برای `REFERENCES patients (id, clinic_id)`
-- لازم است:
CREATE UNIQUE INDEX IF NOT EXISTS patients_id_clinic_key
  ON patients (id, clinic_id);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_id_clinic_key
  ON sessions (id, clinic_id);

-- ════════════════════════════════════════════════════════════
-- EXPAND 2 — ستون‌های shadow روی جدول‌های فرزند (بدون FK؛ فقط نگه‌دارنده)
-- ════════════════════════════════════════════════════════════
ALTER TABLE aftercare_enrollments
  ADD COLUMN IF NOT EXISTS sequence_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS patient_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS session_parent_clinic_id uuid;

ALTER TABLE message_log
  ADD COLUMN IF NOT EXISTS enrollment_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS session_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS patient_parent_clinic_id uuid;

ALTER TABLE inbound_messages
  ADD COLUMN IF NOT EXISTS enrollment_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS patient_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS reply_parent_clinic_id uuid;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS patient_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS session_parent_clinic_id uuid;

ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS invoice_parent_clinic_id uuid,
  ADD COLUMN IF NOT EXISTS product_parent_clinic_id uuid;

-- ════════════════════════════════════════════════════════════
-- EXPAND 3 — گره‌های ترکیبی NOT VALID
-- parent_pk + parent_pk_clinic_fkey = گرهِ ترکیبی؛ ردیفِ cross-tenant دیگر
-- از مسیرِ فرزند قابل درج نیست. DEFERRABLE برای bulk load‌های تستی/seed.
-- ════════════════════════════════════════════════════════════
ALTER TABLE aftercare_enrollments
  ADD CONSTRAINT aftercare_enrollments_sequence_fk
  FOREIGN KEY (sequence_id, sequence_parent_clinic_id)
  REFERENCES aftercare_sequences (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE aftercare_enrollments
  ADD CONSTRAINT aftercare_enrollments_patient_fk
  FOREIGN KEY (patient_id, patient_parent_clinic_id)
  REFERENCES patients (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE aftercare_enrollments
  ADD CONSTRAINT aftercare_enrollments_session_fk
  FOREIGN KEY (session_id, session_parent_clinic_id)
  REFERENCES sessions (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;

ALTER TABLE message_log
  ADD CONSTRAINT message_log_enrollment_fk
  FOREIGN KEY (enrollment_id, enrollment_parent_clinic_id)
  REFERENCES aftercare_enrollments (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE message_log
  ADD CONSTRAINT message_log_session_fk
  FOREIGN KEY (session_id, session_parent_clinic_id)
  REFERENCES sessions (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE message_log
  ADD CONSTRAINT message_log_patient_fk
  FOREIGN KEY (patient_id, patient_parent_clinic_id)
  REFERENCES patients (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;

ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_enrollment_fk
  FOREIGN KEY (enrollment_id, enrollment_parent_clinic_id)
  REFERENCES aftercare_enrollments (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_patient_fk
  FOREIGN KEY (patient_id, patient_parent_clinic_id)
  REFERENCES patients (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE inbound_messages
  ADD CONSTRAINT inbound_messages_reply_fk
  FOREIGN KEY (reply_to_message_id, reply_parent_clinic_id)
  REFERENCES message_log (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_patient_fk
  FOREIGN KEY (patient_id, patient_parent_clinic_id)
  REFERENCES patients (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_session_fk
  FOREIGN KEY (session_id, session_parent_clinic_id)
  REFERENCES sessions (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;

ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_invoice_fk
  FOREIGN KEY (invoice_id, invoice_parent_clinic_id)
  REFERENCES invoices (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;
ALTER TABLE invoice_items
  ADD CONSTRAINT invoice_items_product_fk
  FOREIGN KEY (product_id, product_parent_clinic_id)
  REFERENCES products (id, clinic_id)
  DEFERRABLE INITIALLY IMMEDIATE NOT VALID;

-- ════════════════════════════════════════════════════════════
-- MIGRATE — backfill ستون‌های shadow از والدِ بلافصل
-- ════════════════════════════════════════════════════════════
-- چون ستونِ shadow NOT NULL می‌شود (EXPAND 4)، backfill باید پیش از
-- VALIDATE Constraintها کامل شود. انحراف = رد شدن VALIDATE.
UPDATE aftercare_enrollments e
   SET sequence_parent_clinic_id = s.clinic_id
  FROM aftercare_sequences s
 WHERE e.sequence_id = s.id
   AND (e.sequence_parent_clinic_id IS NULL
        OR e.sequence_parent_clinic_id <> s.clinic_id);

UPDATE aftercare_enrollments e
   SET patient_parent_clinic_id = p.clinic_id
  FROM patients p
 WHERE e.patient_id = p.id
   AND (e.patient_parent_clinic_id IS NULL
        OR e.patient_parent_clinic_id <> p.clinic_id);

UPDATE aftercare_enrollments e
   SET session_parent_clinic_id = s.clinic_id
  FROM sessions s
 WHERE e.session_id = s.id
   AND (e.session_parent_clinic_id IS NULL
        OR e.session_parent_clinic_id <> s.clinic_id);

UPDATE message_log m
   SET enrollment_parent_clinic_id = e.clinic_id
  FROM aftercare_enrollments e
 WHERE m.enrollment_id = e.id
   AND (m.enrollment_parent_clinic_id IS NULL
        OR m.enrollment_parent_clinic_id <> e.clinic_id);

UPDATE message_log m
   SET session_parent_clinic_id = s.clinic_id
  FROM sessions s
 WHERE m.session_id = s.id
   AND (m.session_parent_clinic_id IS NULL
        OR m.session_parent_clinic_id <> s.clinic_id);

UPDATE message_log m
   SET patient_parent_clinic_id = p.clinic_id
  FROM patients p
 WHERE m.patient_id = p.id
   AND (m.patient_parent_clinic_id IS NULL
        OR m.patient_parent_clinic_id <> p.clinic_id);

UPDATE inbound_messages i
   SET enrollment_parent_clinic_id = e.clinic_id
  FROM aftercare_enrollments e
 WHERE i.enrollment_id = e.id
   AND (i.enrollment_parent_clinic_id IS NULL
        OR i.enrollment_parent_clinic_id <> e.clinic_id);

UPDATE inbound_messages i
   SET patient_parent_clinic_id = p.clinic_id
  FROM patients p
 WHERE i.patient_id = p.id
   AND (i.patient_parent_clinic_id IS NULL
        OR i.patient_parent_clinic_id <> p.clinic_id);

UPDATE inbound_messages i
   SET reply_parent_clinic_id = m.clinic_id
  FROM message_log m
 WHERE i.reply_to_message_id = m.id
   AND (i.reply_parent_clinic_id IS NULL
        OR i.reply_parent_clinic_id <> m.clinic_id);

UPDATE invoices v
   SET patient_parent_clinic_id = p.clinic_id
  FROM patients p
 WHERE v.patient_id = p.id
   AND (v.patient_parent_clinic_id IS NULL
        OR v.patient_parent_clinic_id <> p.clinic_id);

UPDATE invoices v
   SET session_parent_clinic_id = s.clinic_id
  FROM sessions s
 WHERE v.session_id = s.id
   AND (v.session_parent_clinic_id IS NULL
        OR v.session_parent_clinic_id <> s.clinic_id);

UPDATE invoice_items it
   SET invoice_parent_clinic_id = v.clinic_id
  FROM invoices v
 WHERE it.invoice_id = v.id
   AND (it.invoice_parent_clinic_id IS NULL
        OR it.invoice_parent_clinic_id <> v.clinic_id);

UPDATE invoice_items it
   SET product_parent_clinic_id = pr.clinic_id
  FROM products pr
 WHERE it.product_id = pr.id
   AND (it.product_parent_clinic_id IS NULL
        OR it.product_parent_clinic_id <> pr.clinic_id);

-- ════════════════════════════════════════════════════════════
-- CONTRACT — NOT NULL + VALIDATE
-- ════════════════════════════════════════════════════════════
ALTER TABLE aftercare_enrollments
  ALTER COLUMN sequence_parent_clinic_id SET NOT NULL,
  ALTER COLUMN patient_parent_clinic_id SET NOT NULL;
ALTER TABLE aftercare_enrollments
  VALIDATE CONSTRAINT aftercare_enrollments_sequence_fk;
ALTER TABLE aftercare_enrollments
  VALIDATE CONSTRAINT aftercare_enrollments_patient_fk;
ALTER TABLE aftercare_enrollments
  VALIDATE CONSTRAINT aftercare_enrollments_session_fk;

-- enrollment_parent_clinic_id عمداً nullable می‌ماند: یادآوری جلسه (D15) به
-- دنباله‌ای تعلق ندارد (0023) و ردیف‌های sessrem: با enrollment_id = NULL
-- ساخته می‌شوند. NULL/NULL قید ترکیبی را satisfies می‌کند — همان قاعده‌ای
-- که برای session/reply می‌دانیم.
ALTER TABLE message_log
  VALIDATE CONSTRAINT message_log_enrollment_fk;

ALTER TABLE inbound_messages
  ALTER COLUMN enrollment_parent_clinic_id SET NOT NULL,
  ALTER COLUMN patient_parent_clinic_id SET NOT NULL;
ALTER TABLE inbound_messages
  VALIDATE CONSTRAINT inbound_messages_enrollment_fk;
ALTER TABLE inbound_messages
  VALIDATE CONSTRAINT inbound_messages_patient_fk;

ALTER TABLE invoices
  ALTER COLUMN patient_parent_clinic_id SET NOT NULL;
ALTER TABLE invoices
  VALIDATE CONSTRAINT invoices_patient_fk;

ALTER TABLE invoice_items
  ALTER COLUMN invoice_parent_clinic_id SET NOT NULL,
  ALTER COLUMN product_parent_clinic_id SET NOT NULL;
ALTER TABLE invoice_items
  VALIDATE CONSTRAINT invoice_items_invoice_fk;
ALTER TABLE invoice_items
  VALIDATE CONSTRAINT invoice_items_product_fk;

-- ستون‌های nullable (session / reply) هم گره ترکیبی می‌گیرند؛ VALIDATE فقط
-- ردیف‌های نال‌ناپذیر را چک می‌کند و ردیف‌های NULL از قید مستثنی می‌مانند.
ALTER TABLE aftercare_enrollments
  VALIDATE CONSTRAINT aftercare_enrollments_session_fk;

ALTER TABLE message_log
  VALIDATE CONSTRAINT message_log_session_fk;
ALTER TABLE message_log
  VALIDATE CONSTRAINT message_log_patient_fk;

ALTER TABLE inbound_messages
  VALIDATE CONSTRAINT inbound_messages_reply_fk;

ALTER TABLE invoices
  VALIDATE CONSTRAINT invoices_session_fk;

ALTER TABLE invoice_items
  VALIDATE CONSTRAINT invoice_items_product_fk;

-- ════════════════════════════════════════════════════════════
-- CONTRACT 3 — نویسنده‌های سمت SQL به‌روز می‌شوند
-- ════════════════════════════════════════════════════════════
-- fn_aftercare_claim_session_reminders (0023) پیامِ یادآوری جلسه را در
-- message_log درج می‌کند؛ FK ترکیبی ستون‌های shadow والد را می‌خواهد.
-- session و patient به p_clinic تعلق دارند (کوئری نامزد session را با
-- WHERE clinic_id می‌بندد)، پس shadow آنها p_clinic است. enrollment_id
-- NULL می‌ماند — یادآوری جلسه به دنباله‌ای تعلق ندارد (همان تصمیم 0023)
-- و NULL/NULL قید ترکیبی را satisfies می‌کند.
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
          clinic_id, session_id, session_parent_clinic_id, patient_id,
          patient_parent_clinic_id, enrollment_id, enrollment_parent_clinic_id,
          step_index, channel, template_key,
          locale, recipient_hash, body_sha256, body_chars, vars_redacted,
          state, idempotency_key
        )
        SELECT p_clinic, c.id, p_clinic, c.patient_id, p_clinic,
               NULL, NULL, off,
               'kavenegar', 'session.reminder', 'fa',
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
  'Wave 4 (D15) — atomically claims session reminders due at T-24h and T-2h. The INSERT of a message_log row IS the claim: a unique idempotency key (sessrem:<session>:<offset>) makes a double-claim impossible, so no session lock is held beyond the statement. Recipient/body placeholders are zero-hashes; the API worker fills them at render time and resets them before send. Wave 5 (D21/0024): composite FKs need the parent-clinic shadow columns, which this INSERT now supplies — session and patient belong to p_clinic by construction (the candidate query filters sessions by clinic_id); enrollment_id stays NULL because a session reminder belongs to the session, not to a sequence enrollment.';

-- ════════════════════════════════════════════════════════════
-- CONTRACT 4 — گره‌های قدیمی تک‌ستونی DROP می‌شوند
-- رابطهٔ cross-tenant دیگر راهی ندارد. ستون‌های shadow از این لحظه
-- تنها حامل رابطه‌اند.
-- ════════════════════════════════════════════════════════════
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_sequence_id_fkey;
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_patient_id_fkey;
ALTER TABLE aftercare_enrollments
  DROP CONSTRAINT IF EXISTS aftercare_enrollments_session_id_fkey;

ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_enrollment_id_fkey;
ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_session_id_fkey;
ALTER TABLE message_log
  DROP CONSTRAINT IF EXISTS message_log_patient_id_fkey;

ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_enrollment_id_fkey;
ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_patient_id_fkey;
ALTER TABLE inbound_messages
  DROP CONSTRAINT IF EXISTS inbound_messages_reply_to_message_id_fkey;

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_patient_id_fkey;
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_session_id_fkey;

ALTER TABLE invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey;
ALTER TABLE invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_product_id_fkey;
