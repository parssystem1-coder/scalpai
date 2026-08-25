-- Refresh-rotation needs the user's claims without a tenant context
-- (refresh_tokens are pre-auth), while `users` stays behind FORCE RLS.
-- Rollback: DROP FUNCTION IF EXISTS fn_user_claims(uuid);

CREATE OR REPLACE FUNCTION fn_user_claims(p_user_id uuid)
RETURNS TABLE (id uuid, clinic_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.clinic_id, u.role::text
  FROM users u
  WHERE u.id = p_user_id AND u.revoked_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_user_claims(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_user_claims(uuid) TO scalpai_app;
