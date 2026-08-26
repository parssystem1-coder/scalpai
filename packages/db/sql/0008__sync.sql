-- 0008__sync.sql
-- Slice P2 (playbook 3.1): server mutation ledger (§6.5) + treatment_plans (§6.1).

CREATE TABLE IF NOT EXISTS mutations (
  id bigserial PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  user_id uuid,
  client_mutation_id uuid NOT NULL UNIQUE,
  entity text NOT NULL CHECK (entity IN ('patients','treatment_plans','analyses')),
  op text NOT NULL CHECK (op IN ('create','update')),
  payload jsonb NOT NULL,
  server_seq bigserial NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mutations_clinic_seq_idx ON mutations (clinic_id, server_seq);

CREATE TABLE IF NOT EXISTS treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  items jsonb NOT NULL DEFAULT '[]',
  start_date date,
  review_intervals jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS plans_clinic_patient_idx ON treatment_plans (clinic_id, patient_id, updated_at DESC);

ALTER TABLE mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutations FORCE ROW LEVEL SECURITY;
CREATE POLICY mutations_clinic_isolation ON mutations FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY treatment_plans_clinic_isolation ON treatment_plans FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- reuse the §updated_at trigger from 0004 for treatment_plans
DROP TRIGGER IF EXISTS trg_treatment_plans_updated_at ON treatment_plans;
CREATE TRIGGER trg_treatment_plans_updated_at
  BEFORE UPDATE ON treatment_plans
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
