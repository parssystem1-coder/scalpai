import { describe, expect, it } from "vitest";
import {
  OUTBOX_MAX_ATTEMPTS,
  Outbox,
  PermanentPushError,
  RETRY_MAX_DELAY_MS,
  flushOutbox,
  makeMutation,
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

function queued(envelope: MutationEnvelope): OutboxItem {
  return { envelope, attempts: 0, nextAttemptAt: 0, lastError: null };
}

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

  it("dead-letters a lone mutation when the request itself is invalid", async () => {
    const { store, dead } = memoryStore();
    const ob = new Outbox(store);
    await ob.enqueue("patients", "create", patient());
    const report = await flushOutbox(ob, async () => {
      throw new PermanentPushError("VALIDATION_ERROR: bad envelope", 400);
    });
    // nothing else was in the request, so the refusal IS about this item
    expect(report.dead).toBe(1);
    expect(dead).toHaveLength(1);
    expect(ob.size).toBe(0);
    expect(report.stopped).toBe("drained");
  });

  it("never dead-letters a whole batch for one poisoned item (ADR-0040)", async () => {
    const { store, dead } = memoryStore();
    const ob = new Outbox(store);
    const first = await ob.enqueue("patients", "create", patient("09120000003"));
    const poison = await ob.enqueue("patients", "create", patient("09120000004"));
    const last = await ob.enqueue("patients", "create", patient("09120000005"));

    // A server that refuses the REQUEST without naming the culprit — exactly what
    // batch-level zod validation used to do.
    const report = await flushOutbox(ob, async (batch) => {
      if (batch.some((m) => m.clientMutationId === poison.clientMutationId)) {
        throw new PermanentPushError("VALIDATION_ERROR: ورودی نامعتبر", 400);
      }
      return batch.map(applied);
    });

    expect(report.isolated).toBeGreaterThanOrEqual(1);
    expect(report.applied).toBe(2);
    expect(report.dead).toBe(1);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.id).toBe(poison.clientMutationId);
    expect(ob.size).toBe(0);
    expect(report.stopped).toBe("drained");
    // the healthy siblings were applied, not buried
    expect(dead.map((d) => d.id)).not.toContain(first.clientMutationId);
    expect(dead.map((d) => d.id)).not.toContain(last.clientMutationId);
  });

  it("dead-letters only the mutations the server named", async () => {
    const { store, dead } = memoryStore();
    const ob = new Outbox(store);
    const blamed = await ob.enqueue("patients", "create", patient("09120000006"));
    const innocent = await ob.enqueue("patients", "create", patient("09120000007"));

    let call = 0;
    const report = await flushOutbox(ob, async (batch) => {
      call += 1;
      if (call === 1) {
        throw new PermanentPushError("SYNC_MUTATION_UNADDRESSABLE", 400, {
          code: "SYNC_MUTATION_UNADDRESSABLE",
          itemIds: [blamed.clientMutationId],
        });
      }
      return batch.map(applied);
    });

    expect(report.dead).toBe(1);
    expect(report.applied).toBe(1);
    expect(report.isolated).toBe(0);
    expect(dead[0]!.id).toBe(blamed.clientMutationId);
    expect(ob.size).toBe(0);
    expect(dead.map((d) => d.id)).not.toContain(innocent.clientMutationId);
  });

  it("screens a drifted record locally instead of sending it with the batch", async () => {
    const { store, records, dead } = memoryStore();
    const ob = new Outbox(store);
    const healthy = makeMutation("patients", "create", patient("09120000008"));
    // A record that could only appear by drift: a hand-restored queue, an older
    // build, a schema window that moved while the device was offline.
    const drifted = { ...makeMutation("patients", "create", patient("09120000009")), entity: "consents" } as unknown as MutationEnvelope;
    ob.restore([queued(healthy), queued(drifted)]);
    records.set(healthy.clientMutationId, queued(healthy));
    records.set(drifted.clientMutationId, queued(drifted));

    const sent: string[][] = [];
    const report = await flushOutbox(ob, async (batch) => {
      sent.push(batch.map((m) => m.clientMutationId));
      return batch.map(applied);
    });

    expect(report.screened).toBe(1);
    expect(report.dead).toBe(1);
    expect(report.applied).toBe(1);
    expect(sent).toEqual([[healthy.clientMutationId]]);
    expect(dead[0]!.id).toBe(drifted.clientMutationId);
    expect(dead[0]!.reason).toContain("unknown entity");
    expect(ob.size).toBe(0);
    expect(records.size).toBe(0);
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

  it("survives a crash between the server commit and the local ack", async () => {
    let now = 2_000_000;
    const { store, records } = memoryStore();
    const ob = new Outbox(store, () => now);
    const envelope = await ob.enqueue("patients", "create", patient("09120000010"));

    // The request reached the server; the answer never reached us.
    const crashed = await flushOutbox(
      ob,
      async () => {
        throw new Error("power lost before the ack");
      },
      { now: () => now },
    );
    expect(crashed.stopped).toBe("transport");
    expect(crashed.applied).toBe(0);
    expect(records.get(envelope.clientMutationId)?.attempts).toBe(1);

    // Restart: a brand new queue rehydrated from what survived on disk.
    now += RETRY_MAX_DELAY_MS + 1;
    const rebooted = new Outbox(store, () => now);
    rebooted.restore([...records.values()]);
    expect(rebooted.size).toBe(1);
    expect(rebooted.snapshot()[0]!.attempts).toBe(1);

    // The server remembers the id, so the retry settles as a duplicate.
    const report = await flushOutbox(
      rebooted,
      async (batch) => batch.map((m) => ({ clientMutationId: m.clientMutationId, status: "duplicate" as const })),
      { now: () => now },
    );
    expect(report.duplicate).toBe(1);
    expect(report.applied).toBe(0);
    expect(rebooted.size).toBe(0);
    expect(records.size).toBe(0);
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
