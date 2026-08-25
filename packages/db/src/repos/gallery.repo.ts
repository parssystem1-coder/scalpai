import { and, eq } from "drizzle-orm";
import { galleryItems } from "../schema.js";
import { appendAudit } from "./core.repo.js";
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

/** Rejected by the pipeline — pending row is removed and the object deleted. */
export async function deletePendingGalleryItem(tx: Tx, clinicId: string, id: string): Promise<boolean> {
  const rows = await tx
    .delete(galleryItems)
    .where(and(eq(galleryItems.clinicId, clinicId), eq(galleryItems.id, id), eq(galleryItems.uploadState, "pending")))
    .returning({ id: galleryItems.id });
  if (!rows[0]) return false;
  return true;
}
