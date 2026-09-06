import { and, eq, inArray, sql } from "drizzle-orm";
import {
  decodeCursor,
  encodeCursor,
  isSchemaVersionSupported,
  mergeFieldLww,
  type MutationEnvelope,
  type PushItemResult,
  type ServerRow,
} from "@scalpai/sync-client";
import {
  canonicalObject,
  isPhiCiphertext,
  isSensitiveKey,
  payloadFieldNames,
  redactPhiPayload,
} from "@scalpai/shared";
import { analyses, mutations, patients, treatmentPlans } from "../schema.js";
import { appendAudit } from "./core.repo.js";
import type { Tx } from "../tenant.js";

interface PushCtx {
  tx: Tx;
  clinicId: string;
  userId: string;
}

const SAFE_PATIENT_FIELDS = new Set(["firstName", "lastName", "phone", "gender", "birthDate", "notesEncrypted", "tags"]);
const SAFE_PLAN_FIELDS = new Set(["items", "startDate", "reviewIntervals"]);
const PATIENT_CREATE_FIELDS = ["firstName", "lastName", "phone", "gender", "birthDate"] as const;

/** Maximum rows a single pull page may return. */
export const PULL_LIMIT_MAX = 500;

/**
 * A refusal the client must fix (unknown entity, missing base version, PHI in
 * cleartext). Thrown inside the item's savepoint so nothing it touched survives,
 * and reported per item instead of failing the batch (WEAKNESSES H4).
 */
class MutationRejected extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = "MutationRejected";
  }
}

export class SyncCursorError extends Error {
  constructor(cursor: unknown) {
    const raw = typeof cursor === "string" ? cursor : Array.isArray(cursor) ? String(cursor[0] ?? "") : String(cursor ?? "");
    super(`sync cursor '${raw.slice(0, 40)}' is malformed`);
    this.name = "SyncCursorError";
  }
}

/** What the server actually wrote — the ledger broadcasts THIS, not the request. */
interface ApplyOutcome {
  delta: Record<string, unknown>;
  entityId: string | null;
  rowVersion: number | null;
  conflicts: string[];
}

/** Names that are unsafe to replay as readable values. Names/phone are required
 * to create the patient and are therefore accepted at apply time, but they never
 * survive into the persisted pull ledger (redactPhiPayload does that). */
function findForbiddenPhi(payload: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (key === "notesEncrypted") {
      if (value !== null && !isPhiCiphertext(value)) return key;
      continue;
    }
    if (isSensitiveKey(key) && !["firstName", "lastName", "phone", "birthDate"].includes(key)) {
      if (!isPhiCiphertext(value)) return key;
    }
  }
  return null;
}

/**
 * `field_versions` is keyed by COLUMN name (`first_name`); a mutation patch is
 * keyed by field name (`firstName`). The mapping is read from the drizzle table
 * itself, so a renamed column can never silently stop matching.
 */
function camelFieldVersions(table: unknown, raw: unknown): Record<string, number> {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const byDbName = new Map<string, string>();
  if (table && typeof table === "object") {
    for (const [prop, column] of Object.entries(table as Record<string, unknown>)) {
      const name = column && typeof column === "object" ? (column as { name?: unknown }).name : undefined;
      if (typeof name === "string") byDbName.set(name, prop);
    }
  }
  const out: Record<string, number> = {};
  for (const [dbName, value] of Object.entries(source)) {
    const key = byDbName.get(dbName) ?? dbName;
    const version = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(version)) out[key] = version;
  }
  return out;
}

function rejectionReason(reason: "missing-base-version" | "unknown-base-version"): string {
  return reason === "missing-base-version"
    ? "baseVersion is required for an update (H6)"
    : "baseVersion is ahead of the server row version";
}

async function applyPatientCreate(ctx: PushCtx, env: MutationEnvelope): Promise<ApplyOutcome> {
  const rows = await ctx.tx
    .insert(patients)
    .values({
      clinicId: ctx.clinicId,
      firstName: String(env.payload.firstName ?? ""),
      lastName: String(env.payload.lastName ?? ""),
      phone: String(env.payload.phone ?? ""),
      gender: (env.payload.gender as string) ?? null,
      birthDate: (env.payload.birthDate as string) ?? null,
      createdBy: ctx.userId,
    })
    .returning({ id: patients.id, rowVersion: patients.rowVersion });
  const created = rows[0];
  if (!created) throw new MutationRejected("patient insert returned no row");
  await appendAudit(ctx.tx, {
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "sync.patients.create",
    entity: "patient",
    entityId: created.id,
  });
  const delta: Record<string, unknown> = {};
  for (const key of PATIENT_CREATE_FIELDS) {
    if (key in env.payload) delta[key] = env.payload[key];
  }
  return { delta, entityId: created.id, rowVersion: created.rowVersion, conflicts: [] };
}

async function applyPatientUpdate(ctx: PushCtx, env: MutationEnvelope): Promise<ApplyOutcome> {
  const id = typeof env.payload.id === "string" ? env.payload.id : null;
  if (!id) throw new MutationRejected("missing payload.id");
  const live = await ctx.tx
    .select({ id: patients.id, rowVersion: patients.rowVersion, fieldVersions: patients.fieldVersions })
    .from(patients)
    .where(and(eq(patients.clinicId, ctx.clinicId), eq(patients.id, id)))
    .limit(1);
  const current = live[0];
  if (!current) throw new MutationRejected("patient not found");

  const serverRow: ServerRow = {
    rowVersion: current.rowVersion,
    fieldVersions: camelFieldVersions(patients, current.fieldVersions),
  };
  const merge = mergeFieldLww(serverRow, env);
  if (merge.action === "rejected") throw new MutationRejected(rejectionReason(merge.reason));

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merge.fields)) {
    if (!SAFE_PATIENT_FIELDS.has(key)) continue;
    if (key === "notesEncrypted" && value !== null && !isPhiCiphertext(value)) {
      throw new MutationRejected("notesEncrypted must be a phi.v1 ciphertext");
    }
    fields[key] = value;
  }
  if (Object.keys(fields).length === 0) {
    // Everything the client sent is server-owned: applied, nothing written.
    return { delta: {}, entityId: id, rowVersion: current.rowVersion, conflicts: merge.conflicts };
  }

  const updated = await ctx.tx
    .update(patients)
    .set(fields)
    .where(and(eq(patients.clinicId, ctx.clinicId), eq(patients.id, id)))
    .returning({ rowVersion: patients.rowVersion });
  const rowVersion = updated[0]?.rowVersion ?? null;
  await appendAudit(ctx.tx, {
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "sync.patients.update",
    entity: "patient",
    entityId: id,
    meta: {
      fields: Object.keys(fields).sort(),
      conflicts: merge.conflicts,
      baseVersion: env.baseVersion ?? null,
      rowVersion,
    },
  });
  return { delta: { id, ...fields }, entityId: id, rowVersion, conflicts: merge.conflicts };
}

async function applyPlanCreate(ctx: PushCtx, env: MutationEnvelope): Promise<ApplyOutcome> {
  const patientId = typeof env.payload.patientId === "string" ? env.payload.patientId : null;
  if (!patientId) throw new MutationRejected("missing patientId");
  const rows = await ctx.tx
    .insert(treatmentPlans)
    .values({
      clinicId: ctx.clinicId,
      patientId,
      items: (env.payload.items as object[]) ?? [],
      startDate: (env.payload.startDate as string) ?? null,
      reviewIntervals: env.payload.reviewIntervals ?? null,
    })
    .returning({ id: treatmentPlans.id, rowVersion: treatmentPlans.rowVersion });
  const created = rows[0];
  if (!created) throw new MutationRejected("treatment_plan insert returned no row");
  await appendAudit(ctx.tx, {
    clinicId: ctx.clinicId,
    userId: ctx.userId,
    action: "sync.treatment_plans.create",
    entity: "treatment_plan",
    entityId: created.id,
  });
  return {
    delta: { patientId, startDate: env.payload.startDate ?? null },
    entityId: created.id,
    rowVersion: created.rowVersion,
    conflicts: [],
  };
}

async function applyPlanUpdate(ctx: PushCtx, env: MutationEnvelope): Promise<ApplyOutcome> {
  const id = typeof env.payload.id === "string" ? env.payload.id : null;
  if (!id) throw new MutationRejected("missing payload.id");
  const live = await ctx.tx
    .select({ id: treatmentPlans.id, rowVersion: treatmentPlans.rowVersion, fieldVersions: treatmentPlans.fieldVersions })
    .from(treatmentPlans)
    .where(and(eq(treatmentPlans.clinicId, ctx.clinicId), eq(treatmentPlans.id, id)))
    .limit(1);
  const current = live[0];
  if (!current) throw new MutationRejected("treatment_plan not found");

  const serverRow: ServerRow = {
    rowVersion: current.rowVersion,
    fieldVersions: camelFieldVersions(treatmentPlans, current.fieldVersions),
  };
  const merge = mergeFieldLww(serverRow, env);
  if (merge.action === "rejected") throw new MutationRejected(rejectionReason(merge.reason));

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merge.fields)) {
    if (SAFE_PLAN_FIELDS.has(key)) fields[key] = value;
  }
  if (Object.keys(fields).length === 0) {
    return { delta: {}, entityId: id, rowVersion: current.rowVersion, conflicts: merge.conflicts };
  }
  const updated = await ctx.tx
    .update(treatmentPlans)
    .set(fields)
    .where(and(eq(treatmentPlans.clinicId, ctx.clinicId), eq(treatmentPlans.id, id)))
    .returning({ rowVersion: treatmentPlans.rowVersion });
  return {
    delta: { id, ...fields },
    entityId: id,
    rowVersion: updated[0]?.rowVersion ?? null,
    conflicts: merge.conflicts,
  };
}

async function applyAnalysisCreate(ctx: PushCtx, env: MutationEnvelope): Promise<ApplyOutcome> {
  const patientId = typeof env.payload.patientId === "string" ? env.payload.patientId : null;
  if (!patientId) throw new MutationRejected("missing patientId");
  const rows = await ctx.tx
    .insert(analyses)
    .values({
      clinicId: ctx.clinicId,
      patientId,
      galleryItemId: (env.payload.galleryItemId as string) ?? "00000000-0000-0000-0000-000000000000",
      type: (env.payload.type as string) ?? "heuristic",
      result: (env.payload.result as object) ?? {},
      modelVersion: (env.payload.modelVersion as string) ?? "unknown",
      createdBy: ctx.userId,
    })
    .returning({ id: analyses.id });
  const created = rows[0];
  if (!created) throw new MutationRejected("analysis insert returned no row");
  return {
    delta: {
      patientId,
      galleryItemId: env.payload.galleryItemId ?? null,
      type: env.payload.type ?? "heuristic",
      modelVersion: env.payload.modelVersion ?? "unknown",
    },
    entityId: created.id,
    rowVersion: null,
    conflicts: [],
  };
}

async function applyEntity(ctx: PushCtx, env: MutationEnvelope): Promise<ApplyOutcome> {
  if (env.entity === "patients" && env.op === "create") return applyPatientCreate(ctx, env);
  if (env.entity === "patients" && env.op === "update") return applyPatientUpdate(ctx, env);
  if (env.entity === "treatment_plans" && env.op === "create") return applyPlanCreate(ctx, env);
  if (env.entity === "treatment_plans" && env.op === "update") return applyPlanUpdate(ctx, env);
  if (env.entity === "analyses" && env.op === "create") return applyAnalysisCreate(ctx, env);
  throw new MutationRejected("unsupported entity/op");
}

type Isolated<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * WEAKNESSES H4: one mutation, one savepoint. A failing item is rolled back to
 * its own savepoint and the batch keeps going, instead of poisoning the whole
 * transaction (which used to mean 19 valid mutations lost because of item 20).
 */
async function runIsolated<T>(tx: Tx, label: string, fn: () => Promise<T>): Promise<Isolated<T>> {
  const name = `sp_${label.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  await tx.execute(sql.raw(`SAVEPOINT ${name}`));
  try {
    const value = await fn();
    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${name}`));
    return { ok: true, value };
  } catch (error) {
    await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${name}`));
    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${name}`));
    return { ok: false, error };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * Never echo the driver message: a CHECK/unique violation quotes the offending
 * ROW, which for `patients` is PHI. The sqlstate is enough to debug.
 */
function databaseReason(error: unknown): string {
  const code =
    typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "unknown") : "unknown";
  return `database refused the mutation (sqlstate ${code})`;
}

function ledgerPayload(applied: ApplyOutcome): object {
  const base: Record<string, unknown> = {
    ...redactPhiPayload(applied.delta),
    _fields: payloadFieldNames(applied.delta),
    _id: applied.entityId,
    _version: applied.rowVersion,
  };
  if (applied.conflicts.length > 0) base._conflicts = applied.conflicts;
  return canonicalObject<object>(base);
}

function rejected(clientMutationId: string, reason: string): PushItemResult {
  return { clientMutationId, status: "rejected", reason };
}

export async function processPushBatch(ctx: PushCtx, envelopes: MutationEnvelope[]): Promise<PushItemResult[]> {
  const ids = envelopes.map((e) => e.clientMutationId);
  const existing =
    ids.length > 0
      ? await ctx.tx
          .select({ clientMutationId: mutations.clientMutationId })
          .from(mutations)
          .where(and(eq(mutations.clinicId, ctx.clinicId), inArray(mutations.clientMutationId, ids)))
      : [];
  const seen = new Set(existing.map((r) => r.clientMutationId));
  const results: PushItemResult[] = [];

  for (let index = 0; index < envelopes.length; index++) {
    const env = envelopes[index]!;
    const id = env.clientMutationId;

    if (seen.has(id)) {
      results.push({ clientMutationId: id, status: "duplicate" });
      continue;
    }
    if (!isSchemaVersionSupported(env.schemaVersion)) {
      results.push(rejected(id, `unsupported schemaVersion ${env.schemaVersion}`));
      continue;
    }
    const forbidden = findForbiddenPhi(env.payload);
    if (forbidden) {
      results.push(rejected(id, `field '${forbidden}' carries plaintext PHI — encrypt it before syncing`));
      continue;
    }

    const outcome = await runIsolated(ctx.tx, `sync_${index}`, async () => {
      const applied = await applyEntity(ctx, env);
      // H3: the ledger row is written only for an APPLIED mutation, and it carries
      // the delta the server wrote — never the client's raw wish list.
      await ctx.tx.insert(mutations).values({
        clinicId: ctx.clinicId,
        userId: ctx.userId,
        clientMutationId: id,
        entity: env.entity,
        op: env.op,
        payload: ledgerPayload(applied),
        // The column default does the same thing; stating it keeps the commit
        // watermark explicit at the only place that writes the ledger (H5).
        commitXid: sql`pg_current_xact_id()`,
      });
      return applied;
    });

    if (outcome.ok) {
      seen.add(id);
      const result: PushItemResult = { clientMutationId: id, status: "applied" };
      if (outcome.value.conflicts.length > 0) result.conflicts = outcome.value.conflicts;
      if (outcome.value.rowVersion !== null) result.rowVersion = outcome.value.rowVersion;
      results.push(result);
      continue;
    }
    if (outcome.error instanceof MutationRejected) {
      results.push(rejected(id, outcome.error.reason));
      continue;
    }
    if (isUniqueViolation(outcome.error)) {
      // A concurrent push of the same id won the race — that IS the dedupe.
      results.push({ clientMutationId: id, status: "duplicate" });
      continue;
    }
    results.push(rejected(id, databaseReason(outcome.error)));
  }

  return results;
}

export interface SyncPullItem {
  entity: string;
  op: string;
  payload: unknown;
  serverSeq: number;
  at: string;
  /** Cursor to resume AFTER this item. */
  cursor: string;
}

export interface SyncPullPage {
  items: SyncPullItem[];
  cursor: string;
  hasMore: boolean;
}

interface RawMutationRow {
  entity: unknown;
  op: unknown;
  payload: unknown;
  server_seq: unknown;
  at: unknown;
  commit_xid: unknown;
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

/**
 * Cursor-based pull with COMMIT-SAFE ordering (WEAKNESSES H5).
 *
 * `commit_xid < pg_snapshot_xmin(pg_current_snapshot())` is the whole trick: rows
 * are only served once no still-running transaction could insert a row that would
 * sort BEFORE them. Combined with the (commit_xid, server_seq) cursor, a client
 * can never skip a mutation because a writer was slow to commit.
 */
export async function pullMutations(
  tx: Tx,
  clinicId: string,
  cursorValue: string,
  limit: number,
): Promise<SyncPullPage> {
  // A non-string cursor is parameter tampering (array/object query params), not a
  // decodable cursor: refuse it before it ever reaches decodeCursor.
  if (typeof cursorValue !== "string") throw new SyncCursorError(cursorValue);
  const cursor = decodeCursor(cursorValue);
  if (!cursor) throw new SyncCursorError(cursorValue);
  const size = Math.min(Math.max(1, Math.trunc(limit) || 1), PULL_LIMIT_MAX);

  const result = await tx.execute(sql`
    SELECT m.entity, m.op, m.payload, m.server_seq, m.at, m.commit_xid::text AS commit_xid
      FROM mutations m
     WHERE m.clinic_id = ${clinicId}
       AND m.commit_xid < pg_snapshot_xmin(pg_current_snapshot())
       AND (m.commit_xid > ${cursor.xid}::xid8
            OR (m.commit_xid = ${cursor.xid}::xid8 AND m.server_seq > ${cursor.seq}))
     ORDER BY m.commit_xid ASC, m.server_seq ASC
     LIMIT ${size + 1}
  `);

  const rows = ((result as unknown as { rows?: unknown[] }).rows ?? []) as RawMutationRow[];
  const hasMore = rows.length > size;
  const page = hasMore ? rows.slice(0, size) : rows;
  const items: SyncPullItem[] = page.map((row) => ({
    entity: String(row.entity),
    op: String(row.op),
    payload: row.payload,
    serverSeq: Number(row.server_seq),
    at: toIso(row.at),
    cursor: encodeCursor({ xid: String(row.commit_xid), seq: Number(row.server_seq) }),
  }));
  const last = items[items.length - 1];
  return { items, cursor: last ? last.cursor : encodeCursor(cursor), hasMore };
}
