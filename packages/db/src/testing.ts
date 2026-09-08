import { Pool } from "pg";

/**
 * Testing-only entrypoint (`@scalpai/db/testing`) — WEAKNESSES H18.
 *
 * Destructive helpers live here instead of the package's public API so that no
 * production code path can import them by accident, and every one of them
 * fails closed: NODE_ENV=production, a production-looking database name/host,
 * or a remote host without an explicit opt-in all abort before any SQL runs.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "postgres", "db"]);
const PRODUCTION_HINT = /(prod|production|live|staging)/i;

export class UnsafeDatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDatabaseTargetError";
  }
}

/**
 * Guard for every destructive helper in this module. Exported so the phase-2
 * regression test can prove the refusal without owning a production database.
 */
export function assertResettableTarget(target: string): void {
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    throw new UnsafeDatabaseTargetError("refusing to wipe data with NODE_ENV=production");
  }

  let host: string;
  let database: string;
  try {
    const url = new URL(target);
    host = url.hostname.toLowerCase();
    database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  } catch {
    throw new UnsafeDatabaseTargetError("target must be a parseable postgres connection URL");
  }

  if (!database) {
    throw new UnsafeDatabaseTargetError("target must name a database");
  }
  if (PRODUCTION_HINT.test(database) || PRODUCTION_HINT.test(host)) {
    throw new UnsafeDatabaseTargetError(`refusing to wipe a production-looking target: ${host}/${database}`);
  }
  if (!LOCAL_HOSTS.has(host) && process.env.SCALPAI_ALLOW_DB_RESET !== "1") {
    throw new UnsafeDatabaseTargetError(
      `refusing to wipe a remote database (${host}); set SCALPAI_ALLOW_DB_RESET=1 to override in a sandbox`,
    );
  }
}

async function withPool<T>(url: string, fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

/**
 * Dev/CI helper: wipe all business data for a deterministic re-seed.
 *
 * Phase 8 adds `upload_sessions` and `storage_usage`: a leftover open session
 * would keep holding a storage reservation across suites and make quota tests
 * order-dependent.
 */
export async function resetAll(migrateUrl: string): Promise<void> {
  assertResettableTarget(migrateUrl);
  await withPool(migrateUrl, (pool) =>
    pool.query(`TRUNCATE audit_log, consents, analyses, upload_sessions, gallery_items, sessions,
      patients, services, storage_usage, usage_counters, entitlements, plan_features, plans,
      refresh_tokens, users, branches, clinics RESTART IDENTITY CASCADE`),
  );
}

/**
 * M19: `pool.query` without a row type hands back `any[]`, so every `r.rows[0].id`
 * below was an unchecked member access on `any` — and it would also have
 * stringified `undefined` into a clinic id when the seed had not run. Both
 * helpers now name their row shape and fail loudly instead.
 */
interface ClinicIdRow {
  id: string;
}

async function seededClinicId(migrateUrl: string, seedMarker: string): Promise<string> {
  return withPool(migrateUrl, async (pool) => {
    const r = await pool.query<ClinicIdRow>("SELECT id FROM clinics WHERE settings->>'seed' = $1 LIMIT 1", [
      seedMarker,
    ]);
    const id = r.rows[0]?.id;
    if (!id) {
      throw new Error(`no clinic with settings->>'seed' = '${seedMarker}' — run the seed before this test`);
    }
    return id;
  });
}

/** Id of the marker clinic created by seed() (used by integration tests). */
export async function seedMarkerClinicId(migrateUrl: string): Promise<string> {
  return seededClinicId(migrateUrl, "v1");
}

/** Id of the second seeded clinic — the cross-tenant counterparty. */
export async function seedOtherClinicId(migrateUrl: string): Promise<string> {
  return seededClinicId(migrateUrl, "other");
}

/**
 * Raw SQL as the migration/owner role. Tests use it to assert database-level
 * constraints (policy matrix, unique indexes) that the API cannot express.
 */
export async function migrateSql<T extends Record<string, unknown> = Record<string, unknown>>(
  migrateUrl: string,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withPool(migrateUrl, async (pool) => {
    const res = await pool.query<T>(text, params);
    return res.rows;
  });
}
