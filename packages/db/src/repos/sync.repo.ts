import { and, eq, gt, inArray } from "drizzle-orm";
import { mergeFieldLww, isSchemaVersionSupported, type MutationEnvelope, type PushItemResult } from "@scalpai/sync-client";
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

/** §6.5: a single mutation applied against a live server row. */
interface PushCtx {
  tx: Tx;
  clinicId: string;
  userId: string;
}

/* ── Safe patch whitelist (prevents payload from touching clinic_id, id, etc.) */

/**
 * Phase 6 (C2/H3): `notesEncrypted` stays patchable because it is CIPHERTEXT —
 * a device that can read a note already holds the plaintext, and the server
 * never sees it. Readable note fields are not on the list at all, and a mutation
 * that carries one is REJECTED rather than silently stripped: a client that
 * tries is broken, and the operator should find out.
 */
const SAFE_PATIENT_FIELDS = new Set(["firstName", "lastName", "phone", "gender", "birthDate", "notesEncrypted", "tags"]);
const SAFE_PLAN_FIELDS = new Set(["items", "startDate", "reviewIntervals"]);

/** Keys that must never appear in a mutation payload (mirrors the 0012 CHECK). */
function findForbiddenPhi(payload: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (key === "notesEncrypted") {
      if (value !== null && !isPhiCiphertext(value)) return key;
      continue;
    }
    if (isSensitiveKey(key) && !isPhiCiphertext(value)) return key;
  }
  return null;
}

/* ── Per-entity apply ────────────────────────────────────────────────────── */

async function applyPatientCreate(ctx: PushCtx, env: MutationEnvelope): Promise<PushItemResult> {
  const row = await ctx.tx
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
    .returning({ id: patients.id });
  await appendAudit(ctx.tx, { clinicId: ctx.clinicId, userId: ctx.userId, action: "sync.patients.create", entity: "patient", entityId: row[0]!.id });
  return { clientMutationId: env.clientMutationId, status: "applied" };
}

async function applyPatientUpdate(ctx: PushCtx, env: MutationEnvelope): Promise<PushItemResult> {
  const id = env.payload.id as string | undefined;
  if (!id) return { clientMutationId: env.clientMutationId, status: "rejected", reason: "missing payload.id" };

  const live = await ctx.tx.select().from(patients).where(and(eq(patients.clinicId, ctx.clinicId), eq(patients.id, id))).limit(1);
  if (!live[0]) return { clientMutationId: env.clientMutationId, status: "rejected", reason: "patient not found" };

  const merge = mergeFieldLww(
    { ...live[0]!, updatedAt: (live[0]!.updatedAt as unknown as Date).toISOString() },
    env as unknown as MutationEnvelope<Record<string, unknown>>,
  );
  if (merge.action === "rejected-stale-base") {
    return { clientMutationId: env.clientMutationId, status: "rejected", reason: "stale baseVersion" };
  }

  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merge.fields)) {
    if (!SAFE_PATIENT_FIELDS.has(k)) continue;
    // Belt and braces: the DB CHECK would reject the ledger row anyway.
    if (k === "notesEncrypted" && v !== null && !isPhiCiphertext(v)) {
      return { clientMutationId: env.clientMutationId, status: "rejected", reason: "notesEncrypted must be a phi.v1 ciphertext" };
    }
    fields[k] = v;
  }
  if (Object.keys(fields).length === 0) return { clientMutationId: env.clientMutationId, status: "applied" };
  await ctx.tx.update(patients).set(fields).where(and(eq(patients.clinicId, ctx.clinicId), eq(patients.id, id)));
  await appendAudit(ctx.tx, { clinicId: ctx.clinicId, userId: ctx.userId, action: "sync.patients.update", entity: "patient", entityId: id, meta: { fields: Object.keys(fields).sort() } });
  return { clientMutationId: env.clientMutationId, status: "applied" };
}

async function applyPlanCreate(ctx: PushCtx, env: MutationEnvelope): Promise<PushItemResult> {
  const patientId = env.payload.patientId as string | undefined;
  if (!patientId) return { clientMutationId: env.clientMutationId, status: "rejected", reason: "missing patientId" };
  const row = await ctx.tx
    .insert(treatmentPlans)
    .values({
      clinicId: ctx.clinicId,
      patientId,
      items: (env.payload.items as object[]) ?? [],
      startDate: (env.payload.startDate as string) ?? null,
      reviewIntervals: env.payload.reviewIntervals ?? null,
    })
    .returning({ id: treatmentPlans.id });
  await appendAudit(ctx.tx, { clinicId: ctx.clinicId, userId: ctx.userId, action: "sync.treatment_plans.create", entity: "treatment_plan", entityId: row[0]!.id });
  return { clientMutationId: env.clientMutationId, status: "applied" };
}

async function applyPlanUpdate(ctx: PushCtx, env: MutationEnvelope): Promise<PushItemResult> {
  const id = env.payload.id as string | undefined;
  if (!id) return { clientMutationId: env.clientMutationId, status: "rejected", reason: "missing payload.id" };
  const live = await ctx.tx.select().from(treatmentPlans).where(and(eq(treatmentPlans.clinicId, ctx.clinicId), eq(treatmentPlans.id, id))).limit(1);
  if (!live[0]) return { clientMutationId: env.clientMutationId, status: "rejected", reason: "treatment_plan not found" };

  const merge = mergeFieldLww(
    { ...live[0]!, updatedAt: (live[0]!.updatedAt as unknown as Date).toISOString() },
    env as unknown as MutationEnvelope<Record<string, unknown>>,
  );
  if (merge.action === "rejected-stale-base") {
    return { clientMutationId: env.clientMutationId, status: "rejected", reason: "stale baseVersion" };
  }
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(merge.fields)) {
    if (SAFE_PLAN_FIELDS.has(k)) fields[k] = v;
  }
  if (Object.keys(fields).length === 0) return { clientMutationId: env.clientMutationId, status: "applied" };
  await ctx.tx.update(treatmentPlans).set(fields).where(and(eq(treatmentPlans.clinicId, ctx.clinicId), eq(treatmentPlans.id, id)));
  return { clientMutationId: env.clientMutationId, status: "applied" };
}

async function applyAnalysisCreate(ctx: PushCtx, env: MutationEnvelope): Promise<PushItemResult> {
  const patientId = env.payload.patientId as string | undefined;
  if (!patientId) return { clientMutationId: env.clientMutationId, status: "rejected", reason: "missing patientId" };
  await ctx.tx.insert(analyses).values({
    clinicId: ctx.clinicId,
    patientId,
    galleryItemId: (env.payload.galleryItemId as string) ?? "00000000-0000-0000-0000-000000000000",
    type: (env.payload.type as string) ?? "heuristic",
    result: (env.payload.result as object) ?? {},
    modelVersion: (env.payload.modelVersion as string) ?? "unknown",
    createdBy: ctx.userId,
  });
  return { clientMutationId: env.clientMutationId, status: "applied" };
}

async function applyEntity(ctx: PushCtx, env: MutationEnvelope): Promise<PushItemResult> {
  if (env.entity === "patients" && env.op === "create") return applyPatientCreate(ctx, env);
  if (env.entity === "patients" && env.op === "update") return applyPatientUpdate(ctx, env);
  if (env.entity === "treatment_plans" && env.op === "create") return applyPlanCreate(ctx, env);
  if (env.entity === "treatment_plans" && env.op === "update") return applyPlanUpdate(ctx, env);
  if (env.entity === "analyses" && env.op === "create") return applyAnalysisCreate(ctx, env);
  return { clientMutationId: env.clientMutationId, status: "rejected", reason: "unsupported entity/op" };
}

/* ── Public API ──────────────────────────────────────────────────────────── */

/**
 * §8 push: apply a batch of client mutations. Each item is independent —
 * one failure doesn't abort the rest. Deduped by clientMutationId.
 *
 * Phase 6 (H3): the LEDGER row is not the client payload any more. It is the
 * redacted delta — field names, ids and ciphertext. The ledger is replayed to
 * every other device on pull, so anything readable stored here is a broadcast.
 */
export async function processPushBatch(
  ctx: PushCtx,
  envelopes: MutationEnvelope[],
): Promise<PushItemResult[]> {
  const ids = envelopes.map((e) => e.clientMutationId);
  const existing = await ctx.tx
    .select({ clientMutationId: mutations.clientMutationId })
    .from(mutations)
    .where(and(eq(mutations.clinicId, ctx.clinicId), inArray(mutations.clientMutationId, ids)));
  const seen = new Set(existing.map((r) => r.clientMutationId));

  const results: PushItemResult[] = [];
  for (const env of envelopes) {
    if (seen.has(env.clientMutationId)) {
      results.push({ clientMutationId: env.clientMutationId, status: "duplicate" });
      continue;
    }
    if (!isSchemaVersionSupported(env.schemaVersion)) {
      results.push({ clientMutationId: env.clientMutationId, status: "rejected", reason: `unsupported schemaVersion ${env.schemaVersion}` });
      continue;
    }
    const forbidden = findForbiddenPhi(env.payload);
    if (forbidden) {
      results.push({
        clientMutationId: env.clientMutationId,
        status: "rejected",
        reason: `field '${forbidden}' carries plaintext PHI — encrypt it before syncing`,
      });
      continue;
    }

    const res = await applyEntity(ctx, env);
    await ctx.tx.insert(mutations).values({
      clinicId: ctx.clinicId,
      userId: ctx.userId,
      clientMutationId: env.clientMutationId,
      entity: env.entity,
      op: env.op,
      payload: canonicalObject<object>({
        ...redactPhiPayload(env.payload),
        // Peers need to know WHICH fields changed even when a value was dropped.
        _fields: payloadFieldNames(env.payload),
      }),
    });
    results.push(res);
  }
  return results;
}

/** §8 pull: return the mutation ledger since a given sequence number. */
export async function pullSince(
  tx: Tx,
  clinicId: string,
  sinceSeq: number,
  limit: number,
): Promise<{ items: Array<{ id: number; entity: string; op: string; payload: unknown; serverSeq: number; at: Date }>; nextSeq: number }> {
  const items = await tx
    .select({ id: mutations.id, entity: mutations.entity, op: mutations.op, payload: mutations.payload, serverSeq: mutations.serverSeq, at: mutations.at })
    .from(mutations)
    .where(and(eq(mutations.clinicId, clinicId), gt(mutations.serverSeq, sinceSeq)))
    .orderBy(mutations.serverSeq)
    .limit(limit);
  const nextSeq = items.length > 0 ? items[items.length - 1]!.serverSeq : sinceSeq;
  return { items, nextSeq };
}
