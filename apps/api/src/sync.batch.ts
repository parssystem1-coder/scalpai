import { SyncMutation, SyncMutationRef, describeSyncIssues, type SyncMutationDto } from "@scalpai/shared";

/**
 * Per-item validation of a push batch (ADR-0040).
 *
 * Validating the body as a whole meant one bad envelope answered for twenty:
 * `ZodBodyPipe` threw, `processPushBatch` never ran and the client — which reads
 * a 400 as "the server will never accept this" — dead-lettered every id it had
 * just sent. Drift between client and server validation (a hand-restored outbox,
 * a schema change, an older build) was therefore enough to lose 19 valid
 * mutations because of the 20th.
 *
 * So the batch is split BEFORE the transaction opens:
 *  - an item that parses is applied and answered normally;
 *  - an item that does not parse is answered `rejected` with the field PATH that
 *    broke (never the value — a sync payload can carry PHI);
 *  - an item without a usable `clientMutationId` is unanswerable per item, and
 *    the caller turns that into the only remaining batch-level 400.
 */
export type SyncBatchEntry =
  | { kind: "accepted"; clientMutationId: string; mutation: SyncMutationDto }
  | { kind: "refused"; clientMutationId: string; reason: string };

export interface SyncBatchSplit {
  /** Every answerable item, in REQUEST order — the order results come back in. */
  entries: SyncBatchEntry[];
  /** Indexes of items that carry no usable idempotency key. */
  unaddressable: number[];
}

export function splitSyncBatch(raw: readonly unknown[]): SyncBatchSplit {
  const entries: SyncBatchEntry[] = [];
  const unaddressable: number[] = [];

  raw.forEach((candidate, index) => {
    const ref = SyncMutationRef.safeParse(candidate);
    if (!ref.success) {
      unaddressable.push(index);
      return;
    }
    const clientMutationId = ref.data.clientMutationId;
    const parsed = SyncMutation.safeParse(candidate);
    if (!parsed.success) {
      entries.push({ kind: "refused", clientMutationId, reason: describeSyncIssues(parsed.error.issues) });
      return;
    }
    entries.push({ kind: "accepted", clientMutationId, mutation: parsed.data });
  });

  return { entries, unaddressable };
}

/** The mutations that are safe to hand to `processPushBatch`, in request order. */
export function acceptedMutations(split: SyncBatchSplit): SyncMutationDto[] {
  const out: SyncMutationDto[] = [];
  for (const entry of split.entries) {
    if (entry.kind === "accepted") out.push(entry.mutation);
  }
  return out;
}
