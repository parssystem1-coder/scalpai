import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { SyncPush, type SyncPushDto } from "@scalpai/shared";
import { processPushBatch, pullSince } from "@scalpai/db";
import { RateLimit } from "./common/rate-limit.guard.js";
import { Roles } from "./common/roles.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { TenantScope } from "./tenancy/tenant.scope.js";

/**
 * §8 Sync API — idempotent push + cursor-based pull. Every mutation is
 * processed within a single transaction for atomicity. The mutation ledger
 * is the source of truth for delta syncs.
 *
 * Both routes carry a per-clinic rate budget (WEAKNESSES L4): a looping client
 * must not be able to monopolise the pool for the other tenants.
 */
@Controller("sync")
export class SyncController {
  constructor(private scope: TenantScope) {}

  /** §8.2: batch push — per-item idempotent (clientMutationId dedup). */
  @Post("push")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("sync-push", 240)
  async push(@Body(new ZodBodyPipe(SyncPush)) dto: SyncPushDto) {
    const results = await this.scope.tx(async (tx, ctx) => {
      return processPushBatch({ tx, clinicId: ctx.clinicId, userId: ctx.userId }, dto.mutations as unknown as Parameters<typeof processPushBatch>[1][0][]);
    });
    return { results };
  }

  /** §8.2: cursor-based pull — returns mutations since a given server sequence. */
  @Get("pull")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("sync-pull", 300)
  async pull(
    @Query("sinceSeq") sinceSeq: string = "0",
    @Query("limit") limit: string = "100",
  ) {
    const seq = Math.max(0, parseInt(sinceSeq, 10) || 0);
    const batchSize = Math.min(Math.max(1, parseInt(limit, 10) || 100), 1000);
    const result = await this.scope.tx(async (tx, ctx) => {
      return pullSince(tx, ctx.clinicId, seq, batchSize);
    });
    return result;
  }
}
