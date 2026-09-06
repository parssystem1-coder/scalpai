import { and, eq, sql } from "drizzle-orm";
import { canonicalObject } from "@scalpai/shared";
import {
  analyses,
  consents,
  galleryItems,
  patients,
  purgeRequests,
  retentionPolicies,
  sessions,
  treatmentPlans,
} from "../schema.js";
import { appendAudit } from "./core.repo.js";
import { enqueueStorageOrphans } from "./storage-orphans.repo.js";
import type { Tx } from "../tenant.js";

/**
 * Retention and patient purge (WEAKNESSES M21).
 *
 * "Delete the patient" used to mean a soft delete and nothing else: images stayed
 * in MinIO, analyses stayed in Postgres, the ledger kept replaying the row to
 * every device. A real purge needs four things and this module enforces all
 * four:
 *
 *  1. an explicit SCOPE — you say what gets destroyed, not "everything-ish";
 *  2. TWO-PERSON approval — the requester cannot approve their own purge (also a
 *     DB CHECK, so a bug in this file cannot bypass it);
 *  3. a GRACE window — nothing is destroyed the same second it is requested;
 *  4. EVIDENCE — per-table counts and queued object keys land in an audit row.
 *
 * `audit_log` is never in scope. It is the append-only record of what happened,
 * including the purge itself, and it holds no PHI by construction (see the
 * meta guard in phi.ts).
 */

export const PURGE_SCOPES = ["gallery", "analyses", "consents", "plans", "sessions", "ledger", "patient"] as const;
export type PurgeScope = (typeof PURGE_SCOPES)[number];

/** Defaults in days. `null` = never purge automatically. */
export const RETENTION_DEFAULTS: Record<string, number | null> = {
  patient: 3650,
  gallery: 3650,
  analyses: 3650,
  consents: 3650,
  ledger: 180,
  audit_log: null,
};

export const PURGE_GRACE_DAYS_DEFAULT = 7;

export class RetentionError extends Error {
  constructor(message: string) {
    super(`retention: ${message}`);
    this.name = "RetentionError";
  }
}

export function assertPurgeScope(scope: readonly string[]): PurgeScope[] {
  if (scope.length === 0) throw new RetentionError("scope must name at least one entity");
  const unknown = scope.filter((s) => !(PURGE_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0) throw new RetentionError(`unknown purge scope: ${unknown.join(", ")}`);
  if (scope.includes("audit_log" as PurgeScope)) {
    throw new RetentionError("audit_log is append-only and can never be purged");
  }
  // Destroying the patient row while its children survive would leave dangling
  // clinical data — refuse the combination instead of half-doing it.
  if (scope.includes("patient")) {
    const required: PurgeScope[] = ["gallery", "analyses", "consents", "plans", "sessions", "ledger"];
    const missing = required.filter((r) => !scope.includes(r));
    if (missing.length > 0) {
      throw new RetentionError(`purging the patient row requires its children too (missing: ${missing.join(", ")})`);
    }
  }
  return [...new Set(scope)] as PurgeScope[];
}

/* ── policies ──────────────────────────────────────────────────────── */

export async function upsertRetentionPolicy(
  tx: Tx,
  clinicId: string,
  userId: string,
  input: { entity: string; retainDays: number; graceDays?: number },
): Promise<void> {
  if (!Number.isInteger(input.retainDays) || input.retainDays < 0 || input.retainDays > 36_500) {
    throw new RetentionError("retainDays must be an integer between 0 and 36500");
  }
  await tx
    .insert(retentionPolicies)
    .values({
      clinicId,
      entity: input.entity,
      retainDays: input.retainDays,
      graceDays: input.graceDays ?? PURGE_GRACE_DAYS_DEFAULT,
    })
    .onConflictDoUpdate({
      target: [retentionPolicies.clinicId, retentionPolicies.entity],
      set: {
        retainDays: input.retainDays,
        graceDays: input.graceDays ?? PURGE_GRACE_DAYS_DEFAULT,
        updatedAt: sql`now()`,
      },
    });
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "retention.policy_set",
    entity: "retention_policy",
    entityId: input.entity,
    meta: { retainDays: input.retainDays, graceDays: input.graceDays ?? PURGE_GRACE_DAYS_DEFAULT },
  });
}

export async function resolveGraceDays(tx: Tx, clinicId: string): Promise<number> {
  const rows = await tx
    .select({ graceDays: retentionPolicies.graceDays })
    .from(retentionPolicies)
    .where(and(eq(retentionPolicies.clinicId, clinicId), eq(retentionPolicies.entity, "patient")))
    .limit(1);
  return rows[0]?.graceDays ?? PURGE_GRACE_DAYS_DEFAULT;
}

/* ── request → approve → execute ────────────────────────────────────────── */

export interface PurgeRequestInput {
  patientId: string;
  scope: readonly string[];
  reason: string;
}

export async function requestPurge(
  tx: Tx,
  clinicId: string,
  userId: string,
  input: PurgeRequestInput,
): Promise<{ id: string; scope: PurgeScope[] }> {
  const scope = assertPurgeScope(input.scope);
  if (input.reason.trim().length < 8) throw new RetentionError("a purge needs a written reason (min 8 chars)");

  const patient = await tx
    .select({ id: patients.id })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, input.patientId)))
    .limit(1);
  if (!patient[0]) throw new RetentionError("patient not found in this clinic");

  const rows = await tx
    .insert(purgeRequests)
    .values({ clinicId, patientId: input.patientId, scope, reason: input.reason.trim(), requestedBy: userId })
    .returning({ id: purgeRequests.id });
  const id = rows[0]!.id;

  await appendAudit(tx, {
    clinicId,
    userId,
    action: "purge.requested",
    entity: "purge_request",
    entityId: id,
    meta: { patientId: input.patientId, scope },
  });
  return { id, scope };
}

export async function approvePurge(
  tx: Tx,
  clinicId: string,
  approverId: string,
  id: string,
): Promise<{ executableAt: Date }> {
  const rows = await tx
    .select()
    .from(purgeRequests)
    .where(and(eq(purgeRequests.clinicId, clinicId), eq(purgeRequests.id, id)))
    .limit(1);
  const request = rows[0];
  if (!request) throw new RetentionError("purge request not found");
  if (request.state !== "requested") throw new RetentionError(`purge request is already '${request.state}'`);
  if (request.requestedBy === approverId) {
    throw new RetentionError("two-person rule: the requester cannot approve their own purge");
  }

  const graceDays = await resolveGraceDays(tx, clinicId);
  const updated = await tx
    .update(purgeRequests)
    .set({
      state: "approved",
      approvedBy: approverId,
      approvedAt: sql`now()`,
      executableAt: sql`now() + make_interval(days => ${graceDays})`,
    })
    .where(and(eq(purgeRequests.clinicId, clinicId), eq(purgeRequests.id, id), eq(purgeRequests.state, "requested")))
    .returning({ executableAt: purgeRequests.executableAt });
  if (!updated[0]) throw new RetentionError("purge request changed state concurrently");

  await appendAudit(tx, {
    clinicId,
    userId: approverId,
    action: "purge.approved",
    entity: "purge_request",
    entityId: id,
    meta: { graceDays },
  });
  return { executableAt: updated[0].executableAt as Date };
}

export async function rejectPurge(tx: Tx, clinicId: string, userId: string, id: string, reason: string): Promise<void> {
  const updated = await tx
    .update(purgeRequests)
    .set({ state: "rejected" })
    .where(and(eq(purgeRequests.clinicId, clinicId), eq(purgeRequests.id, id), eq(purgeRequests.state, "requested")))
    .returning({ id: purgeRequests.id });
  if (!updated[0]) throw new RetentionError("only a 'requested' purge can be rejected");
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "purge.rejected",
    entity: "purge_request",
    entityId: id,
    meta: { reason: reason.slice(0, 200) },
  });
}

export interface PurgeEvidence {
  purgeRequestId: string;
  patientId: string;
  scope: PurgeScope[];
  deleted: Record<string, number>;
  objectsQueued: number;
  executedAt: string;
}

/**
 * Destroy the data. Runs inside the caller's transaction so the deletes, the
 * orphan queue rows and the audit trail commit together — there is no window
 * where the row is gone but the object is not queued.
 */
export async function executePurge(
  tx: Tx,
  clinicId: string,
  userId: string,
  id: string,
  opts: { ignoreGrace?: boolean } = {},
): Promise<PurgeEvidence> {
  const rows = await tx
    .select()
    .from(purgeRequests)
    .where(and(eq(purgeRequests.clinicId, clinicId), eq(purgeRequests.id, id)))
    .limit(1);
  const request = rows[0];
  if (!request) throw new RetentionError("purge request not found");
  if (request.state !== "approved") throw new RetentionError(`purge request must be approved (is '${request.state}')`);
  if (!opts.ignoreGrace) {
    const executableAt = request.executableAt as Date | null;
    if (executableAt && executableAt.getTime() > Date.now()) {
      throw new RetentionError(`grace window has not elapsed (executable at ${executableAt.toISOString()})`);
    }
  }

  const scope = assertPurgeScope(request.scope as string[]);
  const patientId = request.patientId;
  const deleted: Record<string, number> = {};
  let objectsQueued = 0;

  if (scope.includes("gallery")) {
    const items = await tx
      .select({ id: galleryItems.id, storageKey: galleryItems.storageKey, thumbKey: galleryItems.thumbKey })
      .from(galleryItems)
      .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.patientId, patientId)));
    // Queue the objects BEFORE the rows go away — otherwise the keys are lost.
    objectsQueued += await enqueueStorageOrphans(
      tx,
      clinicId,
      items.flatMap((i) => [i.storageKey, i.thumbKey]),
      "purge",
    );
    const removed = await tx
      .delete(galleryItems)
      .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.patientId, patientId)))
      .returning({ id: galleryItems.id });
    deleted.gallery_items = removed.length;
  }

  if (scope.includes("analyses")) {
    const removed = await tx
      .delete(analyses)
      .where(and(eq(analyses.clinicId, clinicId), eq(analyses.patientId, patientId)))
      .returning({ id: analyses.id, explainMapKey: analyses.explainMapKey });
    objectsQueued += await enqueueStorageOrphans(tx, clinicId, removed.map((r) => r.explainMapKey), "purge");
    deleted.analyses = removed.length;
  }

  if (scope.includes("consents")) {
    const removed = await tx
      .delete(consents)
      .where(and(eq(consents.clinicId, clinicId), eq(consents.patientId, patientId)))
      .returning({ id: consents.id, signatureKey: consents.signatureKey });
    objectsQueued += await enqueueStorageOrphans(tx, clinicId, removed.map((r) => r.signatureKey), "purge");
    deleted.consents = removed.length;
  }

  if (scope.includes("plans")) {
    const removed = await tx
      .delete(treatmentPlans)
      .where(and(eq(treatmentPlans.clinicId, clinicId), eq(treatmentPlans.patientId, patientId)))
      .returning({ id: treatmentPlans.id });
    deleted.treatment_plans = removed.length;
  }

  if (scope.includes("sessions")) {
    const removed = await tx
      .delete(sessions)
      .where(and(eq(sessions.clinicId, clinicId), eq(sessions.patientId, patientId)))
      .returning({ id: sessions.id });
    deleted.sessions = removed.length;
  }

  if (scope.includes("ledger")) {
    // The ledger replays mutations to every device; leaving a purged patient's
    // rows there would resurrect them on the next pull.
    const removed = await tx.execute(sql`
      DELETE FROM mutations
       WHERE clinic_id = ${clinicId}
         AND (payload->>'id' = ${patientId} OR payload->>'patientId' = ${patientId})
      RETURNING id
    `);
    const rowsOut = (removed as unknown as { rows?: unknown[] }).rows ?? (removed as unknown as unknown[]);
    deleted.mutations = rowsOut.length;
  }

  if (scope.includes("patient")) {
    const removed = await tx
      .delete(patients)
      .where(and(eq(patients.clinicId, clinicId), eq(patients.id, patientId)))
      .returning({ id: patients.id });
    deleted.patients = removed.length;
  }

  const evidence: PurgeEvidence = {
    purgeRequestId: id,
    patientId,
    scope,
    deleted,
    objectsQueued,
    executedAt: new Date().toISOString(),
  };

  await tx
    .update(purgeRequests)
    .set({ state: "executed", executedAt: sql`now()`, evidence: canonicalObject(evidence) })
    .where(and(eq(purgeRequests.clinicId, clinicId), eq(purgeRequests.id, id)));

  await appendAudit(tx, {
    clinicId,
    userId,
    action: "purge.executed",
    entity: "purge_request",
    entityId: id,
    // Counts and ids only — never the data that was destroyed.
    meta: { patientId, scope, deleted, objectsQueued },
  });

  return evidence;
}

export async function listPurgeRequests(tx: Tx, clinicId: string, state?: string) {
  const where = state
    ? and(eq(purgeRequests.clinicId, clinicId), eq(purgeRequests.state, state))
    : eq(purgeRequests.clinicId, clinicId);
  return tx
    .select({
      id: purgeRequests.id,
      patientId: purgeRequests.patientId,
      scope: purgeRequests.scope,
      state: purgeRequests.state,
      requestedBy: purgeRequests.requestedBy,
      requestedAt: purgeRequests.requestedAt,
      approvedBy: purgeRequests.approvedBy,
      executableAt: purgeRequests.executableAt,
      executedAt: purgeRequests.executedAt,
    })
    .from(purgeRequests)
    .where(where)
    .orderBy(purgeRequests.requestedAt);
}
