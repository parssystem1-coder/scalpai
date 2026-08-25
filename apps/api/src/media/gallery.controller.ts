import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import sharp from "sharp";
import { computeQuality, rgbaToGray } from "@scalpai/analysis-core";
import { GalleryInit, type GalleryInitDto, errors } from "@scalpai/shared";
import {
  appendAudit,
  completeGalleryItem,
  createPendingGalleryItem,
  deletePendingGalleryItem,
  getGalleryItem,
} from "@scalpai/db";
import { Roles } from "../common/roles.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { StorageService } from "./storage.service.js";
import { MIME_TO_KIND, sniffImageMime } from "./magic.js";

const MAX_EDGE = 2048;

/**
 * Media pipeline (playbook 2.1): init issues a tenant-prefixed presigned PUT,
 * the client uploads directly to MinIO, and `complete` runs the server-side
 * gauntlet — magic bytes, EXIF-strip/auto-orient, resolution cap, thumbnail,
 * quality gate — before the item ever becomes `done`.
 */
@Controller()
export class GalleryController {
  constructor(private scope: TenantScope, private storage: StorageService) {}

  @Post("patients/:pid/gallery/init")
  @Roles("owner", "trichologist", "receptionist")
  async init(@Param("pid") pid: string, @Body(new ZodBodyPipe(GalleryInit)) dto: GalleryInitDto) {
    const ext = MIME_TO_KIND[dto.mime];
    const rest = `gallery/${randomUUID()}/original.${ext}`;
    const created = await this.scope.tx(async (tx, ctx) =>
      createPendingGalleryItem(tx, ctx.clinicId, {
        patientId: pid,
        storageKey: rest,
        mime: dto.mime,
        sizeBytes: dto.sizeBytes,
        userId: ctx.userId,
      }),
    );
    const uploadUrl = await this.storage.presignPut(this.scope.requireCtx().clinicId, rest, dto.mime);
    return { id: created.id, uploadUrl, key: rest };
  }

  @Post("gallery/:gid/complete")
  @Roles("owner", "trichologist", "receptionist")
  @HttpCode(HttpStatus.OK) // action endpoint — the item already exists
  async complete(@Param("gid") gid: string): Promise<unknown> {
    const ctx = this.scope.requireCtx();
    const item = await this.scope.tx((tx) => getGalleryItem(tx, ctx.clinicId, gid));
    if (!item || item.uploadState !== "pending") throw errors.notFound();

    let raw: Buffer;
    try {
      raw = await this.storage.getObject(ctx.clinicId, item.storageKey);
    } catch {
      await this.rejectPending(ctx.clinicId, gid, item.storageKey, null);
      throw errors.invalidImage();
    }

    // 1) magic bytes — declared mime must match actual content (rules §2)
    const sniffed = sniffImageMime(raw);
    if (!sniffed || sniffed !== MIME_TO_KIND[item.mime]) {
      await this.rejectPending(ctx.clinicId, gid, item.storageKey, null);
      throw errors.invalidImage();
    }

    // base dir of this item inside the clinic prefix: gallery/{uuid}
    const baseDir = item.storageKey.split("/").slice(0, -1).join("/");
    const canonicalRest = `${baseDir}/original.jpg`;
    const thumbRest = `${baseDir}/thumb.jpg`;

    try {
      // 2) auto-orient by EXIF, strip metadata on re-encode, cap resolution
      const processed = await sharp(raw)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      const meta = await sharp(processed).metadata();

      // 3) quality gate BEFORE anything is kept (§10.1 / rules §2)
      const grayRaw = await sharp(processed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const gray = rgbaToGray(grayRaw.data, grayRaw.info.width, grayRaw.info.height);
      const verdict = computeQuality(gray);
      if (verdict.status === "reject") {
        await this.rejectPending(ctx.clinicId, gid, item.storageKey, verdict.reasons);
        throw errors.qualityFail(verdict.reasons);
      }

      // 4) thumbnail + canonical store (normalized to jpeg)
      const thumb = await sharp(processed).resize(512, 512, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
      await this.storage.putBuffer(ctx.clinicId, canonicalRest, processed, "image/jpeg");
      await this.storage.putBuffer(ctx.clinicId, thumbRest, thumb, "image/jpeg");
      if (item.storageKey !== canonicalRest) {
        await this.storage.removeObject(ctx.clinicId, item.storageKey).catch(() => undefined);
      }

      const sha256 = createHash("sha256").update(processed).digest("hex");
      const done = await this.scope.tx((tx) =>
        completeGalleryItem(tx, ctx.clinicId, gid, {
          storageKey: canonicalRest,
          thumbKey: thumbRest,
          sha256,
          quality: { status: "pass", metrics: verdict.metrics },
          sizeBytes: processed.length,
          userId: ctx.userId,
        }),
      );
      if (!done) throw errors.notFound();
      return {
        id: done.id,
        state: done.uploadState,
        width: meta.width ?? null,
        height: meta.height ?? null,
        quality: verdict.metrics,
        sha256,
      };
    } catch (err) {
      if ((err as { status?: number }).status === 400) throw err; // handled failures keep their contract
      await this.rejectPending(ctx.clinicId, gid, item.storageKey, null);
      throw errors.invalidImage();
    }
  }

  /** Remove the raw object + pending row + audit the rejection. */
  private async rejectPending(clinicId: string, gid: string, rest: string, reasons: string[] | null): Promise<void> {
    await this.storage.removeObject(clinicId, rest).catch(() => undefined);
    await this.scope.tx(async (tx, ctx) => {
      if (await deletePendingGalleryItem(tx, clinicId, gid)) {
        await appendAudit(tx, {
          clinicId,
          userId: ctx.userId,
          action: reasons ? "gallery.reject_quality" : "gallery.reject_invalid",
          entity: "gallery_item",
          entityId: gid,
          meta: reasons ? { reasons } : null,
        });
      }
    });
  }
}
