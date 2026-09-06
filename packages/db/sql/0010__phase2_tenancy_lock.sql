-- 0010__phase2_tenancy_lock.sql — فاز ۲: قفل تنانسی، RLS و مرز دسترسی
-- (ADR-0028 platform tables, ADR-0029 auth role, ADR-0031 platform catalog, ADR-0032 identity)
--
-- Rollback:
--   DROP POLICY IF EXISTS refresh_tokens_clinic_isolation ON refresh_tokens;
--   DROP POLICY IF EXISTS refresh_tokens_auth_service ON refresh_tokens;
--   DROP POLICY IF EXISTS clinics_self_select ON clinics;
--   DROP POLICY IF EXISTS clinics_self_update ON clinics;
--   DROP POLICY IF EXISTS plans_read_only ON plans;
--   DROP POLICY IF EXISTS plan_features_read_only ON plan_features;
--   DROP POLICY IF EXISTS users_auth_lookup ON users;
--   ALTER TABLE refresh_tokens DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE clinics DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE plans DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE plan_features DISABLE ROW LEVEL SECURITY;
--   DROP FUNCTION IF EXISTS fn_refresh_issue(uuid, uuid, uuid, text, uuid, timestamptz);
--   DROP FUNCTION IF EXISTS fn_refresh_find(text);
--   DROP FUNCTION IF EXISTS fn_refresh_revoke_family(uuid);
--   DROP FUNCTION IF EXISTS fn_refresh_mark_replaced(uuid, uuid);
--   DROP INDEX IF EXISTS users_email_lower_uq; CREATE UNIQUE INDEX users_email_uq ON users (email);
--   ALTER TABLE refresh_tokens DROP COLUMN clinic_id;  (roles are cluster-global, not dropped)

-- ============================================================
-- 1) Dedicated, least-privilege role for the pre-tenant auth surface (R5)
-- ============================================================
DO $auth_role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scalpai_auth') THEN
    CREATE ROLE scalpai_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$auth_role$;

-- ============================================================
-- 2) refresh_tokens becomes clinic-scoped and definer-only (C5/M12)
-- ============================================================
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES clinics(id);

UPDATE refresh_tokens rt
   SET clinic_id = u.clinic_id
  FROM users u
 WHERE u.id = rt.user_id AND rt.clinic_id IS NULL;

-- orphan tokens (user already hard-deleted) cannot be tenant-scoped — drop them
DELETE FROM refresh_tokens WHERE clinic_id IS NULL;

ALTER TABLE refresh_tokens ALTER COLUMN clinic_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS refresh_tokens_clinic_idx ON refresh_tokens (clinic_id);
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refresh_tokens_clinic_isolation ON refresh_tokens;
CREATE POLICY refresh_tokens_clinic_isolation ON refresh_tokens FOR ALL TO scalpai_app
  USING (clinic_id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- The auth service role is the only principal allowed to see the whole table,
-- and it can only be reached through the SECURITY DEFINER functions below.
DROP POLICY IF EXISTS refresh_tokens_auth_service ON refresh_tokens;
CREATE POLICY refresh_tokens_auth_service ON refresh_tokens FOR ALL TO scalpai_auth
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3) clinics — the tenant root: isolation is by id, not clinic_id (ADR-0028)
-- ============================================================
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinics_self_select ON clinics;
CREATE POLICY clinics_self_select ON clinics FOR SELECT TO scalpai_app
  USING (id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinics_self_update ON clinics;
CREATE POLICY clinics_self_update ON clinics FOR UPDATE TO scalpai_app
  USING (id = current_setting('app.clinic_id', true)::uuid)
  WITH CHECK (id = current_setting('app.clinic_id', true)::uuid);

-- No INSERT/DELETE policy on purpose: provisioning and off-boarding a clinic
-- are platform operations (migration/CLI), never a tenant API call.

-- ============================================================
-- 4) Platform catalog is read-only for tenants (C4 / ADR-0031)
-- ============================================================
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read_only ON plans;
CREATE POLICY plans_read_only ON plans FOR SELECT TO scalpai_app USING (true);

ALTER TABLE plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_features FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plan_features_read_only ON plan_features;
CREATE POLICY plan_features_read_only ON plan_features FOR SELECT TO scalpai_app USING (true);

-- ============================================================
-- 5) Identity model (C5/M12 / ADR-0032): email is a global, case-insensitive id
-- ============================================================
UPDATE users SET email = lower(email) WHERE email <> lower(email);
DROP INDEX IF EXISTS users_email_uq;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

-- ============================================================
-- 6) The auth surface: SECURITY DEFINER functions owned by scalpai_auth
-- ============================================================
GRANT USAGE, CREATE ON SCHEMA public TO scalpai_auth;
GRANT SELECT ON users TO scalpai_auth;
GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO scalpai_auth;

DROP POLICY IF EXISTS users_auth_lookup ON users;
CREATE POLICY users_auth_lookup ON users FOR SELECT TO scalpai_auth
  USING (revoked_at IS NULL);

-- login lookup: case-insensitive match on the normalized identifier
CREATE OR REPLACE FUNCTION fn_auth_login(p_email text)
RETURNS TABLE (id uuid, clinic_id uuid, role text, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.clinic_id, u.role::text, u.password_hash
  FROM users u
  WHERE lower(u.email) = lower(p_email) AND u.revoked_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_refresh_issue(
  p_id uuid,
  p_user_id uuid,
  p_clinic_id uuid,
  p_token_hash text,
  p_family_id uuid,
  p_expires_at timestamptz
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO refresh_tokens (id, user_id, clinic_id, token_hash, family_id, expires_at)
  VALUES (p_id, p_user_id, p_clinic_id, p_token_hash, p_family_id, p_expires_at)
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION fn_refresh_find(p_token_hash text)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  clinic_id uuid,
  family_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  replaced_by uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rt.id, rt.user_id, rt.clinic_id, rt.family_id, rt.expires_at, rt.revoked_at, rt.replaced_by
  FROM refresh_tokens rt
  WHERE rt.token_hash = p_token_hash
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_refresh_revoke_family(p_family_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE refresh_tokens
     SET revoked_at = now()
   WHERE family_id = p_family_id AND revoked_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION fn_refresh_mark_replaced(p_parent_id uuid, p_child_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE refresh_tokens
     SET revoked_at = now(), replaced_by = p_child_id
   WHERE id = p_parent_id;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected > 0;
END;
$$;

-- Ownership transfer: the definer principal is the restricted auth role, NOT the
-- migration superuser — so a bug in these functions can never read a business table.
ALTER FUNCTION fn_auth_login(text) OWNER TO scalpai_auth;
ALTER FUNCTION fn_user_claims(uuid) OWNER TO scalpai_auth;
ALTER FUNCTION fn_refresh_issue(uuid, uuid, uuid, text, uuid, timestamptz) OWNER TO scalpai_auth;
ALTER FUNCTION fn_refresh_find(text) OWNER TO scalpai_auth;
ALTER FUNCTION fn_refresh_revoke_family(uuid) OWNER TO scalpai_auth;
ALTER FUNCTION fn_refresh_mark_replaced(uuid, uuid) OWNER TO scalpai_auth;

REVOKE CREATE ON SCHEMA public FROM scalpai_auth;

REVOKE ALL ON FUNCTION fn_refresh_issue(uuid, uuid, uuid, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_refresh_find(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_refresh_revoke_family(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_refresh_mark_replaced(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_refresh_issue(uuid, uuid, uuid, text, uuid, timestamptz) TO scalpai_app;
GRANT EXECUTE ON FUNCTION fn_refresh_find(text) TO scalpai_app;
GRANT EXECUTE ON FUNCTION fn_refresh_revoke_family(uuid) TO scalpai_app;
GRANT EXECUTE ON FUNCTION fn_refresh_mark_replaced(uuid, uuid) TO scalpai_app;

-- ============================================================
-- 7) Hard boundaries for the app role (re-asserted by applyGrants on every run)
-- ============================================================
REVOKE ALL ON refresh_tokens FROM scalpai_app;
REVOKE INSERT, UPDATE, DELETE ON plans FROM scalpai_app;
REVOKE INSERT, UPDATE, DELETE ON plan_features FROM scalpai_app;
REVOKE INSERT, DELETE ON clinics FROM scalpai_app;
