-- Auth helper: login lookup must happen before the tenant is known, while
-- `users` sits behind FORCE RLS. SECURITY DEFINER (owned by the migration
-- role) exposes exactly one column set — never the whole table — and is the
-- only definer function in the system (audited by conformance rule `definer`).
-- Rollback: DROP FUNCTION IF EXISTS fn_auth_login(text);

CREATE OR REPLACE FUNCTION fn_auth_login(p_email text)
RETURNS TABLE (id uuid, clinic_id uuid, role text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.clinic_id, u.role::text, u.password_hash
  FROM users u
  WHERE u.email = p_email AND u.revoked_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION fn_auth_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_auth_login(text) TO scalpai_app;
