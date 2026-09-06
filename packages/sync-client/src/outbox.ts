import {
  FLUSH_BATCH_SIZE,
  FLUSH_MAX_ROUNDS,
  OUTBOX_MAX_ATTEMPTS,
  retryDelayMs,
  type EntityName,
  type Op,
} from "./contract.js";
import {
  PermanentPushError,
  makeMutation,
  newMutationId,
  type MutationEnvelope,
  type PushItemResult,
} from "./mutation.js";

/**
 * One queued mutation plus its retry bookkeeping (WEAKNESSES C9). The retry
 * state travels WITH the record, so a reload does not reset the backoff and a
 * poison message cannot be retried forever.
 */
export interface OutboxItem {
  envelope: MutationEnvelope;
  attempts: number;
  /** epoch ms — the item is invisible to `takeBatch` until then */
  nextAttemptAt: number;
  lastError: string | null;
}

/**
 * Durable adapter seam. Every method touches ONE record (or an explicit id list):
 * the old adapter rewrote the whole queue with `clear() + bulkAdd()`, which is a
 * window where a crash loses every pending mutation.
 */
export interface OutboxStore {
  put(item: OutboxItem): Promise<void>;
  remove(ids: string[]): Promise<void>;
  deadLetter(item: OutboxItem, reason: string): Promise<void>;
}

export type FlushStop = "drained" | "max-rounds" | "backoff" | "transport";

export interface FlushReport {
  applied: number;
  duplicate: number;
  rejected: number;
  retried: number;
  dead: number;
  rounds: number;
  stopped: FlushStop;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return String(error).slice(0, 300);
}

export class Outbox {
  private items: OutboxItem[] = [];
  private seen = new Set<string>();

  constructor(
    private store?: OutboxStore,
    private clock: () => number = () => Date.now(),
  ) {}

  async enqueue(
    entity: EntityName,
    op: Op,
    payload: Record<string, unknown>,
    baseVersion?: number | null,
  ): Promise<MutationEnvelope> {
    const envelope = makeMutation(entity, op, payload, baseVersion ?? null);
    if (this.seen.has(envelope.clientMutationId)) throw new Error("clientMutationId collision");
    const item: OutboxItem = { envelope, attempts: 0, nextAttemptAt: this.clock(), lastError: null };
    this.seen.add(envelope.clientMutationId);
    this.items.push(item);
    await this.store?.put(item);
    return envelope;
  }

  /** Re-register ids after a reload (dedupe guarantee across sessions). */
  restore(items: OutboxItem[]): void {
    this.items = [...items];
    this.seen = new Set(items.map((i) => i.envelope.clientMutationId));
  }

  snapshot(): OutboxItem[] {
    return this.items.map((i) => ({ ...i }));
  }

  get size(): number {
    return this.items.length;
  }

  /** Items whose backoff has elapsed. */
  ready(now: number = this.clock()): OutboxItem[] {
    return this.items.filter((i) => i.nextAttemptAt <= now);
  }

  /** Drains up to `batch` ready items, oldest-first. */
  takeBatch(batch: number = FLUSH_BATCH_SIZE, now: number = this.clock()): MutationEnvelope[] {
    return this.ready(now)
      .slice(0, batch)
      .map((i) => i.envelope);
  }

  /** Remove settled envelopes (applied or already-known duplicates). */
  async ack(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const done = new Set(ids);
    this.items = this.items.filter((i) => !done.has(i.envelope.clientMutationId));
    for (const id of done) this.seen.delete(id);
    await this.store?.remove([...done]);
  }

  /**
   * A permanent refusal: the server understood the mutation and said no. Retrying
   * identical bytes cannot change that, so it goes straight to the dead letter
   * queue where a human (or the inspector UI) can see it.
   */
  async reject(id: string, reason: string): Promise<boolean> {
    const item = this.items.find((i) => i.envelope.clientMutationId === id);
    if (!item) return false;
    this.items = this.items.filter((i) => i.envelope.clientMutationId !== id);
    this.seen.delete(id);
    await this.store?.deadLetter({ ...item, lastError: reason }, reason);
    return true;
  }

  /** A transport failure: count the attempt, back off, give up after the cap. */
  async fail(ids: string[], reason: string): Promise<{ retried: string[]; dead: string[] }> {
    const retried: string[] = [];
    const dead: string[] = [];
    const now = this.clock();
    for (const id of ids) {
      const item = this.items.find((i) => i.envelope.clientMutationId === id);
      if (!item) continue;
      item.attempts += 1;
      item.lastError = reason;
      if (item.attempts >= OUTBOX_MAX_ATTEMPTS) {
        this.items = this.items.filter((i) => i.envelope.clientMutationId !== id);
        this.seen.delete(id);
        await this.store?.deadLetter({ ...item }, `${reason} (after ${item.attempts} attempts)`);
        dead.push(id);
        continue;
      }
      item.nextAttemptAt = now + retryDelayMs(item.attempts);
      await this.store?.put({ ...item });
      retried.push(id);
    }
    return { retried, dead };
  }

  static freshId(): string {
    return newMutationId();
  }
}

/**
 * Push the queue in BOUNDED rounds (C9). Every exit is named in the report, so
 * "nothing synced" is never a mystery: drained, waiting on backoff, out of
 * rounds, or the transport is down.
 */
export async function flushOutbox(
  outbox: Outbox,
  push: (mutations: MutationEnvelope[]) => Promise<PushItemResult[]>,
  opts: { maxRounds?: number; batchSize?: number; now?: () => number } = {},
): Promise<FlushReport> {
  const maxRounds = opts.maxRounds ?? FLUSH_MAX_ROUNDS;
  const batchSize = opts.batchSize ?? FLUSH_BATCH_SIZE;
  const clock = opts.now ?? (() => Date.now());
  const report: FlushReport = {
    applied: 0,
    duplicate: 0,
    rejected: 0,
    retried: 0,
    dead: 0,
    rounds: 0,
    stopped: "drained",
  };

  for (let round = 0; round < maxRounds; round++) {
    const batch = outbox.takeBatch(batchSize, clock());
    if (batch.length === 0) {
      report.stopped = outbox.size > 0 ? "backoff" : "drained";
      return report;
    }
    report.rounds += 1;
    const ids = batch.map((m) => m.clientMutationId);

    let results: PushItemResult[];
    try {
      results = await push(batch);
    } catch (error) {
      if (error instanceof PermanentPushError) {
        // The request itself is invalid: retrying it 5 times only delays the truth.
        for (const id of ids) {
          report.rejected += 1;
          if (await outbox.reject(id, errorMessage(error))) report.dead += 1;
        }
        report.stopped = "transport";
        return report;
      }
      const outcome = await outbox.fail(ids, errorMessage(error));
      report.retried += outcome.retried.length;
      report.dead += outcome.dead.length;
      report.stopped = "transport";
      return report;
    }

    const byId = new Map(results.map((r) => [r.clientMutationId, r]));
    const settled: string[] = [];
    for (const envelope of batch) {
      const id = envelope.clientMutationId;
      const result = byId.get(id);
      if (!result) {
        // The server answered, but not about this item — treat as retryable.
        const outcome = await outbox.fail([id], "server returned no result for this mutation");
        report.retried += outcome.retried.length;
        report.dead += outcome.dead.length;
        continue;
      }
      if (result.status === "applied") {
        report.applied += 1;
        settled.push(id);
        continue;
      }
      if (result.status === "duplicate") {
        report.duplicate += 1;
        settled.push(id);
        continue;
      }
      report.rejected += 1;
      if (await outbox.reject(id, result.reason ?? "rejected by server")) report.dead += 1;
    }
    await outbox.ack(settled);
  }

  report.stopped = "max-rounds";
  return report;
}
