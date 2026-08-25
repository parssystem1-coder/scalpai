import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

/**
 * Minimal forward-only migrator (ADR-0004 style ownership).
 * - Runs as MIGRATE_DATABASE_URL (owner/superuser — RLS bootstrap needs it)
 * - Tracks applied files in __migrations
 * - Bootstraps the NOSUPERUSER/NOBYPASSRLS app role + grants (append-only audit_log!)
 *   using APP_ROLE_PASSWORD from env (never committed).
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

export async function migrate(migrateUrl: string, opts?: { dir?: string }): Promise<MigrateResult> {
  const dir = opts?.dir ?? sqlDir();
  const appRolePassword =
    process.env.APP_ROLE_PASSWORD ?? process.env.PGPASSWORD_APP ?? "scalpai_dev_only";
  const pool = new Pool({ connectionString: migrateUrl, max: 1 });
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query("CREATE TABLE IF NOT EXISTS __migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    await bootstrapAppRole(client, appRolePassword);
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

async function bootstrapAppRole(client: PoolClient, password: string): Promise<void> {
  const pwd = password.replace(/'/g, "''");
  await client.query(`
    DO $bootstrap$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scalpai_app') THEN
        EXECUTE format('CREATE ROLE scalpai_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOINHERIT', '${pwd}');
      END IF;
    END
    $bootstrap$;
  `);
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
}

/** Dev/CI helper: wipe all business data for a deterministic re-seed. */
export async function resetAll(migrateUrl: string): Promise<void> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: migrateUrl, max: 1 });
  try {
    await pool.query(`TRUNCATE audit_log, consents, analyses, gallery_items, sessions,
      patients, services, usage_counters, entitlements, plan_features, plans,
      refresh_tokens, users, branches, clinics RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}
/** Id of the marker clinic created by seed() (used by integration tests). */
export async function seedMarkerClinicId(migrateUrl: string): Promise<string> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: migrateUrl, max: 1 });
  try {
    const r = await pool.query("SELECT id FROM clinics WHERE settings->>'seed' = 'v1' LIMIT 1");
    return String(r.rows[0].id);
  } finally {
    await pool.end();
  }
}
