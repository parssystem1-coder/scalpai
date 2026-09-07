import { and, eq, lt, sql } from "drizzle-orm";
import { uploadSessions } from "../schema.js";
import { appendAudit } from "./core.repo.js";
import type { Tx } from "../tenant.js";

/**
 * Resumable upload sessions — phase 8 (WEAKNESSES H7, ADR-0041).
 *
 * The old "resume" kept `uploadId`, part count and ETags in `localStorage` and
 * asked the API to re-initiate a multipart upload for the same file. That threw
 * the previous S3 upload away: every byte was sent again, and the abandoned
 * upload sat in the bucket paying rent until someone noticed.
 *
 * The session row is the server-side contract. The browser only keeps its id;
 * `uploadId`, `partSizeBytes` and `totalParts` are answered from here, and the
 * parts that already landed are answered by `ListParts` against the bucket —
 * never by client bookkeeping.
 */

/** How long an unfinished upload may hold a storage reservation. */
export const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadSessionState = "open" | "completed" | "aborted" | "expired";

export interface UploadSessionRow {
  id: string;
  clinicId: string;
  galleryItemId: string;
  patientId: string;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  uploadId: string | null;
  state: string;
  createdBy: string | null;
  createdAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
}

export interface CreateUploadSessionInput {
  galleryItemId: string;
  patientId: string;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  userId: string;
  ttlMs?: number;
}

const COLUMNS = {
  id: uploadSessions.id,
  clinicId: uploadSessions.clinicId,
  galleryItemId: uploadSessions.galleryItemId,
  patientId: uploadSessions.patientId,
  storageKey: uploadSessions.storageKey,
  mime: uploadSessions.mime,
  sizeBytes: uploadSessions.sizeBytes,
  partSizeBytes: uploadSessions.partSizeBytes,
  totalParts: uploadSessions.totalParts,
  uploadId: uploadSessions.uploadId,
  state: uploadSessions.state,
  createdBy: uploadSessions.createdBy,
  createdAt: uploadSessions.createdAt,
  expiresAt: uploadSessions.expiresAt,
  completedAt: uploadSessions.completedAt,
};

export async function createUploadSession(
  tx: Tx,
  clinicId: string,
  input: CreateUploadSessionInput,
): Promise<UploadSessionRow> {
  const ttl = input.ttlMs ?? UPLOAD_SESSION_TTL_MS;
  const rows = await tx
    .insert(uploadSessions)
    .values({
      clinicId,
      galleryItemId: input.galleryItemId,
      patientId: input.patientId,
      storageKey: input.storageKey,
      mime: input.mime,
      sizeBytes: input.sizeBytes,
      partSizeBytes: input.partSizeBytes,
      totalParts: input.totalParts,
      expiresAt: new Date(Date.now() + ttl),
      createdBy: input.userId,
    })
    .returning(COLUMNS);
  const row = rows[0]!;
  await appendAudit(tx, {
    clinicId,
    userId: input.userId,
    action: "upload.session_open",
    entity: "upload_session",
    entityId: row.id,
    meta: { bytes: input.sizeBytes, parts: input.totalParts },
  });
  return row;
}

export async function getUploadSession(tx: Tx, clinicId: string, id: string): Promise<UploadSessionRow | null> {
  const rows = await tx
    .select(COLUMNS)
    .from(uploadSessions)
    .where(and(eq(uploadSessions.clinicId, clinicId), eq(uploadSessions.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** The open session of a gallery item, if the previous attempt left one behind. */
export async function findOpenUploadSession(
  tx: Tx,
  clinicId: string,
  galleryItemId: string,
): Promise<UploadSessionRow | null> {
  const rows = await tx
    .select(COLUMNS)
    .from(uploadSessions)
    .where(
      and(
        eq(uploadSessions.clinicId, clinicId),
        eq(uploadSessions.galleryItemId, galleryItemId),
        eq(uploadSessions.state, "open"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Record the S3 upload id. Minted lazily: a single-shot PUT never needs one, and
 * a multipart upload that is never resumed should not have created one either.
 */
export async function attachUploadId(
  tx: Tx,
  clinicId: string,
  id: string,
  uploadId: string,
): Promise<UploadSessionRow | null> {
  const rows = await tx
    .update(uploadSessions)
    .set({ uploadId, updatedAt: sql`now()` })
    .where(
      and(eq(uploadSessions.clinicId, clinicId), eq(uploadSessions.id, id), eq(uploadSessions.state, "open")),
    )
    .returning(COLUMNS);
  return rows[0] ?? null;
}

export async function completeUploadSession(
  tx: Tx,
  clinicId: string,
  id: string,
  userId: string,
): Promise<boolean> {
  const rows = await tx
    .update(uploadSessions)
    .set({ state: "completed", completedAt: sql`now()`, updatedAt: sql`now()` })
    .where(
      and(eq(uploadSessions.clinicId, clinicId), eq(uploadSessions.id, id), eq(uploadSessions.state, "open")),
    )
    .returning({ id: uploadSessions.id });
  if (!rows[0]) return false;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "upload.session_complete",
    entity: "upload_session",
    entityId: id,
  });
  return true;
}

export async function abortUploadSession(
  tx: Tx,
  clinicId: string,
  id: string,
  userId: string,
  reason: string,
): Promise<UploadSessionRow | null> {
  const rows = await tx
    .update(uploadSessions)
    .set({ state: "aborted", updatedAt: sql`now()` })
    .where(
      and(eq(uploadSessions.clinicId, clinicId), eq(uploadSessions.id, id), eq(uploadSessions.state, "open")),
    )
    .returning(COLUMNS);
  if (!rows[0]) return null;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "upload.session_abort",
    entity: "upload_session",
    entityId: id,
    meta: { reason },
  });
  return rows[0];
}

/**
 * Retire sessions nobody came back for. Until this runs their `size_bytes` is
 * still counted as a reservation, so an abandoned upload would slowly eat a
 * clinic's storage ceiling without a single byte being stored.
 */
export async function expireUploadSessions(tx: Tx, clinicId: string): Promise<UploadSessionRow[]> {
  return tx
    .update(uploadSessions)
    .set({ state: "expired", updatedAt: sql`now()` })
    .where(
      and(
        eq(uploadSessions.clinicId, clinicId),
        eq(uploadSessions.state, "open"),
        lt(uploadSessions.expiresAt, sql`now()`),
      ),
    )
    .returning(COLUMNS);
}
