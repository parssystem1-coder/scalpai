-- 0013__phase7_sync_correctness.sql — فاز ۷: همگام‌سازی چنددستگاهی و صحت آفلاین
-- (ADR-0039 — WEAKNESSES H3, H4, H5, H6)
--
-- سه اشکال ساختاری اینجا در سطح دیتابیس بسته می‌شود:
--
--   ۱) dedupe سراسری (H4): قید UNIQUE روی client_mutation_id در سطح کل جدول بود؛
--      یعنی دو کلینیک مستقل با یک uuid تصادفی به هم برمی‌خوردند و جهش دوم
--      به دروغ «duplicate» می‌شد. از این پس کلید یکتایی (clinic_id, client_mutation_id) است.
--
--   ۲) cursor ناایمن (H5): server_seq یک bigserial است و قبل از COMMIT گرفته می‌شود؛
--      تراکنش کند می‌تواند seq کوچکتر را بعد از تراکنش تند commit کند و کلاینتی
--      که cursor را جلو برده آن ردیف را برای همیشه از دست می‌داد. commit_xid
--      شناسه تراکنش نویسنده را نگه می‌دارد و pull فقط ردیف‌های زیر خط اطمینان
--      pg_snapshot_xmin(pg_current_snapshot()) را برمی‌گرداند.
--
--   ۳) LWW مبتنی بر ساعت کلاینت (H6): ردیف و هر فیلد شمارنده نسخه سروری
--      می‌گیرند (row_version / field_versions) تا تعارض با شمارنده حل شود، نه با ساعت.
--
-- Rollback:
--   DROP INDEX IF EXISTS mutations_clinic_client_id_uq;
--   ALTER TABLE mutations ADD CONSTRAINT mutations_client_mutation_id_key UNIQUE (client_mutation_id);
--   DROP INDEX IF EXISTS mutations_clinic_commit_idx;
--   ALTER TABLE mutations DROP COLUMN IF EXISTS commit_xid;
--   DROP TRIGGER IF EXISTS trg_patients_row_version ON patients;
--   DROP TRIGGER IF EXISTS trg_treatment_plans_row_version ON treatment_plans;
--   DROP FUNCTION IF EXISTS fn_bump_row_version();
--   ALTER TABLE patients DROP COLUMN IF EXISTS row_version, DROP COLUMN IF EXISTS field_versions;
--   ALTER TABLE treatment_plans DROP COLUMN IF EXISTS row_version, DROP COLUMN IF EXISTS field_versions;

-- ============================================================
-- 1) dedupe در محدوده تنانت (H4)
-- ============================================================
DO $dedupe$
DECLARE
  con record;
BEGIN
  FOR con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'mutations'
       AND c.contype = 'u'
       AND array_length(c.conkey, 1) = 1
       AND EXISTS (
             SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = t.oid
                AND a.attnum = c.conkey[1]
                AND a.attname = 'client_mutation_id'
           )
  LOOP
    EXECUTE format('ALTER TABLE mutations DROP CONSTRAINT %I', con.conname);
  END LOOP;
END
$dedupe$;

CREATE UNIQUE INDEX IF NOT EXISTS mutations_clinic_client_id_uq
  ON mutations (clinic_id, client_mutation_id);

-- ============================================================
-- 2) خط اطمینان commit برای cursor (H5)
-- ============================================================
ALTER TABLE mutations ADD COLUMN IF NOT EXISTS commit_xid xid8 NOT NULL DEFAULT pg_current_xact_id();

CREATE INDEX IF NOT EXISTS mutations_clinic_commit_idx
  ON mutations (clinic_id, commit_xid, server_seq);

COMMENT ON COLUMN mutations.commit_xid IS
  'Transaction id that wrote the row. sync/pull only serves rows below pg_snapshot_xmin(pg_current_snapshot()), so a slower transaction can never commit BEHIND a cursor that already moved past it (WEAKNESSES H5).';

-- ============================================================
-- 3) شمارنده نسخه ردیف و نسخه هر فیلد (H6)
-- ============================================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS field_versions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS field_versions jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_row_version_chk;
ALTER TABLE patients ADD CONSTRAINT patients_row_version_chk CHECK (row_version >= 1);
ALTER TABLE treatment_plans DROP CONSTRAINT IF EXISTS treatment_plans_row_version_chk;
ALTER TABLE treatment_plans ADD CONSTRAINT treatment_plans_row_version_chk CHECK (row_version >= 1);

-- هر UPDATE شمارنده ردیف را یک واحد جلو می‌برد و فقط فیلدهایی که واقعاً تغییر
-- کردند همان شماره را در field_versions می‌گیرند. سرور تنها مرجع ترتیب است.
CREATE OR REPLACE FUNCTION fn_bump_row_version() RETURNS trigger AS $$
DECLARE
  next_version integer;
  changed jsonb;
BEGIN
  next_version := COALESCE(OLD.row_version, 1) + 1;
  NEW.row_version := next_version;

  SELECT COALESCE(jsonb_object_agg(n.key, to_jsonb(next_version)), '{}'::jsonb)
    INTO changed
    FROM jsonb_each(to_jsonb(NEW)) AS n(key, value)
   WHERE n.key NOT IN ('row_version', 'field_versions', 'updated_at')
     AND n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);

  NEW.field_versions := COALESCE(OLD.field_versions, '{}'::jsonb) || changed;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION fn_bump_row_version() IS
  'Server-owned version counter for field-level conflict resolution (WEAKNESSES H6). row_version is monotonic per row; field_versions records the version at which each column last changed.';

DROP TRIGGER IF EXISTS trg_patients_row_version ON patients;
CREATE TRIGGER trg_patients_row_version
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION fn_bump_row_version();

DROP TRIGGER IF EXISTS trg_treatment_plans_row_version ON treatment_plans;
CREATE TRIGGER trg_treatment_plans_row_version
  BEFORE UPDATE ON treatment_plans
  FOR EACH ROW EXECUTE FUNCTION fn_bump_row_version();
