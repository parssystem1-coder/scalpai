-- 0019__webhook_providers.sql — بلاکر B1: binding ارائه‌دهنده وبهوک به کلینیک
-- (expand → migrate → contract)
--
-- مشکل: مسیرهای وبهوک (Kavenegar, Zarinpal) با @Public() تزئین شده‌اند
-- و JwtAccessGuard رد می‌شود. TenantScope.run() store خالی (ctx: null) ایجاد
-- می‌کند و هیچ‌کس TenantScope.enter() را صدا نمی‌زند. نتیجه: requireCtx()
-- در aftercare.repository 500 می‌دهد.
--
-- راه‌حل: جدول webhook_providers که نام ارائه‌دهنده را به clinic_id متصل
-- می‌کند. WebhookGuard بعد از تأیید HMAC، ردیف را پیدا کرده و clinicId
-- را روی store می‌نویسد.
--
-- EXPAND   — جدول + ایندکس + RLS
-- MIGRATE  — چیزی برای backfill نیست (جدول تازه است)
-- CONTRACT — REVOKE DELETE

-- ============================================================
-- EXPAND: webhook_providers
-- ============================================================

CREATE TABLE IF NOT EXISTS webhook_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  webhook_secret text NOT NULL,
  signature_header text NOT NULL DEFAULT 'x-webhook-signature',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE webhook_providers IS 'ارائه‌دهندگان وبهوک — binding ارائه‌دهنده به کلینیک برای tenant context';

-- یکتایی روی (provider, clinic_id): هر ارائه‌دهنده فقط یکبار برای هر کلینیک
CREATE UNIQUE INDEX IF NOT EXISTS webhook_providers_provider_clinic_uq
  ON webhook_providers (provider, clinic_id);

-- ایندکس برای lookup سریع در WebhookGuard
CREATE UNIQUE INDEX IF NOT EXISTS webhook_providers_provider_active_uq
  ON webhook_providers (provider)
  WHERE active = true;

-- RLS: فعال اما WebhookGuard از `withClient()` استفاده می‌کند که نقش app را
-- ست نمی‌کند، پس RLS اعمال نمی‌شود. جستجوی provider→clinic قبل از تنظیم
-- tenant context امکان‌پذیر است.
ALTER TABLE webhook_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_providers FORCE ROW LEVEL SECURITY;

CREATE POLICY webhook_providers_read_only ON webhook_providers
  FOR SELECT TO scalpai_app
  USING (true);

-- تریگر updated_at
DROP TRIGGER IF EXISTS trg_webhook_providers_updated_at ON webhook_providers;
CREATE TRIGGER trg_webhook_providers_updated_at
  BEFORE UPDATE ON webhook_providers
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

-- ============================================================
-- CONTRACT: حذف دسترسی DELETE برای اپلیکیشن
-- ============================================================

REVOKE DELETE ON webhook_providers FROM scalpai_app;

-- ============================================================
-- Seed: اضافه کردن ارائه‌دهندگان فعلی
-- ============================================================
-- این seed فقط برای کلینیک‌های موجود اجرا می‌شود.
-- در محیط production باید از طریق API مدیریت شود.

DO $$
DECLARE
  clinic RECORD;
BEGIN
  -- clinics is not a soft-delete table; its current schema has no deleted_at.
  FOR clinic IN SELECT id FROM clinics
  LOOP
    INSERT INTO webhook_providers (provider, clinic_id, webhook_secret, signature_header)
    VALUES
      ('kavenegar', clinic.id, COALESCE(current_setting('app.kavenegar_webhook_secret', true), 'placeholder-kavenegar'), 'x-webhook-signature'),
      ('zarinpal', clinic.id, COALESCE(current_setting('app.zarinpal_webhook_secret', true), 'placeholder-zarinpal'), 'x-zarinpal-signature')
    ON CONFLICT (provider, clinic_id) DO NOTHING;
  END LOOP;
END $$;
