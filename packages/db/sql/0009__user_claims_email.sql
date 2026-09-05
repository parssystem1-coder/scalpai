-- Refresh rotation must return the full server-side identity, email included,
-- so the web client never reconstructs role/clinic/email locally (WEAKNESSES C3).
-- The return type changes, so the old function is dropped first.
-- Rollback: DROP FUNCTION IF EXISTS fn_user_claims(uuid); then re-apply 0003__user_claims_fn.sql

DROP FUNCTION IF EXISTS fn_user_claims(uuid);

CREATE FUNCTION fn_user_claims(p_user_id uuid)
RETURNS TABLE (id uuid, clinic_id uuid, role text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.clinic_id, u.role::text, u.email
  FROM users u
  WHERE u.id = p_user_id AND u.revoked_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_user_claims(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_user_claims(uuid) TO scalpai_app;
