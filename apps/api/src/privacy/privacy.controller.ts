import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from "@nestjs/common";
import {
  PurgeDecision,
  PurgeRequestCreate,
  RetentionPolicyUpsert,
  errors,
  type PurgeDecisionDto,
  type PurgeRequestCreateDto,
  type RetentionPolicyUpsertDto,
} from "@scalpai/shared";
import {
  approvePurge,
  auditInclusionProof,
  claimStorageOrphans,
  countOpenOrphans,
  executePurge,
  generateClinicAuditAnchor,
  listPurgeRequests,
  markStorageOrphanDeleted,
  markStorageOrphanFailed,
  reconcileStorage,
  rejectPurge,
  requestPurge,
  upsertRetentionPolicy,
  verifyChain,
} from "@scalpai/db";
import { Roles } from "../common/roles.guard.js";
import { ZodBodyPipe } from "../common/zod.pipe.js";
import { logEvent } from "../common/logging.js";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { StorageService } from "../media/storage.service.js";

const ORPHAN_BATCH = 50;

/**
 * Privacy operations (فاز ۶ — ADR-0038).
 *
 * Everything here is owner-only and everything here writes an audit row. These
 * are the surfaces that turn phase 6's promises into things an auditor can run:
 * verify the chain, publish a signed Merkle anchor, prove one row's inclusion,
 * request/approve/execute a patient purge, and reconcile the bucket against the
 * database.
 */
@Controller("privacy")
export class PrivacyController {
  constructor(private scope: TenantScope, private storage: StorageService) {}

  /* ── audit evidence (H17) ─────────────────────────────────────────── */

  @Get("audit/verify")
  @Roles("owner")
  async verify(): Promise<{ ok: boolean }> {
    const ok = await this.scope.tx((tx, ctx) => verifyChain(tx, ctx.clinicId));
    return { ok };
  }

  /**
   * Publish an anchor. Refuses (500 → surfaced as an error) when the chain does
   * not verify: a signed root over tampered rows is worse than no root.
   */
  @Post("audit/anchor")
  @Roles("owner")
  @HttpCode(HttpStatus.CREATED)
  async anchor(): Promise<unknown> {
    const signed = await this.scope.tx((tx, ctx) => generateClinicAuditAnchor(tx, ctx.clinicId));
    if (!signed) throw errors.notFound();
    logEvent("info", {
      event: "audit.anchored",
      clinicId: signed.anchor.clinicId,
      count: signed.anchor.treeSize,
      keyId: signed.keyId ?? undefined,
    });
    return {
      merkleRoot: signed.anchor.merkleRoot,
      treeSize: signed.anchor.treeSize,
      lastLogId: signed.anchor.lastLogId,
      createdAt: signed.anchor.createdAt,
      signed: signed.signature !== null,
      keyId: signed.keyId,
      wormUri: signed.wormUri,
    };
  }

  /** Inclusion proof for a single audit row — verifiable against a published root. */
  @Get("audit/:logId/proof")
  @Roles("owner")
  async proof(@Param("logId") logId: string): Promise<unknown> {
    const id = Number(logId);
    if (!Number.isInteger(id) || id <= 0) throw errors.validation({ logId: "must be a positive integer" });
    const result = await this.scope.tx((tx, ctx) => auditInclusionProof(tx, ctx.clinicId, id));
    if (!result) throw errors.notFound();
    return result;
  }

  /* ── retention + purge (M21) ──────────────────────────────────────── */

  @Put("retention")
  @Roles("owner")
  async setRetention(
    @Body(new ZodBodyPipe(RetentionPolicyUpsert)) dto: RetentionPolicyUpsertDto,
  ): Promise<{ saved: true }> {
    await this.scope.tx((tx, ctx) =>
      upsertRetentionPolicy(tx, ctx.clinicId, ctx.userId, {
        entity: dto.entity,
        retainDays: dto.retainDays,
        graceDays: dto.graceDays,
      }),
    );
    return { saved: true };
  }

  @Get("purge")
  @Roles("owner")
  listPurges(@Query("state") state?: string) {
    return this.scope.tx((tx, ctx) => listPurgeRequests(tx, ctx.clinicId, state));
  }

  @Post("purge")
  @Roles("owner")
  @HttpCode(HttpStatus.CREATED)
  requestPurge(@Body(new ZodBodyPipe(PurgeRequestCreate)) dto: PurgeRequestCreateDto) {
    return this.scope.tx((tx, ctx) => requestPurge(tx, ctx.clinicId, ctx.userId, dto));
  }

  /** Two-person rule: a different owner has to sign off (also a DB CHECK). */
  @Post("purge/:id/approve")
  @Roles("owner")
  @HttpCode(HttpStatus.OK)
  approve(@Param("id") id: string) {
    return this.scope.tx((tx, ctx) => approvePurge(tx, ctx.clinicId, ctx.userId, id));
  }

  @Post("purge/:id/reject")
  @Roles("owner")
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(PurgeDecision)) dto: PurgeDecisionDto,
  ): Promise<{ rejected: true }> {
    await this.scope.tx((tx, ctx) => rejectPurge(tx, ctx.clinicId, ctx.userId, id, dto.reason ?? "no reason given"));
    return { rejected: true };
  }

  /**
   * Destroy the data and drain the objects it referenced. The DB work is one
   * transaction; the bucket deletes run afterwards through the orphan queue, so a
   * failing object delete is retried instead of leaving a half-purged patient.
   */
  @Post("purge/:id/execute")
  @Roles("owner")
  @HttpCode(HttpStatus.OK)
  async execute(@Param("id") id: string): Promise<unknown> {
    const evidence = await this.scope.tx((tx, ctx) => executePurge(tx, ctx.clinicId, ctx.userId, id));
    const drained = await this.drainOrphans();
    logEvent("warn", {
      event: "privacy.purge_executed",
      entity: "purge_request",
      entityId: id,
      count: evidence.objectsQueued,
    });
    return { ...evidence, objectsDeleted: drained.deleted, objectsFailed: drained.failed };
  }

  /* ── storage reconciliation (M22) ─────────────────────────────────── */

  @Post("storage/reconcile")
  @Roles("owner")
  @HttpCode(HttpStatus.OK)
  async reconcile(): Promise<unknown> {
    const ctx = this.scope.requireCtx();
    const listed = await this.storage.listClinicObjects(ctx.clinicId);
    const report = await this.scope.tx((tx, c) => reconcileStorage(tx, c.clinicId, c.userId, listed));
    const drained = await this.drainOrphans();
    const open = await this.scope.tx((tx, c) => countOpenOrphans(tx, c.clinicId));
    return {
      listed: listed.length,
      orphans: report.orphanKeys.length,
      // A referenced object missing from the bucket is data loss, not garbage:
      // it is reported, never "cleaned up".
      missing: report.missingKeys.length,
      deleted: drained.deleted,
      failed: drained.failed,
      stillOpen: open,
    };
  }

  /**
   * Claim → delete → record. A failure is written back with its error and
   * retried; after ORPHAN_MAX_ATTEMPTS the row is quarantined and audited. This
   * is the part that replaced `.catch(() => undefined)`.
   */
  private async drainOrphans(): Promise<{ deleted: number; failed: number }> {
    const ctx = this.scope.requireCtx();
    const batch = await this.scope.tx((tx, c) => claimStorageOrphans(tx, c.clinicId, ORPHAN_BATCH));
    let deleted = 0;
    let failed = 0;

    for (const row of batch) {
      try {
        await this.storage.removeObjectByKey(ctx.clinicId, row.storageKey);
        await this.scope.tx((tx, c) => markStorageOrphanDeleted(tx, c.clinicId, row.id));
        deleted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const state = await this.scope.tx((tx, c) => markStorageOrphanFailed(tx, c.clinicId, c.userId, row.id, message));
        failed++;
        logEvent("error", {
          event: "storage.orphan_delete_failed",
          entity: "storage_orphan",
          entityId: row.id,
          reason: state,
          message,
        });
      }
    }
    return { deleted, failed };
  }
}
