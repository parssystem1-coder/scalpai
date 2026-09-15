-- 0017__phase5a_aftercare_billing.sql — فاز ۵a: موتور Aftercare، دروازه پیام و صورتحساب
-- (ADR-0046 — expand → migrate → contract)
--
-- این فاز هفت جدول جدید می‌سازد و هیچ ستون موجودی را نمی‌شکند، پس سه گام
-- expand/migrate/contract در همین یک فایل و با همین ترتیب اجرا می‌شود:
--
--   EXPAND   — جدول‌ها، ایندکس‌ها و RLS. همه چیز additive است؛ یک دیپلوی قدیمی
--              که این جدول‌ها را نمی‌شناسد بدون خطا به کار خود ادامه می‌دهد.
--   MIGRATE  — توابع سروری (شماره صورتحساب، بازمحاسبه مبالغ، صف aftercare) و
--              backfill. چیزی برای backfill نیست چون جدول‌ها تازه‌اند، اما شمارنده
--              متر کردن messages_sent برای کلینیک‌های موجود باز می‌شود تا اولین
--              پیام با یک ردیف نیم‌ساخته روبه‌رو نشود.
--   CONTRACT — بستن مرزهای دسترسی. اینجا هیچ DROP ی نیست: contract واقعی (حذف
--              ستون‌های قدیمی) در این فاز موضوعی ندارد و ساختن یک گام
--              تشریفاتی، گام را بی‌معنا می‌کند.
--
-- سه قاعده‌ای که در تمام فایل رعایت شده و دلیلشان:
--
--   ۱) PHI هیچ‌جا خوانا نیست. `message_log` شماره تلفن نگه نمی‌دارد، `recipient_hash`
--      نگه می‌دارد؛ متن پیام خروجی هم ذخیره نمی‌شود چون از template + متغیرها
--      بازتولید می‌شود و متغیرها خودشان PHI هستند. متن پیام ورودی — که بازتولید
--      نمی‌شود و inbox بدون آن بی‌معناست — در پاکت `phi.v1.` فاز ۶ می‌نشیند و یک
--      CHECK دیتابیس هر چیزی جز آن را رد می‌کند. همان درسِ 0012: ستونی به‌نام
--      encrypted که plaintext داشت.
--
--   ۲) هر جدول ENABLE + FORCE ROW LEVEL SECURITY دارد. REVOKE جای RLS را نمی‌گیرد،
--      چون applyGrants بعد از هر فایل یک `GRANT ... ON ALL TABLES` می‌زند و دسترسی
--      را برمی‌گرداند (همان چیزی که 0016 برای جدول‌های quarantine اصلاح کرد).
--
--   ۳) soft-delete روی products / invoices / invoice_items، و هر یکتایی روی آن‌ها
--      partial است: `WHERE deleted_at IS NULL`. یکتایی کامل روی sku یا شماره
--      صورتحساب یعنی یک ردیف حذف‌شده تا ابد نام خودش را گرو می‌گیرد.
--
-- نکته درباره regex ها: همه‌جا `[.]` نوشته شده نه `\.` — با standard_conforming_strings
-- روشن (پیش‌فرض)، backslash درون رشته تک‌کوتیشن خودِ backslash است و escape نیست؛
-- 0014 هم برای همین از همین روش استفاده کرد.
--
-- Rollback (فایل اجراییِ همین محتوا: packages/db/sql/rollback/0017__phase5a_aftercare_billing.down.sql):
--   DROP TRIGGER IF EXISTS trg_invoice_items_recalc ON invoice_items;
--   DROP FUNCTION IF EXISTS fn_invoice_items_recalc();
--   DROP FUNCTION IF EXISTS fn_invoice_recalc(uuid, uuid);
--   DROP FUNCTION IF EXISTS fn_invoice_next_number(uuid);
--   DROP FUNCTION IF EXISTS fn_aftercare_claim_due(uuid, integer);
--   DROP TRIGGER IF EXISTS trg_aftercare_sequences_updated_at ON aftercare_sequences;
--   DROP TRIGGER IF EXISTS trg_aftercare_enrollments_updated_at ON aftercare_enrollments;
--   DROP TRIGGER IF EXISTS trg_message_log_updated_at ON message_log;
--   DROP TRIGGER IF EXISTS trg_inbound_messages_updated_at ON inbound_messages;
--   DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
--   DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
--   DROP TABLE IF EXISTS invoice_items;
--   DROP TABLE IF EXISTS invoices;
--   DROP TABLE IF EXISTS products;
--   DROP TABLE IF EXISTS inbound_messages;
--   DROP TABLE IF EXISTS message_log;
--   DROP TABLE IF EXISTS aftercare_enrollments;
--   DROP TABLE IF EXISTS aftercare_sequences;
--   DELETE FROM usage_counters WHERE metric IN ('messages_sent', 'upload_mb') AND value = 0;

-- ============================================================
-- EXPAND 1) aftercare_sequences — قالبِ یک دنباله پیگیری
-- ============================================================
-- `steps` عمداً jsonb است نه جدول فرزند: یک دنباله واحدِ ویرایش است (کاربر کل
-- دنباله را می‌سازد و کل آن را جابه‌جا می‌کند)، و نسخه‌برداری از آن برای ثبت‌نامِ
-- در جریان باید یک کپی اتمیک باشد. شکل هر step با CHECK بسته شده تا jsonb به
-- معنای «هرچه شد» نباشد.

CREATE TABLE IF NOT EXISTS aftercare_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 1000),
  trigger text NOT NULL DEFAULT 'manual'
    CHECK (trigger IN ('manual', 'session_completed', 'analysis_created', 'invoice_paid')),
  service_id uuid REFERENCES services(id),
  locale text NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- یک دنباله بدون step فقط یک ردیف است که هیچ‌وقت پیامی نمی‌فرستد
  CONSTRAINT aftercare_sequences_steps_shape_chk CHECK (
    jsonb_typeof(steps) = 'array'
    AND jsonb_array_length(steps) BETWEEN 0 AND 40
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(steps) AS s
       WHERE jsonb_typeof(s.value) <> 'object'
          OR s.value->>'templateKey' IS NULL
          OR s.value->>'channel' IS NULL
          OR (s.value->>'channel') NOT IN ('kavenegar', 'bale', 'eitaa', 'telegram', 'whatsapp')
          OR (s.value->>'offsetHours') IS NULL
          OR (s.value->>'offsetHours') !~ '^[0-9]{1,5}$'
    )
  ),
  CONSTRAINT aftercare_sequences_active_needs_steps_chk
    CHECK (active = false OR jsonb_array_length(steps) > 0)
);

COMMENT ON TABLE aftercare_sequences IS
  'Template for a follow-up sequence. steps is a bounded, shape-checked jsonb array of {offsetHours, channel, templateKey}: an enrollment snapshots it, so editing a sequence never rewrites the schedule of a patient already inside it.';

CREATE UNIQUE INDEX IF NOT EXISTS aftercare_sequences_clinic_name_live_uq
  ON aftercare_sequences (clinic_id, lower(btrim(name))) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS aftercare_sequences_trigger_idx
  ON aftercare_sequences (clinic_id, trigger, active) WHERE deleted_at IS NULL;

ALTER TABLE aftercare_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE aftercare_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aftercare_sequences_clinic_isolation ON aftercare_sequences;
CREATE POLICY aftercare_sequences_clinic_isolation ON aftercare_sequences FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_aftercare_sequences_updated_at ON aftercare_sequences;
CREATE TRIGGER trg_aftercare_sequences_updated_at
  BEFORE UPDATE ON aftercare_sequences
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- EXPAND 2) aftercare_enrollments — یک بیمار داخل یک دنباله
-- ============================================================
-- `steps_snapshot` کپی گام‌ها در لحظه ثبت‌نام است. بدون آن، ویرایش یک دنباله
-- برنامه هر بیمارِ در جریان را عقب و جلو می‌برد و «پیام روز سوم» معنای ثابتی
-- ندارد. `next_run_at` تنها ورودی صف است؛ worker چیزی را از روی ساعت خودش حساب
-- نمی‌کند.

CREATE TABLE IF NOT EXISTS aftercare_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  sequence_id uuid NOT NULL REFERENCES aftercare_sequences(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  session_id uuid REFERENCES sessions(id),
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'paused', 'completed', 'cancelled')),
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0 AND current_step <= 40),
  steps_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(steps_snapshot) = 'array' AND jsonb_array_length(steps_snapshot) <= 40),
  locale text NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  started_at timestamptz NOT NULL DEFAULT now(),
  next_run_at timestamptz,
  last_run_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  enrolled_by uuid,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- یک ثبت‌نام فعال بدون زمان اجرای بعدی، یک ردیف مرده است که هیچ worker ای
  -- برنمی‌داردش. حالت پایانی برعکس: نباید در صف بماند.
  CONSTRAINT aftercare_enrollments_queue_chk CHECK (
    (state = 'active' AND next_run_at IS NOT NULL)
    OR (state = 'paused')
    OR (state IN ('completed', 'cancelled') AND next_run_at IS NULL)
  ),
  CONSTRAINT aftercare_enrollments_terminal_chk CHECK (
    (state <> 'completed' OR completed_at IS NOT NULL)
    AND (state <> 'cancelled' OR cancelled_at IS NOT NULL)
  ),
  CONSTRAINT aftercare_enrollments_step_bound_chk
    CHECK (current_step <= jsonb_array_length(steps_snapshot))
);

COMMENT ON TABLE aftercare_enrollments IS
  'One patient inside one sequence. steps_snapshot freezes the plan at enrollment time and next_run_at is the ONLY queue input — the worker never recomputes a due time from its own clock.';

-- همان بیمار دو بار در یک دنباله فعال نباشد؛ ولی بعد از اتمام، ثبت‌نام مجدد آزاد است
CREATE UNIQUE INDEX IF NOT EXISTS aftercare_enrollments_active_uq
  ON aftercare_enrollments (clinic_id, sequence_id, patient_id) WHERE state = 'active';
-- ایندکس صف: worker فقط همین را می‌خواند
CREATE INDEX IF NOT EXISTS aftercare_enrollments_due_idx
  ON aftercare_enrollments (clinic_id, next_run_at) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS aftercare_enrollments_patient_idx
  ON aftercare_enrollments (clinic_id, patient_id, state);

ALTER TABLE aftercare_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aftercare_enrollments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aftercare_enrollments_clinic_isolation ON aftercare_enrollments;
CREATE POLICY aftercare_enrollments_clinic_isolation ON aftercare_enrollments FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_aftercare_enrollments_updated_at ON aftercare_enrollments;
CREATE TRIGGER trg_aftercare_enrollments_updated_at
  BEFORE UPDATE ON aftercare_enrollments
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- EXPAND 3) message_log — دفتر پیام‌های خروجی
-- ============================================================
-- اینجا هیچ شماره تلفن و هیچ متن پیامی نیست، و این یک انتخاب است نه سهل‌انگاری:
--   • `recipient_hash` — sha256 شماره. برای dedup، rate-limit و «به این نفر
--     فرستادیم؟» کافی است، برای export کردن مخاطبان بی‌فایده.
--   • `body_sha256` + `body_chars` — اثبات این که چه چیزی رفت، بدون نگه‌داشتن
--     خودش. متن از templateKey + متغیرها بازتولید می‌شود و متغیرها PHI هستند.
--   • `idempotency_key` — کلید یکتای هر تلاش ارسال. بدون آن یک retry شبکه‌ای
--     همان پیام را دو بار به بیمار می‌فرستد.

CREATE TABLE IF NOT EXISTS message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  enrollment_id uuid REFERENCES aftercare_enrollments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id),
  step_index integer CHECK (step_index IS NULL OR (step_index >= 0 AND step_index <= 40)),
  channel text NOT NULL
    CHECK (channel IN ('kavenegar', 'bale', 'eitaa', 'telegram', 'whatsapp')),
  template_key text NOT NULL CHECK (length(template_key) BETWEEN 1 AND 80),
  locale text NOT NULL DEFAULT 'fa' CHECK (locale IN ('fa', 'en')),
  recipient_hash text NOT NULL CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  body_sha256 text NOT NULL CHECK (body_sha256 ~ '^[0-9a-f]{64}$'),
  body_chars integer NOT NULL CHECK (body_chars >= 0 AND body_chars <= 8000),
  vars_redacted jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(vars_redacted) = 'object'),
  state text NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'sent', 'delivered', 'failed', 'suppressed')),
  provider text CHECK (provider IS NULL OR length(provider) <= 40),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 20),
  last_error text CHECK (last_error IS NULL OR length(last_error) <= 300),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- یک حالت پایانی بدون زمانش قابل audit نیست
  CONSTRAINT message_log_state_timing_chk CHECK (
    (state <> 'sent' OR sent_at IS NOT NULL)
    AND (state <> 'delivered' OR delivered_at IS NOT NULL)
    AND (state <> 'failed' OR failed_at IS NOT NULL)
  ),
  -- vars_redacted فقط نام فیلد و مقدار بی‌خطر می‌برد؛ کلیدهای PHI ممنوع
  -- (همان قید 0012 روی mutations.payload)
  CONSTRAINT message_log_vars_no_phi_chk CHECK (
    NOT (
      vars_redacted ?| ARRAY[
        'phone', 'mobile', 'email', 'firstName', 'lastName', 'fullName',
        'patientName', 'first_name', 'last_name', 'full_name', 'patient_name',
        'notes', 'note', 'nationalId', 'national_id', 'address', 'birthDate', 'birth_date'
      ]
    )
  )
);

COMMENT ON TABLE message_log IS
  'Outbound message ledger. Deliberately holds NO phone number and NO message body: recipient_hash + body_sha256 answer every audit question (did we send it, to whom, what exactly) while making the table useless as a contact export. §13.';

CREATE UNIQUE INDEX IF NOT EXISTS message_log_idempotency_uq
  ON message_log (clinic_id, idempotency_key);
CREATE INDEX IF NOT EXISTS message_log_state_idx
  ON message_log (clinic_id, state, queued_at);
CREATE INDEX IF NOT EXISTS message_log_enrollment_idx
  ON message_log (clinic_id, enrollment_id, step_index);
CREATE INDEX IF NOT EXISTS message_log_recipient_idx
  ON message_log (clinic_id, recipient_hash, queued_at DESC);

ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_log_clinic_isolation ON message_log;
CREATE POLICY message_log_clinic_isolation ON message_log FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_message_log_updated_at ON message_log;
CREATE TRIGGER trg_message_log_updated_at
  BEFORE UPDATE ON message_log
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- EXPAND 4) inbound_messages — inbox
-- ============================================================
-- برخلاف پیام خروجی، متن ورودی بازتولید نمی‌شود و inbox بدون آن بی‌معناست. پس
-- ذخیره می‌شود، اما در همان پاکت فاز ۶: `phi.v1.<kid>.<iv>.<ct>.<tag>` با AAD
-- بسته به ردیف. CHECK زیر همان قید 0012 روی patients.notes_encrypted است — ستونی
-- به‌نام encrypted که plaintext بگیرد، دقیقاً باگی است که فاز ۶ بست.
-- `body_preview` نسخه scrub شده برای فهرست است: بدون ایمیل، بدون شماره، بریده.

CREATE TABLE IF NOT EXISTS inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  channel text NOT NULL
    CHECK (channel IN ('kavenegar', 'bale', 'eitaa', 'telegram', 'whatsapp')),
  provider text CHECK (provider IS NULL OR length(provider) <= 40),
  provider_message_id text CHECK (provider_message_id IS NULL OR length(provider_message_id) <= 200),
  sender_hash text NOT NULL CHECK (sender_hash ~ '^[0-9a-f]{64}$'),
  patient_id uuid REFERENCES patients(id),
  enrollment_id uuid REFERENCES aftercare_enrollments(id) ON DELETE SET NULL,
  reply_to_message_id uuid REFERENCES message_log(id) ON DELETE SET NULL,
  body_encrypted text,
  body_key_id text CHECK (body_key_id IS NULL OR length(body_key_id) <= 32),
  body_sha256 text CHECK (body_sha256 IS NULL OR body_sha256 ~ '^[0-9a-f]{64}$'),
  body_preview text CHECK (body_preview IS NULL OR length(body_preview) <= 200),
  state text NOT NULL DEFAULT 'new'
    CHECK (state IN ('new', 'read', 'replied', 'archived')),
  intent text CHECK (intent IS NULL OR intent IN ('unknown', 'question', 'reschedule', 'stop', 'confirm')),
  handled_by uuid,
  handled_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- ستون encrypted باید واقعاً ciphertext باشد (همان قید 0012).
  -- [.] و نه \. — با standard_conforming_strings روشن، backslash در رشته
  -- خودِ backslash است و regex را می‌شکند.
  CONSTRAINT inbound_messages_body_envelope_chk CHECK (
    body_encrypted IS NULL
    OR body_encrypted ~ '^phi[.]v1[.][a-z0-9][a-z0-9._-]{1,31}[.][A-Za-z0-9_-]{16}[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]{22}$'
  ),
  CONSTRAINT inbound_messages_key_pairing_chk
    CHECK ((body_encrypted IS NULL) = (body_key_id IS NULL)),
  CONSTRAINT inbound_messages_handled_chk
    CHECK (state = 'new' OR state = 'archived' OR handled_at IS NOT NULL)
);

COMMENT ON TABLE inbound_messages IS
  'Patient replies. The body cannot be regenerated, so it IS stored — but only as a phi.v1 AES-256-GCM envelope bound to this row by AAD, with a database CHECK refusing anything else (the 0012 lesson). body_preview is the scrubbed projection the list view reads.';

CREATE UNIQUE INDEX IF NOT EXISTS inbound_messages_provider_uq
  ON inbound_messages (clinic_id, channel, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS inbound_messages_inbox_idx
  ON inbound_messages (clinic_id, state, received_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_patient_idx
  ON inbound_messages (clinic_id, patient_id, received_at DESC);
CREATE INDEX IF NOT EXISTS inbound_messages_sender_idx
  ON inbound_messages (clinic_id, sender_hash, received_at DESC);

ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inbound_messages_clinic_isolation ON inbound_messages;
CREATE POLICY inbound_messages_clinic_isolation ON inbound_messages FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_inbound_messages_updated_at ON inbound_messages;
CREATE TRIGGER trg_inbound_messages_updated_at
  BEFORE UPDATE ON inbound_messages
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- EXPAND 5) products — کاتالوگ فروش کلینیک
-- ============================================================
-- قیمت numeric(12,0) است، همان جنس services.price و plans.price: ریال کسری ندارد
-- و float برای پول یعنی اختلاف یک ریالی در جمع فاکتور.

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  sku text NOT NULL CHECK (sku ~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$'),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  kind text NOT NULL DEFAULT 'goods'
    CHECK (kind IN ('goods', 'service', 'package')),
  service_id uuid REFERENCES services(id),
  unit text NOT NULL DEFAULT 'unit' CHECK (length(unit) BETWEEN 1 AND 24),
  price numeric(12, 0) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'IRR' CHECK (currency ~ '^[A-Z]{3}$'),
  tax_rate numeric(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT products_service_kind_chk
    CHECK (service_id IS NULL OR kind IN ('service', 'package'))
);

COMMENT ON TABLE products IS
  'Sellable catalog per clinic. Soft-deleted, and the sku uniqueness is PARTIAL (WHERE deleted_at IS NULL): a full unique index would let one deleted row hold its sku hostage forever.';

CREATE UNIQUE INDEX IF NOT EXISTS products_clinic_sku_live_uq
  ON products (clinic_id, upper(sku)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_clinic_active_idx
  ON products (clinic_id, active, kind) WHERE deleted_at IS NULL;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_clinic_isolation ON products;
CREATE POLICY products_clinic_isolation ON products FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- EXPAND 6) invoices
-- ============================================================
-- مبالغ روی خودِ صورتحساب ذخیره می‌شوند، اما با fn_invoice_recalc از سطرها
-- بازمحاسبه می‌شوند (بخش MIGRATE). دلیل: یک صورتحساب صادرشده باید بعد از
-- تغییر قیمت کاتالوگ همان مبلغ را نشان دهد، و در عین حال جمعِ سطرها هیچ‌وقت
-- با total اختلاف پیدا نکند.

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  session_id uuid REFERENCES sessions(id),
  number text NOT NULL CHECK (number ~ '^[0-9]{4}-[0-9]{6}$'),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'issued', 'paid', 'partially_paid', 'void', 'refunded')),
  currency text NOT NULL DEFAULT 'IRR' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12, 0) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount numeric(12, 0) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax numeric(12, 0) NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total numeric(12, 0) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_amount numeric(12, 0) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'transfer', 'gateway', 'credit')),
  payment_ref text CHECK (payment_ref IS NULL OR length(payment_ref) <= 120),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  void_reason text CHECK (void_reason IS NULL OR length(void_reason) <= 300),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT invoices_paid_bound_chk CHECK (paid_amount <= total),
  CONSTRAINT invoices_state_timing_chk CHECK (
    (state = 'draft' OR issued_at IS NOT NULL)
    AND (state <> 'paid' OR (paid_at IS NOT NULL AND paid_amount = total))
    AND (state <> 'partially_paid' OR (paid_amount > 0 AND paid_amount < total))
    AND (state <> 'void' OR voided_at IS NOT NULL)
  ),
  -- یک صورتحساب باطل‌شده که پول گرفته، refund است نه void
  CONSTRAINT invoices_void_unpaid_chk CHECK (state <> 'void' OR paid_amount = 0)
);

COMMENT ON TABLE invoices IS
  'Soft-deleted invoice. Money is numeric(12,0) like services.price and plans.price — rial has no fraction and a float total drifts by a rial per line. Totals are maintained by fn_invoice_recalc from the items, never written by hand.';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_clinic_number_live_uq
  ON invoices (clinic_id, number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_clinic_state_idx
  ON invoices (clinic_id, state, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_patient_idx
  ON invoices (clinic_id, patient_id, created_at DESC) WHERE deleted_at IS NULL;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_clinic_isolation ON invoices;
CREATE POLICY invoices_clinic_isolation ON invoices FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- EXPAND 7) invoice_items
-- ============================================================
-- `description` و `unit_price` در لحظه افزودن از محصول کپی می‌شوند: صورتحسابِ
-- دیروز نباید با ویرایش کاتالوگِ امروز عوض شود. product_id فقط ارجاع است، منبع
-- قیمت نیست.

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 200),
  quantity numeric(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 100000),
  unit_price numeric(12, 0) NOT NULL CHECK (unit_price >= 0),
  discount numeric(12, 0) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_rate numeric(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_total numeric(12, 0) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT invoice_items_discount_bound_chk
    CHECK (discount <= round(quantity * unit_price))
);

COMMENT ON TABLE invoice_items IS
  'Invoice lines. description and unit_price are COPIED from the product at add time: an invoice issued last month must not change because the catalog changed today. product_id is a reference, not the price source.';

CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx
  ON invoice_items (clinic_id, invoice_id, position) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_position_live_uq
  ON invoice_items (invoice_id, position) WHERE deleted_at IS NULL;

ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_items_clinic_isolation ON invoice_items;
CREATE POLICY invoice_items_clinic_isolation ON invoice_items FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- MIGRATE 1) شماره صورتحساب سریالی per-clinic
-- ============================================================
-- شمارش با `SELECT count(*) + 1` دو درخواست همزمان را به یک شماره می‌رساند.
-- اینجا max شماره سال جاری زیر قفلِ advisory برداشته می‌شود، پس شماره‌ها بی‌حفره
-- و بی‌تکرار می‌مانند. کلید قفل per-clinic است تا دو کلینیک همدیگر را بلاک نکنند.

CREATE OR REPLACE FUNCTION fn_invoice_next_number(p_clinic uuid) RETURNS text AS $$
DECLARE
  v_tz text;
  v_year text;
  v_seq integer;
BEGIN
  SELECT timezone INTO v_tz FROM clinics WHERE id = p_clinic;
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'clinic % is not visible in this transaction', p_clinic USING ERRCODE = '42501';
  END IF;
  v_year := to_char(now() AT TIME ZONE v_tz, 'YYYY');
  -- قفل تا COMMIT نگه داشته می‌شود؛ همان چیزی که دو ثبت همزمان را سری می‌کند
  PERFORM pg_advisory_xact_lock(hashtextextended(p_clinic::text || ':invoice:' || v_year, 0));
  SELECT COALESCE(MAX(split_part(number, '-', 2)::integer), 0) + 1
    INTO v_seq
    FROM invoices
   WHERE clinic_id = p_clinic AND split_part(number, '-', 1) = v_year;
  RETURN v_year || '-' || lpad(v_seq::text, 6, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_invoice_next_number(uuid) IS
  'Gapless per-clinic, per-year invoice number under a per-clinic advisory lock held to COMMIT. A count(*)+1 in application code hands two concurrent requests the same number.';

-- ============================================================
-- MIGRATE 2) بازمحاسبه مبالغ از سطرها
-- ============================================================
-- تنها نویسنده subtotal/discount/tax/total همین تابع است. هر مسیر دیگری که این
-- چهار ستون را دستی بنویسد، دیر یا زود جمع سطرها را نقض می‌کند.

CREATE OR REPLACE FUNCTION fn_invoice_recalc(p_clinic uuid, p_invoice uuid) RETURNS void AS $$
DECLARE
  v_subtotal numeric(12, 0) := 0;
  v_discount numeric(12, 0) := 0;
  v_tax numeric(12, 0) := 0;
  v_state text;
BEGIN
  SELECT state INTO v_state FROM invoices
   WHERE id = p_invoice AND clinic_id = p_clinic AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  -- مبالغ یک صورتحساب پرداخت‌شده/باطل بسته است؛ بازمحاسبه آن تاریخ را عوض می‌کند
  IF v_state IN ('paid', 'void', 'refunded') THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(round(quantity * unit_price)), 0),
         COALESCE(SUM(discount), 0),
         COALESCE(SUM(round((round(quantity * unit_price) - discount) * tax_rate / 100)), 0)
    INTO v_subtotal, v_discount, v_tax
    FROM invoice_items
   WHERE clinic_id = p_clinic AND invoice_id = p_invoice AND deleted_at IS NULL;

  UPDATE invoices
     SET subtotal = v_subtotal,
         discount = v_discount,
         tax = v_tax,
         total = GREATEST(0, v_subtotal - v_discount + v_tax)
   WHERE id = p_invoice AND clinic_id = p_clinic;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_invoice_recalc(uuid, uuid) IS
  'The ONLY writer of invoice subtotal/discount/tax/total. Refuses to touch a paid, void or refunded invoice, because recomputing a settled document rewrites history.';

CREATE OR REPLACE FUNCTION fn_invoice_items_recalc() RETURNS trigger AS $$
DECLARE
  v_gross numeric(12, 0);
BEGIN
  -- line_total ادعای کلاینت نیست، تابع مقدار و قیمت است
  v_gross := round(NEW.quantity * NEW.unit_price) - NEW.discount;
  NEW.line_total := GREATEST(0, v_gross + round(v_gross * NEW.tax_rate / 100));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_invoice_items_recalc() IS
  'BEFORE trigger: derives line_total server-side so a client cannot post a line whose total disagrees with quantity x price.';

DROP TRIGGER IF EXISTS trg_invoice_items_recalc ON invoice_items;
CREATE TRIGGER trg_invoice_items_recalc
  BEFORE INSERT OR UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION fn_invoice_items_recalc();

-- ============================================================
-- MIGRATE 3) برداشتن اتمیک کارهای سررسیده aftercare
-- ============================================================
-- `SELECT ... due` بعد `UPDATE` یعنی دو worker همان ثبت‌نام را برمی‌دارند و بیمار
-- دو پیام می‌گیرد. SKIP LOCKED دقیقاً برای همین است: هر worker فقط ردیف‌هایی را
-- می‌بیند که کس دیگری قفل نکرده.

CREATE OR REPLACE FUNCTION fn_aftercare_claim_due(p_clinic uuid, p_limit integer)
RETURNS TABLE (
  enrollment_id uuid,
  sequence_id uuid,
  patient_id uuid,
  session_id uuid,
  current_step integer,
  steps_snapshot jsonb,
  locale text,
  attempts integer
) AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'claim limit must be between 1 and 500' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH claimed AS (
    SELECT e.id
      FROM aftercare_enrollments e
     WHERE e.clinic_id = p_clinic
       AND e.state = 'active'
       AND e.next_run_at IS NOT NULL
       AND e.next_run_at <= now()
     ORDER BY e.next_run_at
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE aftercare_enrollments e
     SET last_run_at = now(),
         attempts = e.attempts + 1
    FROM claimed c
   WHERE e.id = c.id
  RETURNING e.id, e.sequence_id, e.patient_id, e.session_id,
            e.current_step, e.steps_snapshot, e.locale, e.attempts;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_aftercare_claim_due(uuid, integer) IS
  'Atomically claims due enrollments with FOR UPDATE SKIP LOCKED. A read-then-update pair lets two workers claim the same row, which the patient experiences as the same message twice.';

-- ============================================================
-- MIGRATE 4) باز کردن شمارنده‌های متر کردن فاز ۵a
-- ============================================================
-- usage_counters.metric متن آزاد است، پس این backfill اجباری نیست — اما اولین
-- ارسال پیام هر کلینیک را از مسیر «ردیف را بساز، قفلش کن، دوباره تلاش کن»
-- (fn_usage_consume) بیرون می‌آورد. مقدار صفر است، نه تخمین.

INSERT INTO usage_counters (clinic_id, metric, period_start, value)
SELECT c.id, m.metric, fn_clinic_period_start(c.id), 0
  FROM clinics c
 CROSS JOIN (VALUES ('messages_sent'), ('upload_mb')) AS m(metric)
ON CONFLICT (clinic_id, metric, period_start) DO NOTHING;

-- ============================================================
-- CONTRACT) بستن مرزها
-- ============================================================
-- پیام‌ها یک دفتر شبه-audit اند: پیامِ رفته را نمی‌توان «نفرستاده» کرد، پس DELETE
-- از نقش اپلیکیشن گرفته می‌شود. باطل کردن یک ارسال از مسیر state انجام می‌شود.
REVOKE DELETE ON message_log FROM scalpai_app;
REVOKE DELETE ON inbound_messages FROM scalpai_app;

-- products / invoices / invoice_items soft-delete اند. DELETE سخت روی آن‌ها یعنی
-- گم شدن یک سند مالی، پس بسته می‌شود؛ حذف از مسیر deleted_at است.
REVOKE DELETE ON products FROM scalpai_app;
REVOKE DELETE ON invoices FROM scalpai_app;
REVOKE DELETE ON invoice_items FROM scalpai_app;
