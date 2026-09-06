-- 0004__audit_lock_and_updated_at.sql
-- Slice H (db-hardening): WEAKNESSES W06 + W07.
-- Backward-compatible: additive function + triggers only (expand phase).

-- W07: `updated_at` must advance on every UPDATE (phase-3 sync LWW relies on it).
CREATE OR REPLACE FUNCTION fn_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_patients_updated_at ON patients;
CREATE TRIGGER trg_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_sessions_updated_at ON sessions;
CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
