-- 0005__media_indexes.sql
-- Slice M1 (W20): composite indexes for phase-2 hot paths (engineering-rules §4).

CREATE INDEX IF NOT EXISTS sessions_clinic_start_idx
  ON sessions (clinic_id, start_at DESC);

CREATE INDEX IF NOT EXISTS gallery_clinic_patient_idx
  ON gallery_items (clinic_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS analyses_clinic_patient_idx
  ON analyses (clinic_id, patient_id, created_at DESC);
