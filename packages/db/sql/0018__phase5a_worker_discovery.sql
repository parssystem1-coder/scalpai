-- 0018__phase5a_worker_discovery.sql — فاز ۵a: تنها خواندنِ فراتننتِ زمان‌بندِ aftercare
-- (ADR-0046)
--
-- چرا فایل جدا و نه درون 0017: این تنها تابع SECURITY DEFINER این فاز است، و یک
-- ریویور باید بتواند همین یک تصمیم را جدا ببیند، نه اینکه در خط ۴۰۰ِ یک
-- مایگریشن اسکیما پیدایش کند. همان منطقی که 0016 را از 0012 جدا کرد.
--
-- مسأله: همه‌ی جدول‌های فاز ۵a FORCE ROW LEVEL SECURITY دارند و نقش اپلیکیشن
-- فقط کلینیک خودش را می‌بیند — و این درست است. اما یک زمان‌بند نمی‌تواند از
-- درون یک کلینیک بپرسد «کدام کلینیک‌ها کار سررسیده دارند؟». بدون پاسخ به
-- این پرسش، ورکر وجود ندارد.
--
-- مرزِ این استثنا تا جایی که ممکن بود تنگ بسته شده:
--
--   • فقط هویت کلینیک برمی‌گردد: id، name، timezone. هیچ ردیف بیمار، هیچ
--     پیام، هیچ شماره، و حتی شمارش کارهای سررسیده هم نه (همان هم یک
--     نشت فراتننتِ حجم کار است).
--   • ورودی نمی‌گیرد جز یک سقف عددی، پس قابل سوءاستفاده برای پرسیدن
--     درباره‌ی یک کلینیک خاص نیست.
--   • خودِ کار همچنان درون یک تراکنش عادی و RLS‌دارِ per-clinic انجام می‌شود.
--     این تابع فقط می‌گوید کدام کلینیک را باید باز کرد.
--
-- Rollback:
--   REVOKE EXECUTE ON FUNCTION fn_aftercare_due_clinics(integer) FROM scalpai_app;
--   DROP FUNCTION IF EXISTS fn_aftercare_due_clinics(integer);

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

COMMENT ON FUNCTION fn_aftercare_due_clinics(integer) IS
  'The scheduler''s ONLY cross-tenant read (phase 5a / ADR-0046). Returns clinic identity — id, name, timezone — for clinics with at least one due enrollment, and nothing else: no patient row, no message, not even a due count, because a count is itself a cross-tenant leak of workload. The worker then does all real work inside a normal per-clinic RLS transaction. SECURITY DEFINER is required because every phase 5a table is FORCE ROW LEVEL SECURITY, which is exactly what makes this question unanswerable from inside one tenant.';

GRANT EXECUTE ON FUNCTION fn_aftercare_due_clinics(integer) TO scalpai_app;
