import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { galleryItems } from "../schema.js";
import { appendAudit } from "./core.repo.js";
import { enqueueStorageOrphans } from "./storage-orphans.repo.js";
import type { Tx } from "../tenant.js";

export interface GalleryInitInput {
  patientId: string;
  storageKey: string;
  mime: string;
  sizeBytes: number;
  userId: string;
}

/** Pending item — becomes `done` only after the complete pipeline passes. */
export async function createPendingGalleryItem(tx: Tx, clinicId: string, input: GalleryInitInput) {
  const rows = await tx
    .insert(galleryItems)
    .values({
      clinicId,
      patientId: input.patientId,
      storageKey: input.storageKey,
      mime: input.mime,
      uploadState: "pending",
    })
    .returning();
  const item = rows[0]!;
  await appendAudit(tx, {
    clinicId,
    userId: input.userId,
    action: "gallery.init",
    entity: "gallery_item",
    entityId: item.id,
  });
  return item;
}

export async function getGalleryItem(tx: Tx, clinicId: string, id: string) {
  const rows = await tx
    .select()
    .from(galleryItems)
    .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export interface GalleryCompleteUpdate {
  /** Canonical (normalized jpeg) rest-key replacing the raw-upload key. */
  storageKey?: string;
  thumbKey: string;
  sha256: string;
  quality: unknown;
  sizeBytes: number;
  userId: string;
}

export async function completeGalleryItem(tx: Tx, clinicId: string, id: string, update: GalleryCompleteUpdate) {
  const rows = await tx
    .update(galleryItems)
    .set({
      ...(update.storageKey ? { storageKey: update.storageKey } : {}),
      thumbKey: update.thumbKey,
      sha256: update.sha256,
      quality: update.quality as object,
      uploadState: "done",
    })
    .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.id, id), eq(galleryItems.uploadState, "pending")))
    .returning();
  if (!rows[0]) return null;
  await appendAudit(tx, {
    clinicId,
    userId: update.userId,
    action: "gallery.complete",
    entity: "gallery_item",
    entityId: id,
  });
  return rows[0];
}

/**
 * Rejected by the pipeline — the pending row goes away and its object is QUEUED
 * for deletion (WEAKNESSES M22). Previously the caller deleted the object with a
 * swallowed `.catch()`: when that failed, an unreferenced image stayed in the
 * bucket forever with nothing recording its existence.
 */
export async function deletePendingGalleryItem(tx: Tx, clinicId: string, id: string): Promise<boolean> {
  const rows = await tx
    .delete(galleryItems)
    .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.id, id), eq(galleryItems.uploadState, "pending")))
    .returning({ id: galleryItems.id, storageKey: galleryItems.storageKey, thumbKey: galleryItems.thumbKey });
  if (!rows[0]) return false;
  await enqueueStorageOrphans(tx, clinicId, [rows[0].storageKey, rows[0].thumbKey], "gallery.rejected");
  return true;
}

export interface GalleryListPage {
  items: Array<{
    id: string;
    patientId: string;
    storageKey: string;
    thumbKey: string | null;
    mime: string;
    capturedAt: Date | null;
    quality: unknown;
    createdAt: Date;
  }>;
  nextCursor: string | null;
}

/**
 * Keyset pagination over (created_at, id) — matches the 0005 composite index.
 * Cursor format: `<ISO created_at>|<id>` (opaque to clients).
 */
export async function listGalleryByPatient(
  tx: Tx,
  clinicId: string,
  patientId: string,
  opts: { limit: number; cursor?: string },
): Promise<GalleryListPage> {
  const filters = [
    eq(galleryItems.clinicId, clinicId),
    eq(galleryItems.patientId, patientId),
    isNull(galleryItems.deletedAt),
    eq(galleryItems.uploadState, "done"),
  ];
  if (opts.cursor) {
    const sep = opts.cursor.lastIndexOf("|");
    const createdAt = new Date(opts.cursor.slice(0, sep));
    const id = opts.cursor.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime())) throw new Error("invalid gallery cursor");
    filters.push(or(lt(galleryItems.createdAt, createdAt), and(eq(galleryItems.createdAt, createdAt), lt(galleryItems.id, sql`${id}::uuid`)))!);
  }
  const rows = await tx
    .select({
      id: galleryItems.id,
      patientId: galleryItems.patientId,
      storageKey: galleryItems.storageKey,
      thumbKey: galleryItems.thumbKey,
      mime: galleryItems.mime,
      capturedAt: galleryItems.capturedAt,
      quality: galleryItems.quality,
      createdAt: galleryItems.createdAt,
    })
    .from(galleryItems)
    .where(and(...filters))
    .orderBy(desc(galleryItems.createdAt), desc(galleryItems.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = page.at(-1);
  return {
    items: page,
    nextCursor: hasMore && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

/**
 * Soft delete keeps the object: the retention policy owns when the bytes go
 * away, and that path runs through `executePurge` (M21), which queues the keys.
 */
export async function softDeleteGalleryItem(tx: Tx, clinicId: string, userId: string, id: string): Promise<boolean> {
  const rows = await tx
    .update(galleryItems)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.id, id), isNull(galleryItems.deletedAt)))
    .returning({ id: galleryItems.id });
  if (!rows[0]) return false;
  await appendAudit(tx, {
    clinicId,
    userId,
    action: "gallery.delete",
    entity: "gallery_item",
    entityId: id,
  });
  return true;
}
