-- 0012__phase6_phi_privacy.sql — فاز ۶: داده بالینی، رمزنگاری و حریم خصوصی
-- (ADR-0038 — PHI at rest, audit evidence, retention/purge)
--
-- سه ادعای قبلی اینجا به قید واقعی تبدیل می‌شود:
--   ۱) ستون notes_encrypted فقط اسمش رمز بود؛ از این پس CHECK اجازه نمی‌دهد
--      چیزی جز پاکت phi.v1 در آن نوشته شود.
--   ۲) امضای رضایت‌نامه به‌صورت data URL در دیتابیس می‌ماند؛ از این پس فقط
--      کلید ابجکت MinIO + sha256 + متادیتای امضا ذخیره می‌شود.
--   ۳) ledger و audit meta متن خام یادداشت را پخش می‌کردند؛ از این پس کلیدهای PHI
--      در سطح دیتابیس رد می‌شوند.
--
-- داده‌ی قدیمی حذف نمی‌شود: متن خام به جدول‌های quarantine منتقل می‌شود که
-- نقش اپلیکیشن هیچ دسترسی‌ای به آن‌ها ندارد و اپراتور با CLI و کلید فعال
-- می‌تواند آن‌ها را رمز کند و برگرداند.
--
-- Rollback:
--   ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_notes_envelope_chk;
--   ALTER TABLE patients DROP COLUMN IF EXISTS notes_key_id, DROP COLUMN IF EXISTS notes_updated_at;
--   ALTER TABLE consents ADD COLUMN IF NOT EXISTS signature_payload text;
--   ALTER TABLE consents DROP COLUMN IF EXISTS signature_key, DROP COLUMN IF EXISTS signature_sha256,
--     DROP COLUMN IF EXISTS signature_bytes, DROP COLUMN IF EXISTS signature_mime,
--     DROP COLUMN IF EXISTS signed_user_agent, DROP COLUMN IF EXISTS revoked_by,
--     DROP COLUMN IF EXISTS revoked_reason;
--   ALTER TABLE mutations DROP CONSTRAINT IF EXISTS mutations_no_plaintext_phi_chk;
--   ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_meta_no_phi_chk;
--   DROP TABLE IF EXISTS audit_anchors, storage_orphans, purge_requests, retention_policies;
--   DROP TABLE IF EXISTS phi_plaintext_quarantine, consent_signature_quarantine;

-- ============================================================
-- 0) کلیدهای PHI که در سمت دیتابیس ممنوع می‌شوند
-- ============================================================
-- همین فهرست در packages/shared/src/phi.ts هم هست؛ تست رگرسیون دو طرف را
-- برابر نگه می‌دارد (tools/privacy/phase6.spec.ts).

-- ============================================================
-- 1) یادداشت بالینی: فقط پاکت AES-256-GCM (C2)
-- ============================================================
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes_key_id text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz;

CREATE TABLE IF NOT EXISTS phi_plaintext_quarantine (
  id bigserial PRIMARY KEY,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  field text NOT NULL,
  plaintext text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE phi_plaintext_quarantine IS
  'Pre-phase-6 plaintext PHI. Unreachable for scalpai_app; re-encrypt with `npm run phi:rotate` and delete.';

INSERT INTO phi_plaintext_quarantine (source_table, source_id, clinic_id, field, plaintext)
SELECT 'patients', p.id, p.clinic_id, 'notes_encrypted', p.notes_encrypted
  FROM patients p
 WHERE p.notes_encrypted IS NOT NULL
   AND p.notes_encrypted NOT LIKE 'phi.v1.%';

UPDATE patients SET notes_encrypted = NULL, notes_key_id = NULL
 WHERE notes_encrypted IS NOT NULL AND notes_encrypted NOT LIKE 'phi.v1.%';

ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_notes_envelope_chk;
ALTER TABLE patients ADD CONSTRAINT patients_notes_envelope_chk
  CHECK (notes_encrypted IS NULL OR notes_encrypted LIKE 'phi.v1.%');

-- کلید و پاکت باید همیشه با هم بیایند — وگرنه rotation نمی‌داند کدام ردیف با کدام کلید رمز شده
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_notes_key_pairing_chk;
ALTER TABLE patients ADD CONSTRAINT patients_notes_key_pairing_chk
  CHECK ((notes_encrypted IS NULL AND notes_key_id IS NULL) OR (notes_encrypted IS NOT NULL AND notes_key_id IS NOT NULL));

-- ============================================================
-- 2) امضای رضایت‌نامه: ابجکت + hash، نه data URL (M8)
-- ============================================================
ALTER TABLE consents ADD COLUMN IF NOT EXISTS signature_key text;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS signature_sha256 text;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS signature_bytes integer;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS signature_mime text;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS signed_user_agent text;
ALTER TABLE consents ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id);
ALTER TABLE consents ADD COLUMN IF NOT EXISTS revoked_reason text;

CREATE TABLE IF NOT EXISTS consent_signature_quarantine (
  id bigserial PRIMARY KEY,
  consent_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  data_url text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE consent_signature_quarantine IS
  'Legacy consent data URLs pulled out of the row. Upload to MinIO with `npm run consent:migrate-signatures`, then delete.';

DO $sig$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'consents' AND column_name = 'signature_payload'
  ) THEN
    INSERT INTO consent_signature_quarantine (consent_id, clinic_id, data_url)
    SELECT c.id, c.clinic_id, c.signature_payload FROM consents c WHERE c.signature_payload IS NOT NULL;
    ALTER TABLE consents DROP COLUMN signature_payload;
  END IF;
END
$sig$;

-- هر امضای جدید باید کلید، دایجست، حجم و MIME مجاز داشته باشد
ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_signature_object_chk;
ALTER TABLE consents ADD CONSTRAINT consents_signature_object_chk
  CHECK (
    signature_key IS NULL OR (
      signature_sha256 ~ '^[0-9a-f]{64}$'
      AND signature_bytes BETWEEN 64 AND 262144
      AND signature_mime IN ('image/png', 'image/jpeg', 'image/svg+xml')
    )
  );

ALTER TABLE consents DROP CONSTRAINT IF EXISTS consents_revoke_pairing_chk;
ALTER TABLE consents ADD CONSTRAINT consents_revoke_pairing_chk
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS consents_signature_key_uq ON consents (signature_key) WHERE signature_key IS NOT NULL;

-- ============================================================
-- 3) ledger و audit meta: کلید PHI ممنوع (C2/H3/H17)
-- ============================================================
-- ردیف‌های تاریخی ledger پاک می‌شوند (حذف کلید، نه حذف ردیف) تا CHECK بتواند VALID باشد
UPDATE mutations
   SET payload = payload - 'notes' - 'note' - 'firstName' - 'lastName' - 'phone'
                 - 'email' - 'birthDate' - 'signaturePayload' - 'password' - 'nationalId' - 'address'
 WHERE payload ?| ARRAY['notes','note','firstName','lastName','phone','email','birthDate','signaturePayload','password','nationalId','address'];

ALTER TABLE mutations DROP CONSTRAINT IF EXISTS mutations_no_plaintext_phi_chk;
ALTER TABLE mutations ADD CONSTRAINT mutations_no_plaintext_phi_chk
  CHECK (NOT (payload ?| ARRAY['notes','note','firstName','lastName','phone','email','birthDate','signaturePayload','password','nationalId','address']));

-- audit_log فقط-افزودنی است: ردیف قدیمی را نمی‌توان اصلاح کرد بدون شکستن زنجیره hash،
-- پس قید NOT VALID فقط روی نوشتن‌های جدید اعمال می‌شود — و این دقیقاً همان چیزی است که می‌خواهیم.
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_meta_no_phi_chk;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_meta_no_phi_chk
  CHECK (meta IS NULL OR NOT (meta ?| ARRAY['notes','note','firstName','lastName','phone','email','birthDate','signaturePayload','password','nationalId','address']))
  NOT VALID;

-- ============================================================
-- 4) audit_anchors — ریشه Merkle امضاشده (H17)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_anchors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  tree_size integer NOT NULL CHECK (tree_size > 0),
  first_log_id bigint NOT NULL,
  last_log_id bigint NOT NULL,
  last_row_hash text NOT NULL CHECK (last_row_hash ~ '^[0-9a-f]{64}$'),
  merkle_root text NOT NULL CHECK (merkle_root ~ '^[0-9a-f]{64}$'),
  key_id text,
  signature text,
  worm_uri text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_anchors_clinic_created_idx ON audit_anchors (clinic_id, created_at DESC);

ALTER TABLE audit_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_anchors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_anchors_clinic_isolation ON audit_anchors;
CREATE POLICY audit_anchors_clinic_isolation ON audit_anchors FOR SELECT TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
DROP POLICY IF EXISTS audit_anchors_clinic_append ON audit_anchors;
CREATE POLICY audit_anchors_clinic_append ON audit_anchors FOR INSERT TO scalpai_app
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
-- عمداً بدون policy برای UPDATE/DELETE: لنگر بازنویسی نمی‌شود.

-- ============================================================
-- 5) storage_orphans — صف مطابقت DB و bucket (M22)
-- ============================================================
CREATE TABLE IF NOT EXISTS storage_orphans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  storage_key text NOT NULL,
  reason text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'claimed', 'deleted', 'quarantined')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS storage_orphans_key_open_uq
  ON storage_orphans (clinic_id, storage_key) WHERE state <> 'deleted';
CREATE INDEX IF NOT EXISTS storage_orphans_state_idx ON storage_orphans (state, created_at);

ALTER TABLE storage_orphans ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_orphans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS storage_orphans_clinic_isolation ON storage_orphans;
CREATE POLICY storage_orphans_clinic_isolation ON storage_orphans FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 6) retention_policies + purge_requests — حذف با تأیید دونفره (M21)
-- ============================================================
CREATE TABLE IF NOT EXISTS retention_policies (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  entity text NOT NULL,
  retain_days integer NOT NULL CHECK (retain_days >= 0 AND retain_days <= 36500),
  grace_days integer NOT NULL DEFAULT 30 CHECK (grace_days >= 0 AND grace_days <= 3650),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, entity)
);

ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_policies_clinic_isolation ON retention_policies;
CREATE POLICY retention_policies_clinic_isolation ON retention_policies FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

CREATE TABLE IF NOT EXISTS purge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL,
  scope text[] NOT NULL CHECK (array_length(scope, 1) BETWEEN 1 AND 8),
  reason text NOT NULL CHECK (length(reason) BETWEEN 8 AND 500),
  state text NOT NULL DEFAULT 'requested'
    CHECK (state IN ('requested', 'approved', 'rejected', 'executed')),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  executable_at timestamptz,
  executed_at timestamptz,
  evidence jsonb,
  -- تأیید دونفره: هیچ‌کس درخواست خودش را تأیید نمی‌کند
  CONSTRAINT purge_requests_two_person_chk CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT purge_requests_approval_pairing_chk
    CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT purge_requests_executed_needs_approval_chk
    CHECK (state <> 'executed' OR (approved_by IS NOT NULL AND executed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS purge_requests_clinic_state_idx ON purge_requests (clinic_id, state, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS purge_requests_open_per_patient_uq
  ON purge_requests (clinic_id, patient_id) WHERE state IN ('requested', 'approved');

ALTER TABLE purge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purge_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purge_requests_clinic_isolation ON purge_requests;
CREATE POLICY purge_requests_clinic_isolation ON purge_requests FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 7) مرزهای دسترسی (applyGrants هم این‌ها را بعد از هر فایل تکرار می‌کند)
-- ============================================================
REVOKE UPDATE, DELETE ON audit_anchors FROM scalpai_app;
REVOKE ALL ON phi_plaintext_quarantine FROM scalpai_app;
REVOKE ALL ON consent_signature_quarantine FROM scalpai_app;
