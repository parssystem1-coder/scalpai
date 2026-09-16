-- 0021__payment_attempts.sql — بلاکر B3: ماشین حالت پرداخت در Postgres
-- (expand → migrate → contract)
--
-- مشکل: PaymentService حالت پرداخت را در چهار Map درون‌حافظه نگه می‌داشت:
--   pending / startsInFlight / callbacksInFlight / completedCallbacks.
--   ری‌استارت = گم شدن authority (بیمار پول داده، سیستم نمی‌داند)،
--   رپلیکای دوم = دو authority برای یک فاکتور،
--   و هیچ ردی از تلاش پرداخت روی دیسک نمی‌ماند.
--
-- راه‌حل: جدول payment_attempts + ماشین حالت با compare-and-set و یکتایی
--   جزئی «حداکثر یک تلاش فعال برای هر فاکتور».
--
--   pending → started → callback_received → verified | failed
--   pending | started → expired   (انقضای authority، تنبل روی خواندن)
--
-- EXPAND   — جدول + ایندکس‌ها + RLS + تریگر + تابع resolve
-- MIGRATE  — backfill ندارد: حالت قبلی در حافظه بود نه روی دیسک
-- CONTRACT — REVOKE DELETE؛ soft-delete تنها مسیر حذف است
--
-- ROLLBACK: packages/db/sql/rollback/0021__payment_attempts.down.sql

-- ============================================================
-- EXPAND: payment_attempts
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  -- تا وقتی پروایدر پاسخ نداده، authority خالی است. ردیف زودتر از تماس با
  -- پروایدر ساخته می‌شود چون یکتاییِ همین ردیف است که جلوی authority دوم
  -- را می‌گیرد.
  authority text NOT NULL DEFAULT '',
  amount bigint NOT NULL,
  redirect_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'started', 'callback_received', 'verified', 'failed', 'expired')),
  provider text NOT NULL DEFAULT 'zarinpal',
  provider_ref_id text,
  error_reason text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT payment_attempts_amount_positive_chk CHECK (amount > 0),
  -- هر حالتی جز pending/expired یعنی پروایدر authority داده است
  CONSTRAINT payment_attempts_authority_chk
    CHECK (status IN ('pending', 'expired') OR length(btrim(authority)) > 0)
);

COMMENT ON TABLE payment_attempts IS 'تلاش‌های پرداخت — ماشین حالت پرداخت در دیتابیس به‌جای Map درون‌حافظه (بلاکر B3)';
COMMENT ON COLUMN payment_attempts.authority IS 'شناسه پروایدر برای این تلاش. تا پاسخ پروایدر خالی است.';
COMMENT ON COLUMN payment_attempts.amount IS 'مبلغ به ریال — مانده‌ی فاکتور در لحظه شروع تلاش.';

-- حداکثر یک تلاش فعال (غیرپایانی) برای هر فاکتور. همین ایندکس است که
-- idempotency را از حافظه‌ی پروسه به دیتابیس منتقل می‌کند: start دوم به این
-- ایندکس می‌خورد و همان redirect قبلی برگردانده می‌شود، نه authority تازه.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_active_invoice_uq
  ON payment_attempts (invoice_id)
  WHERE status NOT IN ('verified', 'failed', 'expired') AND deleted_at IS NULL;

-- یکتایی authority: callback با authority می‌آید و باید دقیقاً یک ردیف را
-- پیدا کند. ردیف‌های pending با authority خالی از این یکتایی بیرون‌اند.
CREATE UNIQUE INDEX IF NOT EXISTS payment_attempts_authority_uq
  ON payment_attempts (authority)
  WHERE authority <> '' AND deleted_at IS NULL;

-- کوئری‌های کلینیک‌محور (گزارش تلاش‌های یک فاکتور)
CREATE INDEX IF NOT EXISTS payment_attempts_clinic_invoice_idx
  ON payment_attempts (clinic_id, invoice_id)
  WHERE deleted_at IS NULL;

-- جاروی تلاش‌های منقضی
CREATE INDEX IF NOT EXISTS payment_attempts_open_expiry_idx
  ON payment_attempts (expires_at)
  WHERE status IN ('pending', 'started') AND deleted_at IS NULL;

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_attempts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_attempts_tenant_isolation ON payment_attempts;
CREATE POLICY payment_attempts_tenant_isolation ON payment_attempts
  FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- تریگر updated_at (fn_touch_updated_at از 0004)
DROP TRIGGER IF EXISTS trg_payment_attempts_updated_at ON payment_attempts;
CREATE TRIGGER trg_payment_attempts_updated_at
  BEFORE UPDATE ON payment_attempts
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- تنها خوانش cross-tenant این مسیر
-- ============================================================
--
-- مسیر callback درگاه @Public() است: نه JWT دارد و نه امضای HMAC، پس هیچ
-- clinic_id ای روی store نیست و بدون آن نمی‌توان تراکنش RLS باز کرد. همان
-- الگوی fn_aftercare_due_clinics در 0018: یک تابع SECURITY DEFINER که فقط و
-- فقط هویت کلینیک را برمی‌گرداند — نه مبلغ، نه فاکتور، نه وضعیت. بقیه‌ی کار
-- داخل یک تراکنش عادیِ همان کلینیک انجام می‌شود.

CREATE OR REPLACE FUNCTION fn_payment_attempt_clinic(p_authority text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT pa.clinic_id
    FROM payment_attempts pa
   WHERE pa.authority = p_authority
     AND p_authority <> ''
     AND pa.deleted_at IS NULL
   ORDER BY pa.created_at DESC
   LIMIT 1;
$$;

COMMENT ON FUNCTION fn_payment_attempt_clinic(text) IS
  'authority → clinic_id و نه چیز دیگر (بلاکر B3). مسیر callback درگاه هویت‌شده نیست، پس نمی‌تواند خودش تراکنش کلینیک‌محور باز کند؛ این تابع فقط هویت کلینیکِ صاحب authority را می‌دهد و ادامه‌ی کار داخل RLS همان کلینیک انجام می‌شود. SECURITY DEFINER لازم است چون جدول FORCE ROW LEVEL SECURITY است.';

REVOKE ALL ON FUNCTION fn_payment_attempt_clinic(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_payment_attempt_clinic(text) TO scalpai_app;

-- ============================================================
-- CONTRACT: حذف دسترسی DELETE برای اپلیکیشن
-- ============================================================
-- applyGrants() بعد از هر فایل یک GRANT ... ON ALL TABLES می‌زند، پس این مرز
-- در migrate.ts هم تکرار شده است — وگرنه همین REVOKE چند خط بعد برمی‌گردد.
REVOKE DELETE ON payment_attempts FROM scalpai_app;
