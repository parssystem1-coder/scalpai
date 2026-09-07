import { createHash, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import sharp from "sharp";
import { computeQuality, rgbaToGray } from "@scalpai/analysis-core";
import {
  MULTIPART_THRESHOLD_BYTES,
  UPLOAD_MAX_BYTES,
  UPLOAD_PART_URL_BATCH_MAX,
  errors,
  normalizePartSize,
  partCountFor,
  partRange,
  type UploadCompleteDto,
  type UploadInitDto,
  type UploadPartUrlsRequestDto,
  type UploadSessionView,
} from "@scalpai/shared";
import {
  abortUploadSession,
  attachUploadId,
  completeGalleryItem,
  completeUploadSession,
  consumeQuota,
  createPendingGalleryItem,
  createUploadSession,
  deletePendingGalleryItem,
  expireUploadSessions,
  findOpenUploadSession,
  getGalleryItem,
  getUploadSession,
  releaseQuota,
  reserveStorageBytes,
  resolveQuotaLimit,
  type UploadSessionRow,
} from "@scalpai/db";
import { imageWorkGate } from "../common/concurrency.js";
import { logEvent } from "../common/logging.js";
import { envNumber } from "../common/state/kv.store.js";
import { EntitlementService } from "../entitlements/entitlement.service.js";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { MIME_TO_KIND, sniffImageMime } from "./magic.js";
import { ObjectTooLargeError, StorageService } from "./storage.service.js";

const MAX_EDGE = 2048;
const THUMB_EDGE = 512;

/**
 * libvips keeps its own thread pool and its own cache. Left at the defaults, one
 * request could spin up a thread per core AND keep decoded tiles alive between
 * requests — on top of the semaphore that is meant to bound exactly this. One
 * thread per decode plus no cache makes the memory ceiling predictable (L4).
 */
sharp.concurrency(Math.max(1, Math.round(envNumber("SHARP_THREADS", 1))));
sharp.cache(false);

/** The extension the key carries — must match the DB key-shape CHECK. */
const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export interface PartUrl {
  partNumber: number;
  url: string;
  bytes: number;
}

export interface OpenUploadResult {
  id: string;
  sessionId: string;
  key: string;
  multipart: boolean;
  sizeBytes: number;
  partSizeBytes: number;
  totalParts: number;
  expiresAt: string;
  /** Single-shot uploads get one PUT url; multipart gets its first URL window. */
  uploadUrl?: string;
  parts?: PartUrl[];
}

export interface CompleteResult {
  id: string;
  state: string;
  width: number | null;
  height: number | null;
  quality: unknown;
  sha256: string;
  sizeBytes: number;
}

/**
 * Media upload pipeline — phase 8 (ADR-0041).
 *
 * What changed, and why none of it is cosmetic:
 *
 *  - **H7 resume.** "Resume" used to call init-multipart again for the same file:
 *    a brand new `uploadId`, every ETag discarded, every byte re-sent, and the
 *    previous upload abandoned inside the bucket. A session row now owns the
 *    `uploadId` and the part geometry, and the parts that already landed are read
 *    from the bucket with `ListParts`.
 *
 *  - **H7/H12 lazy URLs.** All part URLs were signed at init with a 15 minute
 *    TTL. On a slow uplink the tail of a 50MB upload met expired URLs and failed
 *    for a reason the client could not act on. URLs are minted a window at a time
 *    and can be re-requested at any point.
 *
 *  - **H12 real limits.** `getObject` buffered whatever the bucket held before
 *    anything checked a size. Now: HEAD first, sniff by range, decode from a
 *    capped stream.
 *
 *  - **H11 quota.** The upload slot and the storage bytes are taken in the SAME
 *    transaction that creates the session, under a row lock, and refunded when
 *    the image is rejected or the upload is abandoned.
 */
@Injectable()
export class UploadService {
  constructor(
    private scope: TenantScope,
    private storage: StorageService,
    private entitlements: EntitlementService,
  ) {}

  /* ── open ──────────────────────────────────────────────────────────── */

  async open(patientId: string, dto: UploadInitDto): Promise<OpenUploadResult> {
    const ctx = this.scope.requireCtx();
    const partSizeBytes = normalizePartSize(dto.partSizeBytes);
    const totalParts = partCountFor(dto.sizeBytes, partSizeBytes);
    const multipart = dto.sizeBytes > MULTIPART_THRESHOLD_BYTES || totalParts > 1;

    const ent = await this.entitlements.resolve(ctx.clinicId);
    const uploadLimit = resolveQuotaLimit(ent?.limits, "uploads");
    const storageLimit = resolveQuotaLimit(ent?.limits, "storage");

    const ext = EXT_FOR_MIME[dto.mime];
    if (!ext) throw errors.validation({ mime: dto.mime });
    const storageKey = `gallery/${randomUUID()}/original.${ext}`;

    const opened = await this.scope.tx(async (tx, c) => {
      // An abandoned session still holds its bytes as a reservation. Retire the
      // expired ones FIRST, or a clinic slowly loses its ceiling to ghosts.
      await expireUploadSessions(tx, c.clinicId);

      const slot = await consumeQuota(tx, c.clinicId, "uploads", 1, uploadLimit);
      if (!slot.allowed) throw errors.quotaExceeded();

      const room = await reserveStorageBytes(tx, c.clinicId, dto.sizeBytes, storageLimit);
      if (!room.allowed) throw errors.quotaExceeded();

      const item = await createPendingGalleryItem(tx, c.clinicId, {
        patientId,
        storageKey,
        mime: dto.mime,
        sizeBytes: dto.sizeBytes,
        userId: c.userId,
      });
      const session = await createUploadSession(tx, c.clinicId, {
        galleryItemId: item.id,
        patientId,
        storageKey,
        mime: dto.mime,
        sizeBytes: dto.sizeBytes,
        partSizeBytes,
        totalParts,
        userId: c.userId,
      });
      return { itemId: item.id, session };
    });

    const base: OpenUploadResult = {
      id: opened.itemId,
      sessionId: opened.session.id,
      key: storageKey,
      multipart,
      sizeBytes: dto.sizeBytes,
      partSizeBytes,
      totalParts,
      expiresAt: opened.session.expiresAt.toISOString(),
    };

    try {
      if (!multipart) {
        return { ...base, uploadUrl: await this.storage.presignMediaPut(ctx.clinicId, storageKey, dto.mime) };
      }
      const uploadId = await this.storage.createMultipartUpload(ctx.clinicId, storageKey, dto.mime);
      const withId = await this.scope.tx((tx, c) => attachUploadId(tx, c.clinicId, opened.session.id, uploadId));
      if (!withId) throw errors.notFound();
      return { ...base, parts: await this.mintPartUrls(ctx.clinicId, withId, 1, UPLOAD_PART_URL_BATCH_MAX) };
    } catch (err) {
      // The session is committed, so a failure here must not leave a phantom
      // reservation behind: give the slot and the bytes back before rethrowing.
      await this.abort(opened.session.id, "init failed").catch(() => undefined);
      throw err;
    }
  }

  /* ── status / resume ──────────────────────────────────────────────── */

  async status(sessionId: string): Promise<UploadSessionView> {
    const ctx = this.scope.requireCtx();
    const session = await this.requireSession(sessionId);
    const uploadedParts = session.uploadId
      ? (await this.storage.listParts(ctx.clinicId, session.storageKey, session.uploadId)).map((p) => p.partNumber)
      : await this.singleShotProgress(ctx.clinicId, session);
    return this.view(session, uploadedParts);
  }

  /**
   * A bounded window of presigned part URLs. `from`/`count` are clamped to the
   * session's own geometry: a client cannot ask for part 9999 of a three-part
   * upload, and it cannot ask for ten thousand URLs at once.
   */
  async partUrls(
    sessionId: string,
    query: UploadPartUrlsRequestDto,
  ): Promise<{ parts: PartUrl[]; totalParts: number }> {
    const ctx = this.scope.requireCtx();
    const session = await this.requireSession(sessionId);
    if (!session.uploadId) throw errors.validation({ session: "this upload is single-shot, not multipart" });
    if (query.from > session.totalParts) {
      throw errors.validation({ from: `upload has ${session.totalParts} parts` });
    }
    return {
      totalParts: session.totalParts,
      parts: await this.mintPartUrls(ctx.clinicId, session, query.from, query.count),
    };
  }

  /* ── complete ─────────────────────────────────────────────────────── */

  /**
   * Finish a multipart upload. Every declared part is verified against the
   * BUCKET first — presence, byte size and (when the client could read it) the
   * ETag — because `CompleteMultipartUpload` will happily assemble a truncated
   * object out of whatever parts exist, and the corruption then shows up later,
   * inside a clinical image.
   */
  async completeMultipart(sessionId: string, dto: UploadCompleteDto): Promise<CompleteResult> {
    const ctx = this.scope.requireCtx();
    const session = await this.requireSession(sessionId);
    if (!session.uploadId) throw errors.validation({ session: "this upload is single-shot, not multipart" });
    if (dto.parts.length !== session.totalParts) {
      throw errors.validation({ parts: `expected ${session.totalParts} parts, received ${dto.parts.length}` });
    }

    const inBucket = new Map(
      (await this.storage.listParts(ctx.clinicId, session.storageKey, session.uploadId)).map((p) => [p.partNumber, p]),
    );
    const verified: Array<{ partNumber: number; etag: string }> = [];
    for (const part of dto.parts) {
      const actual = inBucket.get(part.partNumber);
      if (!actual) throw errors.validation({ parts: `part ${part.partNumber} is not in the bucket` });
      const expected = partRange(part.partNumber, session.sizeBytes, session.partSizeBytes).bytes;
      if (actual.bytes !== expected) {
        throw errors.validation({ parts: `part ${part.partNumber} is ${actual.bytes} bytes, expected ${expected}` });
      }
      const claimed = part.etag?.replace(/"/g, "");
      if (claimed && claimed !== actual.etag) {
        throw errors.validation({ parts: `part ${part.partNumber} does not match the stored object` });
      }
      verified.push({ partNumber: part.partNumber, etag: actual.etag });
    }

    await this.storage.completeMultipartUpload(ctx.clinicId, session.storageKey, session.uploadId, verified);
    return this.runPipeline(session.galleryItemId, session);
  }

  /** Single-shot completion (the presigned PUT path). */
  async completeSingle(galleryItemId: string): Promise<CompleteResult> {
    const session = await this.findSessionForItem(galleryItemId);
    return this.runPipeline(galleryItemId, session);
  }

  /* ── abort ────────────────────────────────────────────────────────── */

  /**
   * Give everything back: the multipart upload in the bucket, the pending row,
   * the reserved bytes and the metered slot. An abort that only forgot the
   * session would keep charging the clinic for an image nobody has.
   */
  async abort(sessionId: string, reason: string): Promise<{ aborted: boolean }> {
    const ctx = this.scope.requireCtx();
    const closed = await this.scope.tx(async (tx, c) => {
      const session = await abortUploadSession(tx, c.clinicId, sessionId, c.userId, reason);
      if (!session) return null;
      await releaseQuota(tx, c.clinicId, "uploads", 1);
      await deletePendingGalleryItem(tx, c.clinicId, session.galleryItemId);
      return session;
    });
    if (!closed) return { aborted: false };
    if (closed.uploadId) {
      await this.storage
        .abortMultipartUpload(ctx.clinicId, closed.storageKey, closed.uploadId)
        .catch((err: unknown) => {
          // The bucket lifecycle rule is the backstop for exactly this case.
          logEvent("error", {
            event: "upload.abort_incomplete_failed",
            entity: "upload_session",
            entityId: closed.id,
            message: err instanceof Error ? err.message : String(err),
          });
        });
    }
    return { aborted: true };
  }

  /* ── internals ────────────────────────────────────────────────────── */

  private async requireSession(sessionId: string): Promise<UploadSessionRow> {
    const session = await this.scope.tx((tx, c) => getUploadSession(tx, c.clinicId, sessionId));
    if (!session) throw errors.notFound();
    if (session.state !== "open") throw errors.conflict("این نشست آپلود دیگر باز نیست");
    if (session.expiresAt.getTime() <= Date.now()) {
      throw errors.conflict("این نشست آپلود منقضی شده است");
    }
    return session;
  }

  private async findSessionForItem(galleryItemId: string): Promise<UploadSessionRow | null> {
    return this.scope.tx((tx, c) => findOpenUploadSession(tx, c.clinicId, galleryItemId));
  }

  private async mintPartUrls(
    clinicId: string,
    session: UploadSessionRow,
    from: number,
    count: number,
  ): Promise<PartUrl[]> {
    if (!session.uploadId) return [];
    const last = Math.min(session.totalParts, from + Math.min(count, UPLOAD_PART_URL_BATCH_MAX) - 1);
    const parts: PartUrl[] = [];
    for (let partNumber = from; partNumber <= last; partNumber++) {
      parts.push({
        partNumber,
        url: await this.storage.presignUploadPart(clinicId, session.storageKey, session.uploadId, partNumber),
        bytes: partRange(partNumber, session.sizeBytes, session.partSizeBytes).bytes,
      });
    }
    return parts;
  }

  /** A single-shot upload is either there or not — report it as part 1. */
  private async singleShotProgress(clinicId: string, session: UploadSessionRow): Promise<number[]> {
    const head = await this.storage.headObject(clinicId, session.storageKey);
    return head && head.bytes > 0 ? [1] : [];
  }

  private view(session: UploadSessionRow, uploadedParts: number[]): UploadSessionView {
    return {
      sessionId: session.id,
      galleryItemId: session.galleryItemId,
      sizeBytes: session.sizeBytes,
      partSizeBytes: session.partSizeBytes,
      totalParts: session.totalParts,
      multipart: session.uploadId !== null,
      state: session.state,
      expiresAt: session.expiresAt.toISOString(),
      uploadedParts,
    };
  }

  /**
   * The server-side gauntlet: HEAD, magic bytes, EXIF-strip/auto-orient,
   * resolution cap, quality gate, thumbnail. Everything expensive runs inside the
   * image semaphore, and every refusal path refunds the metered slot.
   */
  private async runPipeline(galleryItemId: string, session: UploadSessionRow | null): Promise<CompleteResult> {
    const ctx = this.scope.requireCtx();
    const item = await this.scope.tx((tx, c) => getGalleryItem(tx, c.clinicId, galleryItemId));
    if (!item || item.uploadState !== "pending") throw errors.notFound();

    // 1) size, from the bucket — before a single byte enters this process (H12)
    const head = await this.storage.headObject(ctx.clinicId, item.storageKey);
    if (!head || head.bytes === 0) {
      await this.reject(item.id, session, null);
      throw errors.invalidImage();
    }
    if (head.bytes > UPLOAD_MAX_BYTES || (session && head.bytes > session.sizeBytes)) {
      await this.reject(item.id, session, null);
      throw errors.validation({ sizeBytes: head.bytes });
    }

    // 2) magic bytes from a 32 byte range read, not from a full download
    let sniffed: string | null = null;
    try {
      sniffed = sniffImageMime(await this.storage.getObjectRange(ctx.clinicId, item.storageKey));
    } catch {
      sniffed = null;
    }
    if (!sniffed || sniffed !== MIME_TO_KIND[item.mime]) {
      await this.reject(item.id, session, null);
      throw errors.invalidImage();
    }

    const baseDir = item.storageKey.split("/").slice(0, -1).join("/");
    const canonicalRest = `${baseDir}/original.jpg`;
    const thumbRest = `${baseDir}/thumb.jpg`;
    const maxPixels = Math.max(1_000_000, Math.round(envNumber("IMAGE_MAX_PIXELS", 50_000_000)));

    try {
      const decoded = await imageWorkGate().run(async () => {
        const { stream } = await this.storage.getObjectStream(ctx.clinicId, item.storageKey, UPLOAD_MAX_BYTES);
        const transformer = sharp({ limitInputPixels: maxPixels, sequentialRead: true })
          .rotate()
          .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 });
        stream.on("error", (err: Error) => transformer.destroy(err));
        const processed = await stream.pipe(transformer).toBuffer();
        const meta = await sharp(processed).metadata();
        const grayRaw = await sharp(processed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const gray = rgbaToGray(grayRaw.data, grayRaw.info.width, grayRaw.info.height);
        const verdict = computeQuality(gray);
        const thumb =
          verdict.status === "reject"
            ? null
            : await sharp(processed)
                .resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside" })
                .jpeg({ quality: 75 })
                .toBuffer();
        return { processed, meta, verdict, thumb };
      });

      if (decoded.verdict.status === "reject" || decoded.thumb === null) {
        await this.reject(item.id, session, decoded.verdict.reasons);
        throw errors.qualityFail(decoded.verdict.reasons);
      }
      const thumb = decoded.thumb;

      await this.storage.putBuffer(ctx.clinicId, canonicalRest, decoded.processed, "image/jpeg");
      await this.storage.putBuffer(ctx.clinicId, thumbRest, thumb, "image/jpeg");
      if (item.storageKey !== canonicalRest) {
        await this.storage.removeObject(ctx.clinicId, item.storageKey).catch(() => undefined);
      }

      const sha256 = createHash("sha256").update(decoded.processed).digest("hex");
      const done = await this.scope.tx(async (tx, c) => {
        const row = await completeGalleryItem(tx, c.clinicId, item.id, {
          storageKey: canonicalRest,
          thumbKey: thumbRest,
          sha256,
          quality: { status: "pass", metrics: decoded.verdict.metrics },
          sizeBytes: decoded.processed.length,
          thumbBytes: thumb.length,
          userId: c.userId,
        });
        if (row && session) await completeUploadSession(tx, c.clinicId, session.id, c.userId);
        return row;
      });
      if (!done) throw errors.notFound();

      return {
        id: done.id,
        state: done.uploadState,
        width: decoded.meta.width ?? null,
        height: decoded.meta.height ?? null,
        quality: decoded.verdict.metrics,
        sha256,
        sizeBytes: decoded.processed.length,
      };
    } catch (err) {
      if (typeof (err as { status?: number }).status === "number") throw err; // handled refusals keep their contract
      if (err instanceof ObjectTooLargeError) {
        await this.reject(item.id, session, null);
        throw errors.validation({ sizeBytes: err.bytes });
      }
      await this.reject(item.id, session, null);
      throw errors.invalidImage();
    }
  }

  /**
   * Remove the raw object, drop the pending row, close the session and refund the
   * metered slot. A clinic must not pay a monthly upload for an image the server
   * itself refused.
   */
  private async reject(
    galleryItemId: string,
    session: UploadSessionRow | null,
    reasons: string[] | null,
  ): Promise<void> {
    const ctx = this.scope.requireCtx();
    if (session?.uploadId) {
      await this.storage
        .abortMultipartUpload(ctx.clinicId, session.storageKey, session.uploadId)
        .catch(() => undefined);
    }
    await this.scope
      .tx(async (tx, c) => {
        await deletePendingGalleryItem(tx, c.clinicId, galleryItemId);
        if (session) await abortUploadSession(tx, c.clinicId, session.id, c.userId, reasons ? "quality" : "invalid");
        await releaseQuota(tx, c.clinicId, "uploads", 1);
      })
      .catch((err: unknown) => {
        logEvent("error", {
          event: "upload.reject_cleanup_failed",
          entity: "gallery_item",
          entityId: galleryItemId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
  }
}
