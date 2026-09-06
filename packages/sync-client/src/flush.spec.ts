import { describe, expect, it } from "vitest";
import {
  OUTBOX_MAX_ATTEMPTS,
  Outbox,
  PermanentPushError,
  RETRY_MAX_DELAY_MS,
  flushOutbox,
  pullBackoffMs,
  retryDelayMs,
  type MutationEnvelope,
  type OutboxItem,
  type OutboxStore,
  type PushItemResult,
} from "./index.js";

const patient = (phone = "09120000000") => ({ firstName: "علی", lastName: "رضایی", phone });

function memoryStore() {
  const records = new Map<string, OutboxItem>();
  const dead: Array<{ id: string; reason: string; attempts: number }> = [];
  const store: OutboxStore = {
    async put(item) {
      records.set(item.envelope.clientMutationId, { ...item });
    },
    async remove(ids) {
      for (const id of ids) records.delete(id);
    },
    async deadLetter(item, reason) {
      records.delete(item.envelope.clientMutationId);
      dead.push({ id: item.envelope.clientMutationId, reason, attempts: item.attempts });
    },
  };
  return { store, records, dead };
}

const applied = (m: MutationEnvelope): PushItemResult => ({ clientMutationId: m.clientMutationId, status: "applied" });

describe("flushOutbox (WEAKNESSES C9)", () => {
  it("persists one record per mutation and drains them", async () => {
    const { store, records } = memoryStore();
    const ob = new Outbox(store);
    await ob.enqueue("patients", "create", patient("09120000001"));
    await ob.enqueue("patients", "create", patient("09120000002"));
    expect(records.size).toBe(2);

    const report = await flushOutbox(ob, async (batch) => batch.map(applied));
    expect(report.applied).toBe(2);
    expect(report.stopped).toBe("drained");
    expect(ob.size).toBe(0);
    expect(records.size).toBe(0);
  });

  it("treats a duplicate as settled, not as a failure", async () => {
    const { store } = memoryStore();
    const ob = new Outbox(store);
    await ob.enqueue("patients", "create", patient());
    const report = await flushOutbox(ob, async (batch) =>
      batch.map((m) => ({ clientMutationId: m.clientMutationId, status: "duplicate" as const })),
    );
    expect(report.duplicate).toBe(1);
    expect(ob.size).toBe(0);
  });

  it("dead-letters a refusal instead of pushing it forever", async () => {
    const { store, dead } = memoryStore();
    const ob = new Outbox(store);
    await ob.enqueue("patients", "create", patient());
    const report = await flushOutbox(ob, async (batch) =>
      batch.map((m) => ({ clientMutationId: m.clientMutationId, status: "rejected" as const, reason: "patient not found" })),
    );
    expect(report.rejected).toBe(1);
    expect(report.dead).toBe(1);
    expect(ob.size).toBe(0);
    expect(dead[0]!.reason).toBe("patient not found");
  });

  it("dead-letters immediately when the request itself is invalid", async () => {
    const { store, dead } = memoryStore();
    const ob = new Outbox(store);
    await ob.enqueue("patients", "create", patient());
    const report = await flushOutbox(ob, async () => {
      throw new PermanentPushError("VALIDATION_ERROR: bad envelope", 400);
    });
    expect(report.stopped).toBe("transport");
    expect(report.dead).toBe(1);
    expect(dead).toHaveLength(1);
    expect(ob.size).toBe(0);
  });

  it("backs off a transport failure and gives up at the attempt cap", async () => {
    let now = 1_000_000;
    const { store, dead, records } = memoryStore();
    const ob = new Outbox(store, () => now);
    await ob.enqueue("patients", "create", patient());

    const failing = async (): Promise<PushItemResult[]> => {
      throw new Error("network down");
    };

    const first = await flushOutbox(ob, failing, { now: () => now });
    expect(first.stopped).toBe("transport");
    expect(first.retried).toBe(1);
    expect(ob.snapshot()[0]!.attempts).toBe(1);
    expect(ob.snapshot()[0]!.nextAttemptAt).toBe(now + retryDelayMs(1));

    // still inside the backoff window: nothing is taken, nothing is retried
    const held = await flushOutbox(ob, failing, { now: () => now });
    expect(held.stopped).toBe("backoff");
    expect(held.rounds).toBe(0);

    for (let attempt = 2; attempt <= OUTBOX_MAX_ATTEMPTS; attempt++) {
      now += RETRY_MAX_DELAY_MS + 1;
      await flushOutbox(ob, failing, { now: () => now });
    }
    expect(ob.size).toBe(0);
    expect(records.size).toBe(0);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.reason).toContain("network down");
    expect(dead[0]!.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  it("is bounded: a full queue cannot spin forever", async () => {
    const { store } = memoryStore();
    const ob = new Outbox(store);
    for (let i = 0; i < 5; i++) await ob.enqueue("patients", "create", patient(`0912000000${i}`));
    const report = await flushOutbox(ob, async (batch) => batch.map(applied), { batchSize: 1, maxRounds: 2 });
    expect(report.rounds).toBe(2);
    expect(report.applied).toBe(2);
    expect(report.stopped).toBe("max-rounds");
    expect(ob.size).toBe(3);
  });

  it("retries an item the server did not answer about", async () => {
    const { store } = memoryStore();
    const ob = new Outbox(store);
    await ob.enqueue("patients", "create", patient());
    const report = await flushOutbox(ob, async () => []);
    expect(report.retried).toBe(1);
    expect(ob.size).toBe(1);
  });
});

describe("backoff curves", () => {
  it("grows exponentially and stays capped", () => {
    expect(retryDelayMs(1)).toBe(1_000);
    expect(retryDelayMs(2)).toBe(2_000);
    expect(retryDelayMs(3)).toBe(4_000);
    expect(retryDelayMs(50)).toBe(RETRY_MAX_DELAY_MS);
    expect(pullBackoffMs(0)).toBeLessThan(pullBackoffMs(1));
    expect(pullBackoffMs(99)).toBe(RETRY_MAX_DELAY_MS);
  });
});
