import { Pool } from "pg";
import { loadEnv } from "./load-env.js";

/**
 * Platform-admin plan catalog (WEAKNESSES C4 — ADR-0031).
 *
 * The catalog is shared platform data: a clinic owner must never be able to
 * change plan pricing, features or limits through the tenant API. Writes live
 * here, connect as the migration role, and are reachable only from this CLI
 * (`npm run plans:admin -- …`) or a migration.
 *
 * Limits are validated as non-negative integers with a hard ceiling, so a
 * fat-fingered value can neither overflow `bigint` usage counters nor silently
 * disable a quota (C4 / overflow test).
 */

export const PLAN_LIMIT_MAX = 1_000_000_000;
/** plans.price is numeric(12,0) — twelve digits is the physical ceiling. */
export const PLAN_PRICE_MAX = 999_999_999_999;

export interface PlatformPlanInput {
  code: string;
  name: Record<string, string>;
  price: number;
  interval?: "month" | "year";
  features?: string[];
  limits?: Record<string, number>;
}

const CODE_RE = /^[a-z][a-z0-9_]{1,31}$/;

export function validatePlanInput(input: unknown): Required<PlatformPlanInput> {
  if (typeof input !== "object" || input === null) throw new Error("plan payload must be an object");
  const raw = input as Record<string, unknown>;

  const code = String(raw.code ?? "");
  if (!CODE_RE.test(code)) throw new Error(`invalid plan code: ${code}`);

  const name = raw.name;
  if (typeof name !== "object" || name === null || Array.isArray(name)) throw new Error("plan name must be a locale map");
  const localized: Record<string, string> = {};
  for (const [locale, value] of Object.entries(name as Record<string, unknown>)) {
    if (typeof value !== "string" || value.length === 0 || value.length > 120) {
      throw new Error(`invalid plan name for locale ${locale}`);
    }
    localized[locale] = value;
  }
  if (Object.keys(localized).length === 0) throw new Error("plan name must have at least one locale");

  const price = Number(raw.price ?? 0);
  if (!Number.isInteger(price) || price < 0 || price > PLAN_PRICE_MAX) {
    throw new Error(`plan price must be an integer in [0, ${PLAN_PRICE_MAX}]`);
  }

  const interval = (raw.interval ?? "month") as "month" | "year";
  if (interval !== "month" && interval !== "year") throw new Error("plan interval must be month or year");

  const featuresRaw = raw.features ?? [];
  if (!Array.isArray(featuresRaw)) throw new Error("plan features must be an array");
  const features = featuresRaw.map((f) => {
    if (typeof f !== "string" || f.length === 0 || f.length > 60) throw new Error("invalid feature name");
    return f;
  });

  const limitsRaw = raw.limits ?? {};
  if (typeof limitsRaw !== "object" || limitsRaw === null || Array.isArray(limitsRaw)) {
    throw new Error("plan limits must be an object");
  }
  const limits: Record<string, number> = {};
  for (const [metric, value] of Object.entries(limitsRaw as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > PLAN_LIMIT_MAX) {
      throw new Error(`limit '${metric}' must be an integer in [0, ${PLAN_LIMIT_MAX}]`);
    }
    limits[metric] = value;
  }

  return { code, name: localized, price, interval, features, limits };
}

function platformUrl(explicit?: string): string {
  const url = explicit ?? process.env.MIGRATE_DATABASE_URL;
  if (!url) throw new Error("MIGRATE_DATABASE_URL is required for platform catalog operations");
  return url;
}

async function withPool<T>(url: string, fn: (pool: Pool) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    return await fn(pool);
  } finally {
    await pool.end();
  }
}

export async function listPlansAsPlatform(url?: string): Promise<Array<Record<string, unknown>>> {
  return withPool(platformUrl(url), async (pool) => {
    const res = await pool.query(
      `SELECT p.code, p.name, p.price, p.interval, p.limits,
              coalesce(array_agg(pf.feature ORDER BY pf.feature) FILTER (WHERE pf.feature IS NOT NULL), '{}') AS features
         FROM plans p
         LEFT JOIN plan_features pf ON pf.plan_code = p.code
        GROUP BY p.code
        ORDER BY p.price`,
    );
    return res.rows as Array<Record<string, unknown>>;
  });
}

export async function upsertPlanAsPlatform(input: unknown, url?: string): Promise<Required<PlatformPlanInput>> {
  const plan = validatePlanInput(input);
  await withPool(platformUrl(url), async (pool) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO plans (code, name, price, interval, limits)
         VALUES ($1, $2::jsonb, $3, $4, $5::jsonb)
         ON CONFLICT (code) DO UPDATE
           SET name = EXCLUDED.name, price = EXCLUDED.price,
               interval = EXCLUDED.interval, limits = EXCLUDED.limits`,
        [plan.code, JSON.stringify(plan.name), String(plan.price), plan.interval, JSON.stringify(plan.limits)],
      );
      await client.query("DELETE FROM plan_features WHERE plan_code = $1", [plan.code]);
      for (const feature of plan.features) {
        await client.query("INSERT INTO plan_features (plan_code, feature) VALUES ($1, $2)", [plan.code, feature]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  });
  return plan;
}

export async function deletePlanAsPlatform(code: string, url?: string): Promise<boolean> {
  return withPool(platformUrl(url), async (pool) => {
    const refs = await pool.query("SELECT 1 FROM entitlements WHERE plan_code = $1 LIMIT 1", [code]);
    if ((refs.rowCount ?? 0) > 0) throw new Error(`plan '${code}' is still referenced by a clinic entitlement`);
    const res = await pool.query("DELETE FROM plans WHERE code = $1 RETURNING code", [code]);
    return (res.rowCount ?? 0) > 0;
  });
}

async function main(): Promise<void> {
  loadEnv();
  const [command, arg] = process.argv.slice(2);
  switch (command) {
    case "list": {
      console.log(JSON.stringify(await listPlansAsPlatform(), null, 2));
      return;
    }
    case "upsert": {
      if (!arg) throw new Error("usage: plans:admin upsert '<json>'");
      const plan = await upsertPlanAsPlatform(JSON.parse(arg));
      console.log(`plan '${plan.code}' upserted (${plan.features.length} feature(s))`);
      return;
    }
    case "delete": {
      if (!arg) throw new Error("usage: plans:admin delete <code>");
      const ok = await deletePlanAsPlatform(arg);
      console.log(ok ? `plan '${arg}' deleted` : `plan '${arg}' not found`);
      return;
    }
    default:
      throw new Error("usage: plans:admin <list|upsert|delete> [arg]");
  }
}

const isCli = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("plans-admin.ts");
if (isCli) {
  main().catch((err: Error) => {
    console.error(`plans:admin failed: ${err.message}`);
    process.exit(1);
  });
}
