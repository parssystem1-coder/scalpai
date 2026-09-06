-- ScalpAI v2 — 0001 init (DESIGN-V2 §6.1 + §6.3)
-- Rollback: DROP TABLE audit_log, consents, analyses, gallery_items, sessions,
--   services, patients, refresh_tokens, usage_counters, entitlements,
--   plan_features, plans, users, branches, clinics, __migrations;
--   DROP EXTENSION IF EXISTS pg_trgm;  (roles are cluster-global, not dropped)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS __migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  address text,
  phone text
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  branch_id uuid REFERENCES branches(id),
  role text NOT NULL CHECK (role IN ('owner','trichologist','receptionist')),
  email text NOT NULL,
  password_hash text NOT NULL,
  last_login_at timestamptz,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uq ON users (email);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  replaced_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS refresh_tokens_hash_uq ON refresh_tokens (token_hash);

CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text NOT NULL,
  gender text,
  birth_date date,
  notes_encrypted text,
  tags text[] DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
-- Partial live-only uniqueness (engineering-rules §4)
CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_phone_live_uq
  ON patients (clinic_id, phone) WHERE deleted_at IS NULL;
-- Persian fuzzy search via trigram (§6 rules)
CREATE INDEX IF NOT EXISTS patients_first_name_trgm_idx ON patients USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS patients_last_name_trgm_idx ON patients USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS patients_phone_trgm_idx ON patients USING gin (phone gin_trgm_ops);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  buffer_after_min integer NOT NULL DEFAULT 0,
  price numeric(12,0) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  staff_id uuid REFERENCES users(id),
  service_id uuid REFERENCES services(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  status text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','completed','cancelled','no_show')),
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff','patient_portal','bot')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_clinic_start_idx ON sessions (clinic_id, start_at);

CREATE TABLE IF NOT EXISTS gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  session_id uuid REFERENCES sessions(id),
  storage_key text NOT NULL,
  thumb_key text,
  mime text NOT NULL,
  captured_at timestamptz,
  body_region text,
  exif_stripped boolean NOT NULL DEFAULT false,
  upload_state text NOT NULL DEFAULT 'pending'
    CHECK (upload_state IN ('pending','done')),
  quality jsonb,
  sha256 text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  session_id uuid REFERENCES sessions(id),
  gallery_item_id uuid REFERENCES gallery_items(id),
  type text NOT NULL CHECK (type IN ('local_onnx','gemini','manual')),
  result jsonb NOT NULL,
  expert_review jsonb,
  model_version text,
  explain_map_key text,
  confidence_avg numeric(5,4),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  service_id uuid REFERENCES services(id),
  template_version text NOT NULL,
  signature_payload text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_from_ip text,
  revoked_at timestamptz
);

-- Append-only hash chain (ADR: audit anchor worker lands in phase 3)
CREATE TABLE IF NOT EXISTS audit_log (
  id bigserial PRIMARY KEY,
  clinic_id uuid,
  user_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  meta jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  prev_hash text,
  row_hash text NOT NULL
);

-- Plans & Entitlements (§9.1)
CREATE TABLE IF NOT EXISTS plans (
  code text PRIMARY KEY,
  name jsonb NOT NULL,
  price numeric(12,0) NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year')),
  limits jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS plan_features (
  plan_code text NOT NULL REFERENCES plans(code) ON DELETE CASCADE,
  feature text NOT NULL,
  PRIMARY KEY (plan_code, feature)
);

CREATE TABLE IF NOT EXISTS entitlements (
  clinic_id uuid PRIMARY KEY REFERENCES clinics(id),
  plan_code text NOT NULL REFERENCES plans(code),
  overrides jsonb,
  current_period_end timestamptz
);

CREATE TABLE IF NOT EXISTS usage_counters (
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  metric text NOT NULL,
  period_start date NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, metric, period_start)
);

-- ============================ RLS (ADR-0003) ============================
-- Explicit per-table statements (greppable by conformance harness).
-- The app role is NOSUPERUSER NOBYPASSRLS (bootstrap in migrate.ts), and
-- transactions must SET LOCAL app.clinic_id before their first query.

ALTER TABLE branches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE services      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements  ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log     ENABLE ROW LEVEL SECURITY;

ALTER TABLE branches      FORCE ROW LEVEL SECURITY;
ALTER TABLE users         FORCE ROW LEVEL SECURITY;
ALTER TABLE patients      FORCE ROW LEVEL SECURITY;
ALTER TABLE services      FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions      FORCE ROW LEVEL SECURITY;
ALTER TABLE gallery_items FORCE ROW LEVEL SECURITY;
ALTER TABLE analyses      FORCE ROW LEVEL SECURITY;
ALTER TABLE consents      FORCE ROW LEVEL SECURITY;
ALTER TABLE entitlements  FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log     FORCE ROW LEVEL SECURITY;

CREATE POLICY branches_clinic_isolation       ON branches      FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY users_clinic_isolation          ON users         FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY patients_clinic_isolation       ON patients      FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY services_clinic_isolation       ON services      FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY sessions_clinic_isolation       ON sessions      FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY gallery_clinic_isolation        ON gallery_items FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY analyses_clinic_isolation       ON analyses      FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY consents_clinic_isolation       ON consents      FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY entitlements_clinic_isolation   ON entitlements  FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY usage_clinic_isolation          ON usage_counters FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);
CREATE POLICY audit_log_clinic_isolation      ON audit_log     FOR ALL TO scalpai_app USING (clinic_id = current_setting('app.clinic_id', true)::uuid) WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

CREATE INDEX IF NOT EXISTS patients_clinic_idx ON patients (clinic_id);
CREATE INDEX IF NOT EXISTS sessions_clinic_idx ON sessions (clinic_id);
