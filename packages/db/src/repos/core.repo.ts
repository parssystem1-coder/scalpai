import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auditLog, patients, sessions } from "../schema.js";
import type { Tx } from "../tenant.js";

/**
 * Append-only audit (engineering-rules §13 / DESIGN §13). Runs INSIDE the tenant
 * transaction so the audit row commits atomically with the mutation it records.
 * Chain integrity: row_hash = sha256(prev_hash || canonical payload). The app
 * role has UPDATE/DELETE revoked on audit_log at the SQL level — history is immutable.
 *
 * Chain semantics (WEAKNESSES W21): the chain is PER-CLINIC by construction —
 * the prev-hash lookup runs inside the tenant tx, so a clinic only ever links
 * its own rows. `verifyChain` therefore verifies whatever rows are visible in
 * the caller's tenant context (run it inside db.withTenant(clinicId, ...)).
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

/** Verify the chain over all rows visible to the caller (per-clinic under RLS) in id order. */
export async function verifyChain(tx: Tx): Promise<boolean> {
  const rows = await tx.select().from(auditLog).orderBy(auditLog.id);
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
  q: { search?: string; limit: number; offset: number },
) {
  const like = q.search ? `%${q.search}%` : null;
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
        ? and(isNull(patients.deletedAt), sql`(${patients.firstName} ILIKE ${like} OR ${patients.lastName} ILIKE ${like} OR ${patients.phone} ILIKE ${like})`)
        : isNull(patients.deletedAt),
    )
    .orderBy(desc(patients.createdAt))
    .limit(q.limit)
    .offset(q.offset);
}

export async function getPatientById(tx: Tx, id: string) {
  const rows = await tx
    .select()
    .from(patients)
    .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Test/admin view incl. soft-deleted rows (updated_at trigger proof, W07). */
export async function getPatientIncludingDeleted(tx: Tx, id: string) {
  const rows = await tx.select().from(patients).where(eq(patients.id, id)).limit(1);
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
    .where(and(eq(patients.id, id), isNull(patients.deletedAt)))
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
  return created;
}
