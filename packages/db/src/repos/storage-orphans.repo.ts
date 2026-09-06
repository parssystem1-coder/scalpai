import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { galleryItems, storageOrphans } from "../schema.js";
import { appendAudit } from "./core.repo.js";
import type { Tx } from "../tenant.js";

/**
 * Object-store reconciliation (WEAKNESSES M22).
 *
 * Deleting a row and deleting its object were two independent operations, and a
 * failed object delete was swallowed by `.catch(() => undefined)`. That leaves
 * PHI images alive in the bucket with nothing in the database pointing at them:
 * invisible to the app, invisible to a purge, and still there when someone lists
 * the bucket.
 *
 * The queue makes the second half durable: a key gets enqueued in the SAME
 * transaction that removes its row, a worker claims it, and a delete failure is
 * recorded with its error and retried. After `maxAttempts` it goes to
 * `quarantined` and raises an audit row — loud, not silent.
 */

export const ORPHAN_MAX_ATTEMPTS = 5;

export type OrphanState = "pending" | "claimed" | "deleted" | "quarantined";

export interface OrphanRow {
  id: string;
  storageKey: string;
  reason: string;
  attempts: number;
}

/**
 * Queue object keys for deletion. Idempotent: a key that is already queued (and
 * not yet deleted) keeps its attempt counter instead of starting over.
 */
export async function enqueueStorageOrphans(
  tx: Tx,
  clinicId: string,
  keys: readonly (string | null | undefined)[],
  reason: string,
): Promise<number> {
  const unique = [...new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0))];
  if (unique.length === 0) return 0;

  const inserted = await tx
    .insert(storageOrphans)
    .values(unique.map((storageKey) => ({ clinicId, storageKey, reason })))
    .onConflictDoNothing()
    .returning({ id: storageOrphans.id });
  return inserted.length;
}

/**
 * Claim a batch for a worker. `SKIP LOCKED` keeps two workers from fighting over
 * the same key without either of them blocking.
 */
export async function claimStorageOrphans(tx: Tx, clinicId: string, limit: number): Promise<OrphanRow[]> {
  const rows = await tx.execute(sql`
    WITH picked AS (
      SELECT id FROM storage_orphans
       WHERE clinic_id = ${clinicId}
         AND state = 'pending'
         AND attempts < ${ORPHAN_MAX_ATTEMPTS}
       ORDER BY created_at
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED
    )
    UPDATE storage_orphans o
       SET state = 'claimed', attempts = o.attempts + 1, updated_at = now()
      FROM picked
     WHERE o.id = picked.id
    RETURNING o.id, o.storage_key, o.reason, o.attempts
  `);
  const raw = (rows as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? (rows as unknown as Array<Record<string, unknown>>);
  return raw.map((r) => ({
    id: String(r.id),
    storageKey: String(r.storage_key),
    reason: String(r.reason),
    attempts: Number(r.attempts),
  }));
}

export async function markStorageOrphanDeleted(tx: Tx, clinicId: string, id: string): Promise<void> {
  await tx
    .update(storageOrphans)
    .set({ state: "deleted", resolvedAt: sql`now()`, updatedAt: sql`now()`, lastError: null })
    .where(and(eq(storageOrphans.clinicId, clinicId), eq(storageOrphans.id, id)));
}

/**
 * A failed delete goes BACK to pending with the error attached, or to quarantine
 * once it has burned through its attempts. Either way it is visible.
 */
export async function markStorageOrphanFailed(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  id: string,
  error: string,
): Promise<OrphanState> {
  const current = await tx
    .select({ attempts: storageOrphans.attempts, storageKey: storageOrphans.storageKey })
    .from(storageOrphans)
    .where(and(eq(storageOrphans.clinicId, clinicId), eq(storageOrphans.id, id)))
    .limit(1);
  if (!current[0]) return "deleted";

  const exhausted = current[0].attempts >= ORPHAN_MAX_ATTEMPTS;
  const state: OrphanState = exhausted ? "quarantined" : "pending";
  await tx
    .update(storageOrphans)
    .set({ state, lastError: error.slice(0, 500), updatedAt: sql`now()` })
    .where(and(eq(storageOrphans.clinicId, clinicId), eq(storageOrphans.id, id)));

  if (exhausted) {
    await appendAudit(tx, {
      clinicId,
      userId,
      action: "storage.orphan_quarantined",
      entity: "storage_orphan",
      entityId: id,
      meta: { attempts: current[0].attempts, reason: "delete kept failing" },
    });
  }
  return state;
}

export async function countOpenOrphans(tx: Tx, clinicId: string): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(storageOrphans)
    .where(and(eq(storageOrphans.clinicId, clinicId), ne(storageOrphans.state, "deleted")));
  return rows[0]?.n ?? 0;
}

export interface ReconcileReport {
  /** In the bucket, referenced by nothing — enqueued for deletion. */
  orphanKeys: string[];
  /** Referenced by a live row but absent from the bucket — a data loss signal. */
  missingKeys: string[];
  enqueued: number;
}

/**
 * Compare a bucket listing against the live rows. The listing is passed in so
 * this package keeps no S3 dependency (the API/worker owns the client).
 */
export async function reconcileStorage(
  tx: Tx,
  clinicId: string,
  userId: string | null,
  listedKeys: readonly string[],
): Promise<ReconcileReport> {
  const live = await tx
    .select({ storageKey: galleryItems.storageKey, thumbKey: galleryItems.thumbKey })
    .from(galleryItems)
    .where(and(eq(galleryItems.clinicId, clinicId), isNull(galleryItems.deletedAt)));

  const referenced = new Set<string>();
  for (const row of live) {
    if (row.storageKey) referenced.add(row.storageKey);
    if (row.thumbKey) referenced.add(row.thumbKey);
  }

  const listed = new Set(listedKeys);
  const orphanKeys = [...listed].filter((k) => !referenced.has(k)).sort();
  const missingKeys = [...referenced].filter((k) => !listed.has(k)).sort();

  const enqueued = await enqueueStorageOrphans(tx, clinicId, orphanKeys, "reconciliation");

  if (orphanKeys.length > 0 || missingKeys.length > 0) {
    await appendAudit(tx, {
      clinicId,
      userId,
      action: "storage.reconciled",
      entity: "storage",
      entityId: null,
      // Counts only — an object key names a patient's clinic prefix, so the keys
      // themselves stay out of the audit row.
      meta: { listed: listed.size, referenced: referenced.size, orphans: orphanKeys.length, missing: missingKeys.length },
    });
  }

  return { orphanKeys, missingKeys, enqueued };
}

/** Keys still queued for a set of ids — used by the purge evidence report. */
export async function listOrphansByIds(tx: Tx, clinicId: string, ids: readonly string[]): Promise<OrphanRow[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({
      id: storageOrphans.id,
      storageKey: storageOrphans.storageKey,
      reason: storageOrphans.reason,
      attempts: storageOrphans.attempts,
    })
    .from(storageOrphans)
    .where(and(eq(storageOrphans.clinicId, clinicId), inArray(storageOrphans.id, ids as string[])))
    .orderBy(asc(storageOrphans.createdAt));
  return rows;
}
