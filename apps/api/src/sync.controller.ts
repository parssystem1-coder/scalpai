import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { SyncPushEnvelope, type SyncPushEnvelopeDto } from "@scalpai/shared";
import { SyncCursorError, processPushBatch, pullMutations } from "@scalpai/db";
import type { PushItemResult } from "@scalpai/sync-client";
import { RateLimit } from "./common/rate-limit.guard.js";
import { Roles } from "./common/roles.guard.js";
import { ZodBodyPipe } from "./common/zod.pipe.js";
import { acceptedMutations, splitSyncBatch } from "./sync.batch.js";
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
 * Phase 7.1 (ADR-0040): VALIDATION is per item too. Isolating the writes was
 * only half the fix — the contract check still ran over the whole body, so one
 * malformed envelope 400'd the request before any savepoint existed and the
 * client dead-lettered the entire batch.
 *
 * Both routes carry a per-clinic rate budget (WEAKNESSES L4): a looping client
 * must not be able to monopolise the pool for the other tenants.
 */
@Controller("sync")
export class SyncController {
  constructor(private scope: TenantScope) {}

  /** §8.2: batch push — per-item validated AND per-item idempotent (per clinic). */
  @Post("push")
  @Roles("owner", "trichologist", "receptionist")
  @RateLimit("sync-push", 240)
  async push(@Body(new ZodBodyPipe(SyncPushEnvelope)) dto: SyncPushEnvelopeDto) {
    const split = splitSyncBatch(dto.mutations);

    // The ONLY batch-level refusal left: an item nobody can name. Answering
    // "rejected" without an id would leave the client unable to settle anything,
    // so this stays a 400 — and it names the offending indexes so the client can
    // dead-letter exactly those instead of guessing.
    if (split.unaddressable.length > 0) {
      throw new BadRequestException({
        code: "SYNC_MUTATION_UNADDRESSABLE",
        message: "هر mutation باید clientMutationId معتبر (uuid) داشته باشد",
        details: { scope: "batch", indexes: split.unaddressable },
      });
    }

    const accepted = acceptedMutations(split);
    const applied =
      accepted.length === 0
        ? []
        : await this.scope.tx(async (tx, ctx) => {
            return processPushBatch(
              { tx, clinicId: ctx.clinicId, userId: ctx.userId },
              accepted as unknown as Parameters<typeof processPushBatch>[1],
            );
          });

    const byId = new Map(applied.map((result) => [result.clientMutationId, result]));
    const results: PushItemResult[] = [];
    for (const entry of split.entries) {
      if (entry.kind === "refused") {
        results.push({ clientMutationId: entry.clientMutationId, status: "rejected", reason: entry.reason });
        continue;
      }
      const result = byId.get(entry.clientMutationId);
      // A missing answer is deliberately left out: the client treats an
      // unanswered mutation as retryable, which is safer than inventing a verdict.
      if (result) results.push(result);
    }
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
