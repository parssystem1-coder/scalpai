-- 0011__phase3_session_rotation.sql — فاز ۳: نشست، توکن و اتمیک‌بودن چرخش refresh
-- (ADR-0033 atomic rotation · ADR-0029 dedicated auth role)
--
-- چرخش refresh قبلاً چند رفت‌وبرگشت جدا بود: پیدا کردن parent، ساخت child و
-- علامت‌گذاری parent هرکدام در تراکنش خودشان. بین این مرحله‌ها یک پنجره race
-- وجود داشت که دو refresh همزمان می‌توانستند هر دو موفق شوند و دو خانواده توکن
-- زنده بسازند. اینجا همه‌ی تصمیم و همه‌ی نوشتن‌ها داخل یک تابع و یک تراکنش
-- انجام می‌شود و ردیف parent با SELECT ... FOR UPDATE قفل می‌شود.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS fn_refresh_rotate(text, uuid, text, timestamptz);
--   DROP FUNCTION IF EXISTS fn_refresh_revoke_by_token(text);

-- ============================================================
-- 1) چرخش اتمیک refresh (R4/H1/R12)
-- ============================================================
-- outcome یکی از این مقادیر است و تصمیم‌گیری کاملاً سمت دیتابیس انجام می‌شود:
--   rotated         : parent زنده بود، child ساخته شد و parent جایگزین شد
--   reused          : توکن قبلاً مصرف/باطل شده بود → کل خانواده revoke شد
--   expired         : توکن منقضی بود → کل خانواده revoke شد
--   revoked_user    : کاربر revoke شده یا حذف شده است → خانواده revoke شد
--   clinic_mismatch : clinic ردیف توکن با clinic کاربر نمی‌خواند → خانواده revoke شد
--   unknown         : چنین توکنی وجود ندارد
--
-- claims (role/email/clinic) همیشه از جدول users خوانده می‌شود، هرگز از توکن
-- ورودی (R5).
CREATE OR REPLACE FUNCTION fn_refresh_rotate(
  p_token_hash text,
  p_child_id uuid,
  p_child_hash text,
  p_expires_at timestamptz
) RETURNS TABLE (
  outcome text,
  child_id uuid,
  subject_id uuid,
  subject_clinic_id uuid,
  subject_role text,
  subject_email text,
  token_family_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent refresh_tokens%ROWTYPE;
  subject record;
BEGIN
  -- یک ردیف، یک قفل: refreshهای همزمان اینجا صف می‌شوند نه اینکه مسابقه بدهند
  SELECT * INTO parent FROM refresh_tokens WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    outcome := 'unknown';
    RETURN NEXT;
    RETURN;
  END IF;

  token_family_id := parent.family_id;

  IF parent.revoked_at IS NOT NULL OR parent.replaced_by IS NOT NULL THEN
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = parent.family_id AND revoked_at IS NULL;
    outcome := 'reused';
    RETURN NEXT;
    RETURN;
  END IF;

  IF parent.expires_at <= now() THEN
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = parent.family_id AND revoked_at IS NULL;
    outcome := 'expired';
    RETURN NEXT;
    RETURN;
  END IF;

  -- policy users_auth_lookup فقط کاربران revoke نشده را نشان می‌دهد
  SELECT u.id, u.clinic_id, u.role::text AS role, u.email
    INTO subject
    FROM users u
   WHERE u.id = parent.user_id AND u.revoked_at IS NULL;

  IF NOT FOUND THEN
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = parent.family_id AND revoked_at IS NULL;
    outcome := 'revoked_user';
    RETURN NEXT;
    RETURN;
  END IF;

  IF subject.clinic_id <> parent.clinic_id THEN
    UPDATE refresh_tokens SET revoked_at = now()
     WHERE family_id = parent.family_id AND revoked_at IS NULL;
    outcome := 'clinic_mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO refresh_tokens (id, user_id, clinic_id, token_hash, family_id, expires_at)
  VALUES (p_child_id, parent.user_id, parent.clinic_id, p_child_hash, parent.family_id, p_expires_at);

  UPDATE refresh_tokens
     SET revoked_at = now(), replaced_by = p_child_id
   WHERE id = parent.id;

  outcome := 'rotated';
  child_id := p_child_id;
  subject_id := subject.id;
  subject_clinic_id := subject.clinic_id;
  subject_role := subject.role;
  subject_email := subject.email;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- 2) logout: باطل کردن کل خانواده با یک رفت‌وبرگشت (R5)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_refresh_revoke_by_token(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fam uuid;
BEGIN
  SELECT rt.family_id INTO fam
    FROM refresh_tokens rt
   WHERE rt.token_hash = p_token_hash
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE refresh_tokens SET revoked_at = now()
   WHERE family_id = fam AND revoked_at IS NULL;
  RETURN fam;
END;
$$;

-- ============================================================
-- 3) مالکیت و مجوزها — همان مرز فاز ۲ (ADR-0029)
-- ============================================================
ALTER FUNCTION fn_refresh_rotate(text, uuid, text, timestamptz) OWNER TO scalpai_auth;
ALTER FUNCTION fn_refresh_revoke_by_token(text) OWNER TO scalpai_auth;

REVOKE ALL ON FUNCTION fn_refresh_rotate(text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_refresh_revoke_by_token(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_refresh_rotate(text, uuid, text, timestamptz) TO scalpai_app;
GRANT EXECUTE ON FUNCTION fn_refresh_revoke_by_token(text) TO scalpai_app;
