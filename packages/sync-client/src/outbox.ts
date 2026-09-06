import { makeMutation, newMutationId, type MutationEnvelope } from "./mutation.js";

/**
 * In-memory Outbox with durable-adapter seam. P3 wires a Dexie adapter into
 * `persist`/`restore`; core stays storage-free and fully unit-testable.
 */
export class Outbox {
  private queue: MutationEnvelope[] = [];
  private seen = new Set<string>();

  constructor(private persist?: (items: MutationEnvelope[]) => Promise<void>) {}

  async enqueue(entity: Parameters<typeof makeMutation>[0], op: Parameters<typeof makeMutation>[1], payload: Record<string, unknown>, baseVersion?: string | null): Promise<MutationEnvelope> {
    const m = makeMutation(entity, op, payload, baseVersion);
    if (this.seen.has(m.clientMutationId)) throw new Error("clientMutationId collision");
    this.seen.add(m.clientMutationId);
    this.queue.push(m);
    await this.persist?.(this.queue);
    return m;
  }

  /** Re-register ids after page reload (dedupe guarantee across sessions). */
  restore(items: MutationEnvelope[]): void {
    for (const it of items) this.seen.add(it.clientMutationId);
    this.queue = items;
  }

  get size(): number {
    return this.queue.length;
  }

  /** Drains up to `batch` items oldest-first for push. */
  takeBatch(batch: number): MutationEnvelope[] {
    return this.queue.slice(0, batch);
  }

  /** Remove successfully pushed envelopes by id. */
  ack(ids: string[]): void {
    const done = new Set(ids);
    this.queue = this.queue.filter((m) => !done.has(m.clientMutationId));
  }

  /** Re-insert rejected/stale items at the FRONT (retry after pull). */
  unshift(items: MutationEnvelope[]): void {
    this.queue = [...items, ...this.queue];
  }

  static freshId(): string {
    return newMutationId();
  }
}
