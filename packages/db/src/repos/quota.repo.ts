import { and, eq, sql } from "drizzle-orm";
import { storageUsage, usageCounters } from "../schema.js";
import type { Tx } from "../tenant.js";

/**
 * §9.1 metering — phase 8 (WEAKNESSES H11, ADR-0041).
 *
 * Two things were wrong with the previous surface and both are fixed here:
 *
 *  1. `getUsage()` then `incrementUsage()` was a read-then-write race. Two
 *     concurrent requests both read `used = limit - 1`, both passed, and the
 *     clinic ended the month one over its plan. Every flow metric now goes
 *     through `fn_usage_consume`, which locks the counter row and answers
 *     allowed/refused in ONE statement inside the caller's transaction.
 *
 *  2. The period was `new Date()` in UTC. A clinic whose month rolls over at
 *     UTC+03:30 had its budget opened and closed on the wrong day. The period
 *     is now derived from `clinics.timezone` in `fn_clinic_period_start`.
 *
 * Storage is deliberately NOT a monthly counter: bytes are a stock, not a flow.
 * It is reserved against measured bucket usage plus the reservations of open
 * upload sessions (M22), so a plan ceiling means the same thing at the start and
 * at the end of a month.
 */

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaError";
  }
}

export interface QuotaLimitKey {
  readonly key: string;
  /** Factor that converts the plan value into the metric's own unit. */
  readonly scale: number;
}

export interface QuotaSpec {
  /** `usage_counters.metric` for a flow, or the pseudo-metric name for storage. */
  readonly metric: string;
  readonly kind: "flow" | "storage";
  /** Plan-limit keys in priority order — the first usable one wins. */
  readonly limits: ReadonlyArray<QuotaLimitKey>;
}

/**
 * The plan catalog uses human keys (`analyses_per_month`, `storage_mb`); the
 * counters use metric names. This table is the single translation between them,
 * so a plan written by the platform CLI and a guard written in the API can never
 * disagree about what is being metered.
 */
export const QUOTA_SPECS = {
  analyses: {
    metric: "analyses",
    kind: "flow",
    limits: [
      { key: "analyses_per_month", scale: 1 },
      { key: "analyses", scale: 1 },
    ],
  },
  uploads: {
    metric: "uploads",
    kind: "flow",
    limits: [
      { key: "uploads_per_month", scale: 1 },
      { key: "uploads", scale: 1 },
    ],
  },
  sessions: {
    metric: "monthly_sessions",
    kind: "flow",
    limits: [{ key: "monthly_sessions", scale: 1 }],
  },
  storage: {
    metric: "storage_bytes",
    kind: "storage",
    limits: [
      { key: "storage_bytes", scale: 1 },
      { key: "storage_mb", scale: 1024 * 1024 },
    ],
  },
} as const satisfies Record<string, QuotaSpec>;

export type QuotaName = keyof typeof QUOTA_SPECS;

export function isQuotaName(value: string): value is QuotaName {
  return Object.prototype.hasOwnProperty.call(QUOTA_SPECS, value);
}

export function quotaMetric(name: QuotaName): string {
  return QUOTA_SPECS[name].metric;
}

/**
 * `null` means "this plan does not meter it". A negative, fractional or
 * non-numeric plan value is treated as unmetered rather than as zero: refusing
 * every request because a catalog row is malformed is the worse failure.
 */
export function resolveQuotaLimit(
  limits: Record<string, unknown> | null | undefined,
  name: QuotaName,
): number | null {
  if (!limits) return null;
  for (const candidate of QUOTA_SPECS[name].limits) {
    const raw = limits[candidate.key];
    if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) continue;
    return raw * candidate.scale;
  }
  return null;
}

/**
 * Plan limits with the clinic's overrides applied — the ONLY way the two are
 * combined (WEAKNESSES H11).
 *
 * A plain `{ ...plan, ...overrides }` is not enough, and the difference is a real
 * unenforced ceiling rather than a style point. One metric may be written with
 * more than one key (`storage_bytes` OR `storage_mb`, `uploads_per_month` OR
 * `uploads`) and `resolveQuotaLimit` takes the FIRST usable key in priority
 * order. So an override that names the other key of the same pair used to lose to
 * the plan's key: the clinic looked capped at 300KB while the base 50GB ceiling
 * was still the one being enforced. An override now retires every sibling key of
 * the metric it addresses — overriding a ceiling means replacing it, not racing
 * it.
 */
export function mergePlanLimits(
  planLimits: Record<string, unknown> | null | undefined,
  overrides: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(planLimits ?? {}) };
  if (!overrides) return merged;
  for (const spec of Object.values(QUOTA_SPECS) as ReadonlyArray<QuotaSpec>) {
    const touched = spec.limits.some((candidate) =>
      Object.prototype.hasOwnProperty.call(overrides, candidate.key),
    );
    if (!touched) continue;
    for (const candidate of spec.limits) delete merged[candidate.key];
  }
  return { ...merged, ...overrides };
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

/** First day of the clinic-local month — the period every counter is keyed by. */
export async function clinicPeriodStart(tx: Tx, clinicId: string): Promise<string> {
  const res = await tx.execute(sql`SELECT fn_clinic_period_start(${clinicId}::uuid)::text AS period_start`);
  const period = rowsOf<{ period_start: string }>(res)[0]?.period_start;
  if (!period) throw new QuotaError("quota period could not be resolved for this clinic");
  return period;
}

export interface QuotaVerdict {
  allowed: boolean;
  metric: string;
  /** Counter value AFTER a successful consume, or the unchanged value on refusal. */
  used: number;
  limit: number | null;
  periodStart: string;
}

/**
 * Atomic check+increment for a flow metric. MUST be called inside the same
 * transaction as the write it authorises: the row lock is released at COMMIT,
 * and that is exactly what makes the pair indivisible.
 */
export async function consumeQuota(
  tx: Tx,
  clinicId: string,
  name: QuotaName,
  amount: number,
  limit: number | null,
): Promise<QuotaVerdict> {
  const spec = QUOTA_SPECS[name];
  if (spec.kind !== "flow") {
    throw new QuotaError(`metric '${name}' is a stock, use reserveStorageBytes instead`);
  }
  if (!Number.isInteger(amount) || amount < 0) {
    throw new QuotaError("quota amount must be a non-negative integer");
  }
  const res = await tx.execute(sql`
    SELECT allowed, used::bigint AS used, period_start::text AS period_start
      FROM fn_usage_consume(${clinicId}::uuid, ${spec.metric}, ${amount}::bigint, ${limit}::bigint)
  `);
  const row = rowsOf<{ allowed: boolean; used: string | number; period_start: string }>(res)[0];
  if (!row) throw new QuotaError(`quota consume returned no verdict for '${spec.metric}'`);
  return {
    allowed: row.allowed === true,
    metric: spec.metric,
    used: Number(row.used),
    limit,
    periodStart: row.period_start,
  };
}

/**
 * Give the slot back. A rejected image or an aborted upload consumed a slot on
 * the way in; without a refund the clinic pays for work that produced nothing.
 */
export async function releaseQuota(tx: Tx, clinicId: string, name: QuotaName, amount: number): Promise<number> {
  const spec = QUOTA_SPECS[name];
  if (spec.kind !== "flow") throw new QuotaError(`metric '${name}' is a stock, not a flow`);
  if (!Number.isInteger(amount) || amount < 0) {
    throw new QuotaError("quota amount must be a non-negative integer");
  }
  const res = await tx.execute(
    sql`SELECT fn_usage_release(${clinicId}::uuid, ${spec.metric}, ${amount}::bigint)::bigint AS value`,
  );
  return Number(rowsOf<{ value: string | number }>(res)[0]?.value ?? 0);
}

/** Read-only view of a flow counter for the clinic's CURRENT period. */
export async function peekQuota(tx: Tx, clinicId: string, name: QuotaName): Promise<number> {
  const spec = QUOTA_SPECS[name];
  if (spec.kind !== "flow") throw new QuotaError(`metric '${name}' is a stock, not a flow`);
  const period = await clinicPeriodStart(tx, clinicId);
  const rows = await tx
    .select({ value: usageCounters.value })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.clinicId, clinicId),
        eq(usageCounters.metric, spec.metric),
        eq(usageCounters.periodStart, period),
      ),
    )
    .limit(1);
  return rows[0]?.value ?? 0;
}

export interface StorageReservation {
  allowed: boolean;
  /** Bytes the bucket scan (or the running delta) says are occupied. */
  stored: number;
  /** Bytes already promised to other open upload sessions. */
  reserved: number;
  limit: number | null;
}

/**
 * Locks the clinic's storage row and answers whether one more object of
 * `bytes` still fits. The caller MUST create its upload session in the same
 * transaction — the lock is what stops two parallel uploads from each seeing
 * the same free space.
 */
export async function reserveStorageBytes(
  tx: Tx,
  clinicId: string,
  bytes: number,
  limit: number | null,
): Promise<StorageReservation> {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new QuotaError("storage amount must be a non-negative integer");
  }
  const res = await tx.execute(sql`
    SELECT allowed, stored::bigint AS stored, reserved::bigint AS reserved
      FROM fn_storage_reserve(${clinicId}::uuid, ${bytes}::bigint, ${limit}::bigint)
  `);
  const row = rowsOf<{ allowed: boolean; stored: string | number; reserved: string | number }>(res)[0];
  if (!row) throw new QuotaError("storage reservation returned no verdict");
  return {
    allowed: row.allowed === true,
    stored: Number(row.stored),
    reserved: Number(row.reserved),
    limit,
  };
}

/** Signed delta on the clinic total — negative when an object goes away. */
export async function addStorageBytes(
  tx: Tx,
  clinicId: string,
  deltaBytes: number,
  deltaObjects: number,
): Promise<number> {
  if (!Number.isInteger(deltaBytes) || !Number.isInteger(deltaObjects)) {
    throw new QuotaError("storage delta must be an integer");
  }
  const res = await tx.execute(
    sql`SELECT fn_storage_add(${clinicId}::uuid, ${deltaBytes}::bigint, ${deltaObjects}::bigint)::bigint AS bytes`,
  );
  return Number(rowsOf<{ bytes: string | number }>(res)[0]?.bytes ?? 0);
}

export interface StorageUsageRow {
  bytes: number;
  objectCount: number;
  source: string;
  measuredAt: Date;
}

export async function getStorageUsage(tx: Tx, clinicId: string): Promise<StorageUsageRow | null> {
  const rows = await tx
    .select({
      bytes: storageUsage.bytes,
      objectCount: storageUsage.objectCount,
      source: storageUsage.source,
      measuredAt: storageUsage.measuredAt,
    })
    .from(storageUsage)
    .where(eq(storageUsage.clinicId, clinicId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Re-base the total from a real measurement (M22). The running delta is an
 * optimisation; the bucket is the truth, and a scan must be able to correct it
 * without anyone editing a counter by hand.
 */
export async function setStorageUsage(
  tx: Tx,
  clinicId: string,
  measured: { bytes: number; objectCount: number; source?: string },
): Promise<void> {
  if (!Number.isInteger(measured.bytes) || measured.bytes < 0) {
    throw new QuotaError("measured bytes must be a non-negative integer");
  }
  if (!Number.isInteger(measured.objectCount) || measured.objectCount < 0) {
    throw new QuotaError("measured object count must be a non-negative integer");
  }
  await tx
    .insert(storageUsage)
    .values({
      clinicId,
      bytes: measured.bytes,
      objectCount: measured.objectCount,
      source: measured.source ?? "bucket-scan",
    })
    .onConflictDoUpdate({
      target: storageUsage.clinicId,
      set: {
        bytes: measured.bytes,
        objectCount: measured.objectCount,
        source: measured.source ?? "bucket-scan",
        measuredAt: sql`now()`,
      },
    });
}
