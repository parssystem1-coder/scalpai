import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Minimal forward-only migrator (ADR-0004 style ownership).
 * - Runs as MIGRATE_DATABASE_URL (owner/superuser — RLS bootstrap needs it)
 * - Tracks applied files in __migrations
 * - Bootstraps the NOSUPERUSER/NOBYPASSRLS app role + the NOLOGIN auth role
 *   (ADR-0029) with their grants, using APP_ROLE_PASSWORD from env.
 *
 * Phase 2: applyGrants() is also where the tenancy boundaries are re-asserted
 * after every file, so a later `GRANT ... ON ALL TABLES` can never quietly hand
 * refresh_tokens or the plan catalog back to the app role.
 *
 * Phase 6 (ADR-0038): the same applies to the privacy boundaries — the audit
 * anchor table stays append-only and the plaintext quarantine tables stay
 * unreachable for the app role.
 */

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export function sqlDir(root = process.cwd()): string {
  const p = join(root, "packages", "db", "sql");
  if (!existsSync(p)) return join(root, "sql");
  return p;
}

export async function migrate(config: string | import("pg").PoolConfig, opts?: { dir?: string }): Promise<MigrateResult> {
  const dir = opts?.dir ?? sqlDir();
  const appRolePassword =
    process.env.APP_ROLE_PASSWORD ?? process.env.PGPASSWORD_APP ?? "scalpai_dev_only";
  const poolConfig = typeof config === "string" ? { connectionString: config, max: 1 } : { ...config, max: 1 };
  const pool = new Pool(poolConfig);
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query("CREATE TABLE IF NOT EXISTS __migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await bootstrapRoles(client, appRolePassword);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const file of files) {
      const done = await client.query("SELECT 1 FROM __migrations WHERE name = $1", [file]);
      if (done.rowCount && done.rowCount > 0) {
        skipped.push(file);
        continue;
      }
      const sqlText = readFileSync(join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sqlText);
        // Role may be referenced by policies created above; grant after each file.
        await applyGrants(client);
        await client.query("INSERT INTO __migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
  return { applied, skipped };
}

async function bootstrapRoles(client: PoolClient, password: string): Promise<void> {
  const pwd = password.replace(/'/g, "''");
  await client.query(`
    DO $bootstrap$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scalpai_app') THEN
        EXECUTE format('CREATE ROLE scalpai_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOINHERIT', '${pwd}');
      END IF;
      -- ADR-0029: the pre-tenant auth surface runs as its own least-privilege
      -- principal. NOLOGIN — reachable only through SECURITY DEFINER functions.
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scalpai_auth') THEN
        CREATE ROLE scalpai_auth NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
      END IF;
    END
    $bootstrap$;
  `);
}

/** Kept for backwards compatibility with older call sites/scripts. */
export async function bootstrapAppRole(client: PoolClient, password: string): Promise<void> {
  await bootstrapRoles(client, password);
}

export async function applyGrants(client: PoolClient): Promise<void> {
  await client.query(`
    GRANT USAGE ON SCHEMA public TO scalpai_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scalpai_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scalpai_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scalpai_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO scalpai_app;
    -- Append-only audit trail: the app can never rewrite history (§13)
    REVOKE UPDATE, DELETE ON audit_log FROM scalpai_app;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON __migrations FROM scalpai_app;
  `);

  // Phase 2 boundaries — idempotent, and safe on a database where the tables do
  // not exist yet (first migration file has not run).
  await client.query(`
    DO $tenancy$
    BEGIN
      IF to_regclass('public.refresh_tokens') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON refresh_tokens FROM scalpai_app';
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scalpai_auth') THEN
          EXECUTE 'GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO scalpai_auth';
        END IF;
      END IF;
      IF to_regclass('public.users') IS NOT NULL
         AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scalpai_auth') THEN
        EXECUTE 'GRANT SELECT ON users TO scalpai_auth';
      END IF;
      IF to_regclass('public.plans') IS NOT NULL THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON plans FROM scalpai_app';
      END IF;
      IF to_regclass('public.plan_features') IS NOT NULL THEN
        EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON plan_features FROM scalpai_app';
      END IF;
      IF to_regclass('public.clinics') IS NOT NULL THEN
        EXECUTE 'REVOKE INSERT, DELETE ON clinics FROM scalpai_app';
      END IF;
    END
    $tenancy$;
  `);

  // Phase 6 privacy boundaries (ADR-0038). Without this block the blanket
  // GRANT above would hand UPDATE/DELETE on the anchor table straight back.
  await client.query(`
    DO $privacy$
    BEGIN
      IF to_regclass('public.audit_anchors') IS NOT NULL THEN
        EXECUTE 'REVOKE UPDATE, DELETE ON audit_anchors FROM scalpai_app';
      END IF;
      IF to_regclass('public.phi_plaintext_quarantine') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON phi_plaintext_quarantine FROM scalpai_app';
      END IF;
      IF to_regclass('public.consent_signature_quarantine') IS NOT NULL THEN
        EXECUTE 'REVOKE ALL ON consent_signature_quarantine FROM scalpai_app';
      END IF;
    END
    $privacy$;
  `);
}
