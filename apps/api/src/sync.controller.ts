import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { SyncPush, type SyncPushDto } from "@scalpai/shared";
import { SyncCursorError, processPushBatch, pullMutations } from "@scalpai/db";
import { RateLimit } from "./common/rate-limit.guard.js";
import { Roles } from "./common/roles.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * §8 Sync API — idempotent push + cursor-based pull.
 *
 * Phase 7 (ADR-0039):
 *  - push is per-item isolated with savepoints, so one refused mutation no longer
 *    rolls back the batch around it (H4);
 *  - pull takes an OPAQUE cursor built from (commit transaction id, server_seq).
 *    A pre-commit sequence number was skippable: a slow writer could commit
 *    behind a cursor that had already moved on (H5).
 *
 * Both routes carry a per-clinic rate budget (WEAKNESSES L4): a looping client
 * must not be able to monopolise the pool for the other tenants.
 */
@Controller("sync")
export class SyncController {
  constructor(private scope: TenantScope) {}

  /** §8.2: batch push — per-item idempotent (clientMutationId dedup per clinic). */
  @Post("push")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("sync-push", 240)
  async push(@Body(new ZodBodyPipe(SyncPush)) dto: SyncPushDto) {
    const results = await this.scope.tx(async (tx, ctx) => {
      return processPushBatch({ tx, clinicId: ctx.clinicId, userId: ctx.userId }, dto.mutations as unknown as Parameters<typeof processPushBatch>[1][0][]);
    });
    return { results };
  }

  /** §8.2: cursor-based pull — commit-safe, so nothing is ever skipped. */
  @Get("pull")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("sync-pull", 300)
  async pull(@Query("cursor") cursor?: string, @Query("limit") limit?: string) {
    const batchSize = Math.min(Math.max(1, Number.parseInt(limit ?? "100", 10) || 100), 500);
    try {
      return await this.scope.tx((tx, ctx) => pullMutations(tx, ctx.clinicId, cursor ?? "0:0", batchSize));
    } catch (err) {
      // A malformed cursor must be loud: silently resetting to zero would replay
      // the entire ledger on every poll.
      if (err instanceof SyncCursorError) {
        throw new BadRequestException({ code: "SYNC_CURSOR_INVALID", message: "مقدار cursor نامعتبر است" });
      }
      throw err;
    }
  }
}
