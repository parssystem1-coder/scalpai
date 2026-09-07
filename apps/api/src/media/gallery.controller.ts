import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import {
  GalleryPageQuery,
  UploadComplete,
  UploadInit,
  UploadPartUrlsRequest,
  errors,
  type UploadCompleteDto,
  type UploadInitDto,
  type UploadPartUrlsRequestDto,
} from "@scalpai/shared";
import { listGalleryByPatient, softDeleteGalleryItem } from "@scalpai/db";
import { RateLimit } from "../common/rate-limit.guard.js";
import { Roles } from "../common/roles.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { StorageService } from "./storage.service.js";
import { UploadService } from "./upload.service.js";

/**
 * Media pipeline (playbook 2.1) — phase 8 shape (ADR-0041).
 *
 * The controller is deliberately thin now: opening, resuming, completing and
 * aborting an upload all live in `UploadService`, because each of them has to
 * touch quota, the object store and the session row together and getting that
 * ordering wrong is what H7/H11 were.
 *
 * The old `init-multipart` / `complete-multipart` pair is GONE rather than kept
 * as a compatibility shim: it minted every presigned URL up front and accepted an
 * unvalidated `{ uploadId, parts }` body, so leaving it in place would have left a
 * second, unbounded way in.
 *
 * Every entry point carries a per-clinic rate budget (L4) on top of the plan
 * quota, and the decode itself runs behind the process-wide image semaphore.
 */
@Controller()
export class GalleryController {
  constructor(
    private scope: TenantScope,
    private storage: StorageService,
    private uploads: UploadService,
  ) {}

  /**
   * Open an upload. Small files get a single presigned PUT; anything over the
   * multipart threshold gets a session plus its FIRST window of part URLs.
   *
   * No `@Quota("uploads")` here, on purpose. Nest runs guards BEFORE pipes, so the
   * decorator refused a request the body schema had not even looked at yet: a
   * `sizeBytes` over the 50MB contract came back as 403 QUOTA_EXCEEDED instead of
   * 400 VALIDATION_ERROR, which tells the client to buy a bigger plan for a file
   * no plan will ever accept. The upload slot AND the storage bytes are taken
   * atomically inside the handler's own transaction under a row lock
   * (`consumeQuota` / `reserveStorageBytes`, ADR-0041 §5) — that is the binding
   * check, and the guard was only ever an optimisation in front of it.
   */
  @Post("patients/:pid/gallery/uploads")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("upload", 120)
  @HttpCode(HttpStatus.CREATED)
  open(@Param("pid") pid: string, @Body(new ZodBodyPipe(UploadInit)) dto: UploadInitDto) {
    return this.uploads.open(pid, dto);
  }

  /**
   * Resume: what does the BUCKET already have? The client sends only the parts
   * missing from this answer, which is the whole point of H7.
   */
  @Get("gallery/uploads/:sid")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("upload-status", 600)
  status(@Param("sid") sid: string) {
    return this.uploads.status(sid);
  }

  /** A bounded window of fresh presigned part URLs (expired ones are re-asked). */
  @Post("gallery/uploads/:sid/parts")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("upload-parts", 600)
  @HttpCode(HttpStatus.OK)
  parts(
    @Param("sid") sid: string,
    @Body(new ZodBodyPipe(UploadPartUrlsRequest)) dto: UploadPartUrlsRequestDto,
  ) {
    return this.uploads.partUrls(sid, dto);
  }

  @Post("gallery/uploads/:sid/complete")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("upload", 120)
  @HttpCode(HttpStatus.OK)
  complete(@Param("sid") sid: string, @Body(new ZodBodyPipe(UploadComplete)) dto: UploadCompleteDto) {
    return this.uploads.completeMultipart(sid, dto);
  }

  /** Abandon an upload: bucket parts, pending row, reserved bytes and slot back. */
  @Delete("gallery/uploads/:sid")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("upload", 120)
  abort(@Param("sid") sid: string) {
    return this.uploads.abort(sid, "client aborted");
  }

  /** Single-shot completion for the presigned-PUT path. */
  @Post("gallery/:gid/complete")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("upload", 120)
  @HttpCode(HttpStatus.OK)
  completeSingle(@Param("gid") gid: string) {
    return this.uploads.completeSingle(gid);
  }

  @Get("patients/:pid/gallery")
  @Roles("owner", "trichologist", "receptionist")
  async list(
    @Param("pid") pid: string,
    @Query(new ZodBodyPipe(GalleryPageQuery)) q: { limit: number; cursor?: string },
  ): Promise<unknown> {
    const ctx = this.scope.requireCtx();
    const page = await this.scope.tx((tx) =>
      listGalleryByPatient(tx, ctx.clinicId, pid, { limit: q.limit, cursor: q.cursor }),
    );
    // Presigned view URLs are minted per-request and expire in minutes — images
    // are never proxied through the API nor embedded as base64, and the key shape
    // is asserted again on the way out (C1).
    const items = await Promise.all(
      page.items.map(async (it) => ({
        id: it.id,
        createdAt: it.createdAt,
        quality: it.quality,
        viewUrl: it.storageKey ? await this.storage.presignMediaGet(ctx.clinicId, it.storageKey) : null,
        thumbUrl: it.thumbKey ? await this.storage.presignMediaGet(ctx.clinicId, it.thumbKey) : null,
      })),
    );
    return { items, nextCursor: page.nextCursor };
  }

  @Delete("gallery/:gid")
  @Roles("owner", "trichologist")
  async remove(@Param("gid") gid: string): Promise<{ deleted: boolean }> {
    const ok = await this.scope.tx((tx, ctx) => softDeleteGalleryItem(tx, ctx.clinicId, ctx.userId, gid));
    if (!ok) throw errors.notFound();
    return { deleted: true };
  }
}
