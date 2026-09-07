-- 0014__phase8_media_quota.sql — فاز ۸: مدیا، آپلود و سهمیه
-- (ADR-0041 — WEAKNESSES H7, H11, H12, C1, M22, L4)
--
-- چهار ادعای فاز قبل اینجا به قید واقعی تبدیل می‌شود:
--
--   ۱) resume واقعی (H7): وضعیت آپلود چندبخشی تا امروز فقط در localStorage مرورگر
--      بود؛ سرور هیچ حافظه‌ای از uploadId نداشت، پس «ادامه» در عمل یعنی شروع از صفر.
--      جدول upload_sessions همان قرارداد سروری است: uploadId، اندازه بخش،
--      تعداد بخش و انقضا. کلاینت دیگر مرجع نیست، فقط اشاره‌گر دارد.
--
--   ۲) کلید ابجکت مقید (C1): شکل کلید تا حالا فقط در کد بررسی می‌شد. حالا CHECK
--      دیتابیس هم آن را می‌بندد: هیچ ردیفی نمی‌تواند کلیدی بیرون از الگوی
--      gallery/<uuid>/<name>.<ext> ثبت کند.
--
--   ۳) سهمیه اتمیک (H11): QuotaGuard قبلاً «بخوان، بعد بنویس» بود؛ دو درخواست
--      همزمان هر دو آخرین ظرفیت را می‌دیدند و هر دو رد نمی‌شدند. fn_usage_consume
--      ردیف شمارنده را FOR UPDATE قفل می‌کند و بررسی و افزایش را در یک تراکنش
--      انجام می‌دهد.
--
--   ۴) دوره سهمیه با ساعت کلینیک (H11): محاسبه ماه با UTC ثابت بود؛ کلینیکی که
--      اول ماه شمسی/محلی‌اش با UTC فرق دارد، ظرفیت را در روز اشتباه آزاد می‌کرد.
--      fn_clinic_period_start دوره را از clinics.timezone می‌سازد.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS fn_usage_consume(uuid, text, bigint, bigint);
--   DROP FUNCTION IF EXISTS fn_usage_release(uuid, text, bigint);
--   DROP FUNCTION IF EXISTS fn_storage_reserve(uuid, bigint, bigint);
--   DROP FUNCTION IF EXISTS fn_storage_add(uuid, bigint, bigint);
--   DROP FUNCTION IF EXISTS fn_clinic_period_start(uuid);
--   DROP TABLE IF EXISTS upload_sessions;
--   DROP TABLE IF EXISTS storage_usage;
--   DROP TRIGGER IF EXISTS trg_clinics_timezone ON clinics;
--   DROP FUNCTION IF EXISTS fn_clinics_timezone_guard();
--   DROP FUNCTION IF EXISTS fn_valid_timezone(text);
--   ALTER TABLE clinics DROP COLUMN IF EXISTS timezone;
--   ALTER TABLE gallery_items DROP COLUMN IF EXISTS size_bytes;
--   ALTER TABLE gallery_items DROP CONSTRAINT IF EXISTS gallery_items_key_shape_chk;

-- ============================================================
-- 1) ساعت رسمی کلینیک (H11)
-- ============================================================
-- تا امروز ساعت کلینیک هیچ خانه‌ای در دیتابیس نداشت و دوره سهمیه با UTC حساب
-- می‌شد. استانداردسازی کامل settings کار فاز ۱۰ (M13) است؛ اینجا فقط همان یک
-- فیلدی ساخته می‌شود که متر کردن سهمیه بدون آن دروغ است.

CREATE OR REPLACE FUNCTION fn_valid_timezone(p_tz text) RETURNS boolean AS $$
BEGIN
  IF p_tz IS NULL OR length(p_tz) = 0 THEN
    RETURN false;
  END IF;
  PERFORM now() AT TIME ZONE p_tz;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_valid_timezone(text) IS
  'True when PostgreSQL itself accepts the string as a time zone. Used by the clinics guard trigger so an unknown zone cannot be stored and blow up quota math later (WEAKNESSES H11).';

ALTER TABLE clinics ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Tehran';

-- هر مقداری که قبلاً در settings نشسته بود و معتبر است، منتقل می‌شود
UPDATE clinics
   SET timezone = settings->>'timezone'
 WHERE settings ? 'timezone'
   AND fn_valid_timezone(settings->>'timezone')
   AND timezone IS DISTINCT FROM settings->>'timezone';

CREATE OR REPLACE FUNCTION fn_clinics_timezone_guard() RETURNS trigger AS $$
BEGIN
  IF NOT fn_valid_timezone(NEW.timezone) THEN
    RAISE EXCEPTION 'unknown IANA time zone: %', NEW.timezone USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinics_timezone ON clinics;
CREATE TRIGGER trg_clinics_timezone
  BEFORE INSERT OR UPDATE OF timezone ON clinics
  FOR EACH ROW EXECUTE FUNCTION fn_clinics_timezone_guard();

CREATE OR REPLACE FUNCTION fn_clinic_period_start(p_clinic uuid) RETURNS date AS $$
DECLARE
  v_tz text;
BEGIN
  SELECT timezone INTO v_tz FROM clinics WHERE id = p_clinic;
  IF v_tz IS NULL THEN
    -- RLS hid the row: metering another tenant is not a fallback, it is a bug
    RAISE EXCEPTION 'clinic % is not visible in this transaction', p_clinic USING ERRCODE = '42501';
  END IF;
  RETURN date_trunc('month', now() AT TIME ZONE v_tz)::date;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION fn_clinic_period_start(uuid) IS
  'First day of the CLINIC-LOCAL month. Quota periods used to be computed in fixed UTC, which opened and closed a clinic budget on the wrong day (WEAKNESSES H11).';

-- ============================================================
-- 2) اندازه واقعی ابجکت روی ردیف گالری (H12/M22)
-- ============================================================
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS size_bytes bigint;

ALTER TABLE gallery_items DROP CONSTRAINT IF EXISTS gallery_items_size_bytes_chk;
ALTER TABLE gallery_items ADD CONSTRAINT gallery_items_size_bytes_chk
  CHECK (size_bytes IS NULL OR (size_bytes >= 0 AND size_bytes <= 209715200));

-- الگوی کلید در سطح دیتابیس (C1). ردیف‌های تاریخی با NOT VALID دست‌نخورده
-- می‌مانند؛ هر نوشتن جدید باید در الگو بگنجد.
ALTER TABLE gallery_items DROP CONSTRAINT IF EXISTS gallery_items_key_shape_chk;
ALTER TABLE gallery_items ADD CONSTRAINT gallery_items_key_shape_chk
  CHECK (
    storage_key ~ '^gallery/[0-9a-fA-F-]{36}/(original|thumb)[.](jpg|jpeg|png|webp)$'
    AND (thumb_key IS NULL OR thumb_key ~ '^gallery/[0-9a-fA-F-]{36}/(original|thumb)[.](jpg|jpeg|png|webp)$')
  ) NOT VALID;

-- ============================================================
-- 3) upload_sessions — قرارداد سروری آپلود چندبخشی (H7/H12)
-- ============================================================
CREATE TABLE IF NOT EXISTS upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  gallery_item_id uuid NOT NULL REFERENCES gallery_items(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  storage_key text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 1024 AND size_bytes <= 52428800),
  part_size_bytes integer NOT NULL CHECK (part_size_bytes >= 5242880 AND part_size_bytes <= 52428800),
  total_parts integer NOT NULL CHECK (total_parts >= 1 AND total_parts <= 10000),
  upload_id text CHECK (upload_id IS NULL OR length(upload_id) BETWEEN 1 AND 512),
  state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'completed', 'aborted', 'expired')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  -- تعداد بخش‌ها ادعای کلاینت نیست، تابع اندازه و اندازه بخش است (H12)
  CONSTRAINT upload_sessions_parts_match_chk
    CHECK (total_parts = ceil(size_bytes::numeric / part_size_bytes::numeric)),
  CONSTRAINT upload_sessions_completed_pairing_chk
    CHECK (state <> 'completed' OR completed_at IS NOT NULL),
  -- allowlist مثبت کلید، همان الگوی storage.service (C1)
  CONSTRAINT upload_sessions_key_shape_chk
    CHECK (storage_key ~ '^gallery/[0-9a-fA-F-]{36}/original[.](jpg|png|webp)$')
);

COMMENT ON TABLE upload_sessions IS
  'Server-side multipart upload contract (WEAKNESSES H7). The browser keeps a pointer, never the truth: uploadId, part size and part count live here so a resume continues the SAME S3 upload instead of restarting it.';

-- یک نشست باز به‌ازای هر آیتم گالری: resume همان نشست را برمی‌دارد، نشست دوم نمی‌سازد
CREATE UNIQUE INDEX IF NOT EXISTS upload_sessions_item_open_uq
  ON upload_sessions (clinic_id, gallery_item_id) WHERE state = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS upload_sessions_key_uq
  ON upload_sessions (clinic_id, storage_key);
CREATE INDEX IF NOT EXISTS upload_sessions_open_idx
  ON upload_sessions (clinic_id, state, expires_at);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upload_sessions_clinic_isolation ON upload_sessions;
CREATE POLICY upload_sessions_clinic_isolation ON upload_sessions FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 4) storage_usage — مصرف اندازه‌گیری‌شده bucket، نه حدس (M22)
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_usage (
  clinic_id uuid PRIMARY KEY REFERENCES clinics(id),
  object_count bigint NOT NULL DEFAULT 0 CHECK (object_count >= 0),
  bytes bigint NOT NULL DEFAULT 0 CHECK (bytes >= 0),
  source text NOT NULL DEFAULT 'delta',
  measured_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE storage_usage IS
  'Bytes a clinic actually occupies. Kept as a delta on every completed/purged object and re-based by the bucket scan in reconcileStorage (WEAKNESSES M22).';

ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_usage_clinic_isolation ON storage_usage;
CREATE POLICY storage_usage_clinic_isolation ON storage_usage FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 5) سهمیه اتمیک: بررسی و افزایش زیر یک قفل (H11)
-- ============================================================
-- هر دو تابع SECURITY INVOKER هستند: RLS همان‌طور که برای کوئری معمولی اعمال
-- می‌شود اینجا هم اعمال می‌شود، و کلینیک دیگری قابل متر کردن نیست.

CREATE OR REPLACE FUNCTION fn_usage_consume(
  p_clinic uuid,
  p_metric text,
  p_amount bigint,
  p_limit bigint
) RETURNS TABLE (allowed boolean, used bigint, period_start date) AS $$
DECLARE
  v_period date;
  v_used bigint;
  v_round integer := 0;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'quota amount must be a non-negative bigint' USING ERRCODE = '22023';
  END IF;
  v_period := fn_clinic_period_start(p_clinic);

  -- ردیف دوره را می‌سازیم یا قفل می‌کنیم. حلقه به‌خاطر مسابقه ساخت ردیف است:
  -- ON CONFLICT DO NOTHING منتظر تراکنش رقیب نمی‌ماند و ردیف نامرئی می‌مانَد.
  LOOP
    v_round := v_round + 1;
    SELECT value INTO v_used
      FROM usage_counters
     WHERE clinic_id = p_clinic AND metric = p_metric AND period_start = v_period
       FOR UPDATE;
    IF FOUND THEN
      EXIT;
    END IF;
    BEGIN
      INSERT INTO usage_counters (clinic_id, metric, period_start, value)
      VALUES (p_clinic, p_metric, v_period, 0);
      v_used := 0;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- رقیب زودتر رسید و commit شد؛ دور بعد قفلش را می‌گیریم
      IF v_round >= 5 THEN
        RAISE EXCEPTION 'could not lock usage counter for %/%', p_metric, v_period USING ERRCODE = '40001';
      END IF;
    END;
  END LOOP;

  IF p_limit IS NOT NULL AND v_used + p_amount > p_limit THEN
    RETURN QUERY SELECT false, v_used, v_period;
    RETURN;
  END IF;

  UPDATE usage_counters
     SET value = value + p_amount
   WHERE clinic_id = p_clinic AND metric = p_metric AND period_start = v_period;

  RETURN QUERY SELECT true, v_used + p_amount, v_period;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_usage_consume(uuid, text, bigint, bigint) IS
  'Atomic check+increment of a metered counter under FOR UPDATE (WEAKNESSES H11). The read-then-write guard it replaces let two concurrent requests both pass the last remaining slot.';

CREATE OR REPLACE FUNCTION fn_usage_release(
  p_clinic uuid,
  p_metric text,
  p_amount bigint
) RETURNS bigint AS $$
DECLARE
  v_period date;
  v_used bigint;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'quota amount must be a non-negative bigint' USING ERRCODE = '22023';
  END IF;
  v_period := fn_clinic_period_start(p_clinic);
  UPDATE usage_counters
     SET value = GREATEST(0, value - p_amount)
   WHERE clinic_id = p_clinic AND metric = p_metric AND period_start = v_period
  RETURNING value INTO v_used;
  RETURN COALESCE(v_used, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_usage_release(uuid, text, bigint) IS
  'Refund for a metered attempt that did not produce anything (rejected image, aborted upload). Without it a failed upload would still burn the clinic budget.';

-- ============================================================
-- 6) رزرو حجم ذخیره‌سازی: قفل روی ردیف مصرف کلینیک (H11/M22)
-- ============================================================
-- حجم یک «موجودی» است نه «جریان»، پس در شمارنده ماهانه جا نمی‌گیرد: مصرف
-- اندازه‌گیری‌شده + رزرو نشست‌های باز + حجم درخواست جدید باید زیر سقف بماند.

CREATE OR REPLACE FUNCTION fn_storage_reserve(
  p_clinic uuid,
  p_bytes bigint,
  p_limit bigint
) RETURNS TABLE (allowed boolean, stored bigint, reserved bigint) AS $$
DECLARE
  v_stored bigint;
  v_reserved bigint;
  v_round integer := 0;
BEGIN
  IF p_bytes IS NULL OR p_bytes < 0 THEN
    RAISE EXCEPTION 'storage amount must be a non-negative bigint' USING ERRCODE = '22023';
  END IF;

  LOOP
    v_round := v_round + 1;
    SELECT bytes INTO v_stored FROM storage_usage WHERE clinic_id = p_clinic FOR UPDATE;
    IF FOUND THEN
      EXIT;
    END IF;
    BEGIN
      INSERT INTO storage_usage (clinic_id, bytes, object_count, source)
      VALUES (p_clinic, 0, 0, 'reserve-bootstrap');
      v_stored := 0;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_round >= 5 THEN
        RAISE EXCEPTION 'could not lock storage usage for %', p_clinic USING ERRCODE = '40001';
      END IF;
    END;
  END LOOP;

  SELECT COALESCE(SUM(size_bytes), 0) INTO v_reserved
    FROM upload_sessions
   WHERE clinic_id = p_clinic AND state = 'open' AND expires_at > now();

  IF p_limit IS NOT NULL AND v_stored + v_reserved + p_bytes > p_limit THEN
    RETURN QUERY SELECT false, v_stored, v_reserved;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_stored, v_reserved;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_storage_reserve(uuid, bigint, bigint) IS
  'Locks the clinic storage row, then answers whether measured usage + open reservations + this request still fit the plan ceiling (WEAKNESSES H11). The lock is held to COMMIT, so the session insert that follows cannot double-spend it.';

CREATE OR REPLACE FUNCTION fn_storage_add(
  p_clinic uuid,
  p_bytes bigint,
  p_objects bigint
) RETURNS bigint AS $$
DECLARE
  v_bytes bigint;
BEGIN
  INSERT INTO storage_usage (clinic_id, bytes, object_count, source)
  VALUES (p_clinic, GREATEST(0, COALESCE(p_bytes, 0)), GREATEST(0, COALESCE(p_objects, 0)), 'delta')
  ON CONFLICT (clinic_id) DO UPDATE
     SET bytes = GREATEST(0, storage_usage.bytes + COALESCE(p_bytes, 0)),
         object_count = GREATEST(0, storage_usage.object_count + COALESCE(p_objects, 0)),
         source = 'delta',
         measured_at = now()
  RETURNING bytes INTO v_bytes;
  RETURN v_bytes;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_storage_add(uuid, bigint, bigint) IS
  'Signed delta on the clinic storage total (negative on purge/reject). The bucket scan re-bases it, so a drift never compounds silently.';
