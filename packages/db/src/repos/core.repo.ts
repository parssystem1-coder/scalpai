import { createHash } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import {
  assertAuditMetaSafe,
  canonicalObject,
  isActiveConsentTemplate,
  isKnownConsentTemplate,
  type ParsedSignature,
} from "@scalpai/shared";
import { auditLog, consents, patients, sessions } from "../schema.js";
import { incrementUsage } from "./users.repo.js";
import { computeAuditRowHash } from "../audit-hash.js";
import {
  decryptPhi,
  encryptPhi,
  phiCiphertextKid,
  rotatePhiCiphertext,
  type PhiAad,
} from "../phi-crypto.js";
import { newId } from "../tenant.js";
import type { Tx } from "../tenant.js";

/**
 * Append-only audit (engineering-rules §13 / DESIGN §13). Runs INSIDE the tenant
 * transaction so the audit row commits atomically with the mutation it records.
 * Chain integrity: row_hash = sha256(prev_hash || CANONICAL payload). The app
 * role has UPDATE/DELETE revoked on audit_log at the SQL level — history is immutable.
 *
 * Chain semantics (WEAKNESSES W21): the chain is PER-CLINIC by construction.
 *
 * Phase 6 (H17): the payload is canonical JSON from a single shared definition
 * (audit-hash.ts) instead of an ad-hoc `JSON.stringify` here and a second copy in
 * the verifier. `meta` is also GUARDED: an attempt to audit a clinical note, a
 * phone number or a token throws instead of writing PHI into the one table we
 * can never redact afterwards.
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
  // Fail before touching the chain: a rejected meta must not consume a hash slot.
  assertAuditMetaSafe(entry.meta ?? null);

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
  const prevHash = prev[0]?.rowHash ?? null;
  // Store the SAME object we hashed: canonicalObject round-trips the canonical
  // text, so jsonb key order can never disagree with the digest input.
  const meta = entry.meta === undefined || entry.meta === null ? null : canonicalObject<object>(entry.meta);
  const rowHash = computeAuditRowHash({ ...entry, meta, at }, prevHash);

  await tx.insert(auditLog).values({
    clinicId: entry.clinicId,
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    meta,
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
    const expected = computeAuditRowHash(
      {
        clinicId: r.clinicId,
        userId: r.userId,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        meta: r.meta ?? null,
        at: r.at as Date,
      },
      prev,
    );
    if (r.prevHash !== prev || r.rowHash !== expected) return false;
    prev = r.rowHash;
  }
  return true;
}

// ---------------- Patients ----------------

/** Columns a patient read may return. `notes_encrypted` is deliberately absent. */
const PATIENT_COLUMNS = {
  id: patients.id,
  clinicId: patients.clinicId,
  firstName: patients.firstName,
  lastName: patients.lastName,
  phone: patients.phone,
  gender: patients.gender,
  birthDate: patients.birthDate,
  tags: patients.tags,
  notesKeyId: patients.notesKeyId,
  notesUpdatedAt: patients.notesUpdatedAt,
  createdBy: patients.createdBy,
  createdAt: patients.createdAt,
  updatedAt: patients.updatedAt,
  deletedAt: patients.deletedAt,
} as const;

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

/**
 * A patient read never carries the note. Callers that are entitled to it ask for
 * it explicitly through `readPatientNotes`, which is a separate audited action.
 */
export async function getPatientById(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select({ ...PATIENT_COLUMNS, hasNotes: isNotNull(patients.notesEncrypted) })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, id), isNull(patients.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** Test/admin view incl. soft-deleted rows (updated_at trigger proof, W07). */
export async function getPatientIncludingDeleted(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select({ ...PATIENT_COLUMNS, hasNotes: isNotNull(patients.notesEncrypted) })
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
    .returning(PATIENT_COLUMNS);
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

/* ── Clinical notes: the only door to notes_encrypted (C2) ─────────────────── */

export function patientNotesAad(clinicId: string, patientId: string): PhiAad {
  return { clinicId, entity: "patient", entityId: patientId, field: "notes" };
}

/**
 * Encrypt and store a clinical note. Passing `null` clears it. The audit row
 * records the FIELD NAME and the key id — never the text (H17).
 */
export async function setPatientNotes(
  tx: Tx,
  clinicId: string,
  userId: string,
  patientId: string,
  plaintext: string | null,
): Promise<boolean> {
  const trimmed = plaintext?.trim() ?? "";
  const ciphertext = trimmed.length === 0 ? null : encryptPhi(trimmed, patientNotesAad(clinicId, patientId));

  const rows = await tx
    .update(patients)
    .set({
      notesEncrypted: ciphertext,
      notesKeyId: ciphertext ? phiCiphertextKid(ciphertext) : null,
      notesUpdatedAt: sql`now()`,
    })
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, patientId), isNull(patients.deletedAt)))
    .returning({ id: patients.id, notesKeyId: patients.notesKeyId });
  if (!rows[0]) return false;

  await appendAudit(tx, {
    clinicId,
    userId,
    action: ciphertext ? "patient.notes_set" : "patient.notes_cleared",
    entity: "patient",
    entityId: patientId,
    meta: { fields: ["notes"], keyId: rows[0].notesKeyId, bytes: ciphertext?.length ?? 0 },
  });
  return true;
}

/** Decrypt on read. Reading PHI is itself an audited event. */
export async function readPatientNotes(
  tx: Tx,
  clinicId: string,
  userId: string,
  patientId: string,
): Promise<string | null> {
  const rows = await tx
    .select({ notesEncrypted: patients.notesEncrypted })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.id, patientId), isNull(patients.deletedAt)))
    .limit(1);
  if (!rows[0]) return null;

  await appendAudit(tx, {
    clinicId,
    userId,
    action: "patient.notes_read",
    entity: "patient",
    entityId: patientId,
    meta: { fields: ["notes"] },
  });

  const token = rows[0].notesEncrypted;
  if (!token) return null;
  return decryptPhi(token, patientNotesAad(clinicId, patientId));
}

/**
 * Re-wrap notes under the active key. Batched and idempotent so the rotation CLI
 * can run repeatedly without a migration window.
 */
export async function rotatePatientNotes(
  tx: Tx,
  clinicId: string,
  limit = 200,
): Promise<{ scanned: number; rotated: number }> {
  const rows = await tx
    .select({ id: patients.id, notesEncrypted: patients.notesEncrypted })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), isNotNull(patients.notesEncrypted)))
    .limit(limit);

  let rotated = 0;
  for (const row of rows) {
    const next = rotatePhiCiphertext(row.notesEncrypted!, patientNotesAad(clinicId, row.id));
    if (!next) continue;
    await tx
      .update(patients)
      .set({ notesEncrypted: next, notesKeyId: phiCiphertextKid(next) })
      .where(and(eq(patients.clinicId, clinicId), eq(patients.id, row.id)));
    rotated++;
  }
  if (rotated > 0) {
    await appendAudit(tx, {
      clinicId,
      userId: null,
      action: "patient.notes_rotated",
      entity: "patient",
      entityId: null,
      meta: { scanned: rows.length, count: rotated },
    });
  }
  return { scanned: rows.length, rotated };
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
  // §9.1 metering: inline in the same tx until BullMQ workers take over.
  await incrementUsage(tx, input.clinicId, "monthly_sessions");
  return created;
}

// ---------------- Consents ----------------

const SIGNATURE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

export function consentSignatureKey(consentId: string, mime: string): string {
  return `consents/${consentId}/signature.${SIGNATURE_EXT[mime] ?? "bin"}`;
}

export class ConsentError extends Error {
  constructor(message: string) {
    super(`consent: ${message}`);
    this.name = "ConsentError";
  }
}

export interface CreateConsentInput {
  clinicId: string;
  userId: string;
  patientId: string;
  serviceId?: string | null;
  templateVersion: string;
  /** Already parsed and BOUNDED by the shared validator (M8). */
  signature: ParsedSignature;
  signedFromIp?: string | null;
  userAgent?: string | null;
  /**
   * Writes the signature bytes to object storage. Injected so this package keeps
   * no S3 dependency. Called INSIDE the transaction: if it throws, the consent
   * row rolls back and the (possibly written) object is caught by storage
   * reconciliation rather than left half-committed.
   */
  storeSignature: (key: string, body: Buffer, mime: string) => Promise<void>;
}

/**
 * Phase 6 (M8): the row stores a MinIO key plus a sha256, the byte size, the MIME
 * type, the signer's IP and user agent. A multi-megabyte data URL in a jsonb-ish
 * text column is gone.
 */
export async function createConsent(tx: Tx, input: CreateConsentInput) {
  if (!isKnownConsentTemplate(input.templateVersion)) {
    throw new ConsentError(`unknown template version '${input.templateVersion}'`);
  }
  if (!isActiveConsentTemplate(input.templateVersion)) {
    throw new ConsentError(`template '${input.templateVersion}' is superseded and can no longer be signed`);
  }

  const id = newId();
  const body = Buffer.from(input.signature.base64, "base64");
  const sha256 = createHash("sha256").update(body).digest("hex");
  const key = consentSignatureKey(id, input.signature.mime);

  const rows = await tx
    .insert(consents)
    .values({
      id,
      clinicId: input.clinicId,
      patientId: input.patientId,
      serviceId: input.serviceId ?? null,
      templateVersion: input.templateVersion,
      signatureKey: key,
      signatureSha256: sha256,
      signatureBytes: body.length,
      signatureMime: input.signature.mime,
      signedFromIp: input.signedFromIp ?? null,
      signedUserAgent: input.userAgent?.slice(0, 300) ?? null,
    })
    .returning();
  const created = rows[0]!;

  await input.storeSignature(key, body, input.signature.mime);

  await appendAudit(tx, {
    clinicId: input.clinicId,
    userId: input.userId,
    action: "consent.create",
    entity: "consent",
    entityId: created.id,
    meta: {
      patientId: input.patientId,
      templateVersion: input.templateVersion,
      signatureSha256: sha256,
      signatureBytes: body.length,
    },
  });
  return created;
}

/** Consent can be withdrawn (M8). The row survives; the grant does not. */
export async function revokeConsent(
  tx: Tx,
  clinicId: string,
  userId: string,
  consentId: string,
  reason: string,
): Promise<boolean> {
  if (reason.trim().length < 4) throw new ConsentError("a revocation needs a reason");
  const rows = await tx
    .update(consents)
    .set({ revokedAt: sql`now()`, revokedBy: userId, revokedReason: reason.trim().slice(0, 300) })
    .where(and(eq(consents.clinicId, clinicId), eq(consents.id, consentId), isNull(consents.revokedAt)))
    .returning({ id: consents.id });
  if (!rows[0]) return false;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "consent.revoke",
    entity: "consent",
    entityId: consentId,
    meta: { reason: reason.trim().slice(0, 200) },
  });
  return true;
}

export async function listConsentsForPatient(tx: Tx, clinicId: string, patientId: string) {
  return tx
    .select({
      id: consents.id,
      patientId: consents.patientId,
      serviceId: consents.serviceId,
      templateVersion: consents.templateVersion,
      signatureSha256: consents.signatureSha256,
      signatureBytes: consents.signatureBytes,
      signatureMime: consents.signatureMime,
      signedAt: consents.signedAt,
      revokedAt: consents.revokedAt,
      revokedReason: consents.revokedReason,
    })
    .from(consents)
    .where(and(eq(consents.clinicId, clinicId), eq(consents.patientId, patientId)))
    .orderBy(desc(consents.signedAt));
}

/** The object key is only handed out for a presigned download, never in a list. */
export async function getConsentSignatureRef(tx: Tx, clinicId: string, consentId: string) {
  const rows = await tx
    .select({
      signatureKey: consents.signatureKey,
      signatureSha256: consents.signatureSha256,
      signatureMime: consents.signatureMime,
      revokedAt: consents.revokedAt,
    })
    .from(consents)
    .where(and(eq(consents.clinicId, clinicId), eq(consents.id, consentId)))
    .limit(1);
  return rows[0] ?? null;
}
