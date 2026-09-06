import { Outbox, type MutationEnvelope } from "@scalpai/sync-client";
import { redactPhiPayload } from "@scalpai/shared";
import { db, type OutboxRecord } from "./db.js";

/** Wire sync-client's Outbox to Dexie persistence (ADR-0027). */
export function createDexieAdapter() {
  return async (items: MutationEnvelope[]) => {
    const records: OutboxRecord[] = items.map((m, i) => ({
      id: m.clientMutationId,
      seq: i,
      entity: m.entity,
      op: m.op,
      schemaVersion: m.schemaVersion,
      clientUpdatedAt: m.clientUpdatedAt,
      baseVersion: m.baseVersion ?? null,
      // IndexedDB is not a secret store: keep the same redacted delta that the
      // server ledger will receive. Ciphertext survives; readable notes do not.
      payload: JSON.stringify(redactPhiPayload(m.payload)),
      createdAt: Date.now() + i,
    }));
    await db.transaction("rw", db.outbox, async () => {
      await db.outbox.clear();
      await db.outbox.bulkAdd(records);
    });
  };
}

/** Rehydrate an Outbox from IndexedDB on page load. */
export async function rehydrateOutbox(outbox: Outbox): Promise<void> {
  const records = await db.outbox.orderBy("createdAt").toArray();
  const envelopes: MutationEnvelope[] = records.map((r) => ({
    clientMutationId: r.id,
    entity: r.entity as MutationEnvelope["entity"],
    op: r.op as MutationEnvelope["op"],
    schemaVersion: r.schemaVersion,
    clientUpdatedAt: r.clientUpdatedAt,
    baseVersion: r.baseVersion,
    payload: JSON.parse(r.payload),
  }));
  outbox.restore(envelopes);
}

/** Flush the outbox: push batch to server and ack. */
export async function flushOutbox(
  outbox: Outbox,
  push: (mutations: MutationEnvelope[]) => Promise<{ clientMutationId: string; status: string }[]>,
): Promise<number> {
  let flushed = 0;
  const BATCH = 20;
  while (outbox.size > 0) {
    const batch = outbox.takeBatch(BATCH);
    const results = await push(batch);
    const acked = results.filter((r) => r.status === "applied" || r.status === "duplicate").map((r) => r.clientMutationId);
    outbox.ack(acked);
    flushed += acked.length;
    await db.outbox.bulkDelete(acked).catch(() => {});
  }
  return flushed;
}
