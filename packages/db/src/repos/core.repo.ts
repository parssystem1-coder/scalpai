import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auditLog, consents, patients, sessions } from "../schema.js";
import { incrementUsage } from "./users.repo.js";
import type { Tx } from "../tenant.js";

/**
 * Append-only audit (engineering-rules §13 / DESIGN §13). Runs INSIDE the tenant
 * transaction so the audit row commits atomically with the mutation it records.
 * Chain integrity: row_hash = sha256(prev_hash || canonical payload). The app
 * role has UPDATE/DELETE revoked on audit_log at the SQL level — history is immutable.
 *
 * Chain semantics (WEAKNESSES W21): the chain is PER-CLINIC by construction.
 * Phase 2 (M12) makes that explicit instead of implicit: the prev-hash lookup
 * and the verification pass both filter on clinic_id, so a missing RLS key can
 * never silently link two clinics' rows together.
 */
export async function appendAudit(
  tx: Tx,
  entry: {
    clinicId: string;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    meta?: unknown;
  },
): Promise<void> {
  // W06: serialize same-clinic appends — two concurrent txns must never read
  // the same prev_hash (that would fork the chain). Keyed per clinic, so
  // different clinics keep writing in parallel. Released at COMMIT/ROLLBACK.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${entry.clinicId}))`);

  const prev = await tx
    .select({ rowHash: auditLog.rowHash })
    .from(auditLog)
    .where(eq(auditLog.clinicId, entry.clinicId))
    .orderBy(desc(auditLog.id))
    .limit(1);
  const at = new Date();
  const atIso = at.toISOString();
  const prevHash = prev[0]?.rowHash ?? null;
  const payload = JSON.stringify({
    clinicId: entry.clinicId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    meta: entry.meta ?? null,
    at: atIso,
  });
  const rowHash = createHash("sha256").update(`${prevHash ?? ""}|${payload}`).digest("hex");
  await tx.insert(auditLog).values({
    clinicId: entry.clinicId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    meta: (entry.meta as object) ?? null,
    at,
    prevHash,
    rowHash,
  });
}

/**
 * Verify the chain in id order. Pass the clinic id to state the scope
 * explicitly (M12); without it the caller's RLS context defines the rows.
 */
export async function verifyChain(tx: Tx, clinicId?: string): Promise<boolean> {
  const rows = clinicId
    ? await tx.select().from(auditLog).where(eq(auditLog.clinicId, clinicId)).orderBy(auditLog.id)
    : await tx.select().from(auditLog).orderBy(auditLog.id);
  let prev: string | null = null;
  for (const r of rows) {
    const payload = JSON.stringify({
      clinicId: r.clinicId,
      userId: r.userId,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      meta: r.meta ?? null,
      at: r.at instanceof Date ? r.at.toISOString() : String(r.at),
    });
    const expected: string = createHash("sha256").update(`${prev ?? ""}|${payload}`).digest("hex");
    if (r.prevHash !== prev || r.rowHash !== expected) return false;
    prev = r.rowHash;
  }
  return true;
}

// ---------------- Patients ----------------

export async function listPatients(
  tx: Tx,
  clinicId: string,
  q: { search?: string; limit: number; offset: number },
) {
  const like = q.search ? `%${q.search}%` : null;
  const scope = and(eq(patients.clinicId, clinicId), isNull(patients.deletedAt));
  return tx
    .select({
      id: patients.id,
      firstName: patients.firstName,
      lastName: patients.lastName,
      phone: patients.phone,
      createdAt: patients.createdAt,
    })
    .from(patients)
    .where(
      q.search && like
        ? and(scope, sql`(${patients.firstName} ILIKE ${like} OR ${patients.lastName} ILIKE ${like} OR ${patients.phone} ILIKE ${like})`)
        : scope,
    )
    .orderBy(desc(patients.createdAt))
    .limit(q.limit)
    .offset(q.offset);
}

export async function getPatientById(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, id), isNull(patients.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Test/admin view incl. soft-deleted rows (updated_at trigger proof, W07). */
export async function getPatientIncludingDeleted(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select()
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export interface PatientCreateInput {
  firstName: string;
  lastName: string;
  phone: string;
  gender?: string | null;
  birthDate?: string | null;
}

export async function createPatient(tx: Tx, clinicId: string, userId: string, input: PatientCreateInput) {
  const rows = await tx
    .insert(patients)
    .values({
      clinicId,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      gender: input.gender ?? null,
      birthDate: input.birthDate ?? null,
      createdBy: userId,
    })
    .returning();
  const patient = rows[0]!;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "patient.create",
    entity: "patient",
    entityId: patient.id,
    meta: null,
  });
  return patient;
}

export async function softDeletePatient(tx: Tx, clinicId: string, userId: string, id: string): Promise<boolean> {
  const rows = await tx
    .update(patients)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, id), isNull(patients.deletedAt)))
    .returning({ id: patients.id });
  if (!rows[0]) return false;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "patient.delete",
    entity: "patient",
    entityId: id,
  });
  return true;
}

// ---------------- Sessions ----------------

export async function listSessions(tx: Tx, clinicId: string, limit: number, offset: number) {
  return tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.clinicId, clinicId), isNull(sessions.deletedAt)))
    .orderBy(desc(sessions.startAt))
    .limit(limit)
    .offset(offset);
}

export async function createSession(
  tx: Tx,
  input: { clinicId: string; userId: string; patientId: string; serviceId: string; startAt: Date },
) {
  const rows = await tx
    .insert(sessions)
    .values({
      clinicId: input.clinicId,
      patientId: input.patientId,
      staffId: input.userId,
      serviceId: input.serviceId,
      startAt: input.startAt,
    })
    .returning();
  const created = rows[0]!;
  await appendAudit(tx, {
    clinicId: input.clinicId,
    userId: input.userId,
    action: "session.create",
    entity: "session",
    entityId: created.id,
  });
  // §9.1 metering: inline in the same tx until BullMQ workers take over (phase 5).
  await incrementUsage(tx, input.clinicId, "monthly_sessions");
  return created;
}

// ---------------- Consents ----------------

export interface CreateConsentInput {
  clinicId: string;
  userId: string;
  patientId: string;
  serviceId?: string | null;
  templateVersion: string;
  signaturePayload: string;
  signedFromIp?: string | null;
}

export async function createConsent(tx: Tx, input: CreateConsentInput) {
  const rows = await tx
    .insert(consents)
    .values({
      clinicId: input.clinicId,
      patientId: input.patientId,
      serviceId: input.serviceId ?? null,
      templateVersion: input.templateVersion,
      signaturePayload: input.signaturePayload,
      signedFromIp: input.signedFromIp ?? null,
    })
    .returning();
  const created = rows[0]!;
  await appendAudit(tx, {
    clinicId: input.clinicId,
    userId: input.userId,
    action: "consent.create",
    entity: "consent",
    entityId: created.id,
    meta: {
      patientId: input.patientId,
      templateVersion: input.templateVersion,
    },
  });
  return created;
}

export async function listConsentsForPatient(tx: Tx, clinicId: string, patientId: string) {
  return tx
    .select()
    .from(consents)
    .where(and(eq(consents.clinicId, clinicId), eq(consents.patientId, patientId)))
    .orderBy(desc(consents.signedAt));
}
