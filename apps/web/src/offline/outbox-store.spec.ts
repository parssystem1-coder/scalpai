// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { CURSOR_ZERO, makeMutation, type OutboxItem } from "@scalpai/sync-client";
import type {
  DeadLetterRecord,
  OfflineDb,
  OfflineScope,
  OutboxRecord,
  PendingUpload,
  SyncStateRecord,
} from "./db.js";
import {
  countDeadLetters,
  createDexieCursorStore,
  createDexieOutboxStore,
  listDeadLetters,
  listOutbox,
  loadOutboxItems,
  purgeForeignOutbox,
} from "./sync.js";

/**
 * The durable outbox (WEAKNESSES C9/M6, ADR-0039).
 *
 * jsdom has no IndexedDB, so the Dexie adapter is exercised against an in-memory
 * table that implements the handful of operations it actually uses. That is the
 * point of the test: the CONTRACT is what matters here - one record per mutation
 * inside one transaction (the old adapter did `clear() + bulkAdd()` and lost the
 * whole queue if it crashed mid-window), stable FIFO ordering, and a hard
 * refusal to hand another principal's mutations to a push.
 */

function numeric(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

class MemoryTable<T extends object> {
  private readonly rows = new Map<string, T>();

  constructor(private readonly idOf: (row: T) => string) {}

  get(id: string): Promise<T | undefined> {
    return Promise.resolve(this.rows.get(id));
  }

  put(row: T): Promise<void> {
    this.rows.set(this.idOf(row), row);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }

  bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) this.rows.delete(id);
    return Promise.resolve();
  }

  toArray(): Promise<T[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  count(): Promise<number> {
    return Promise.resolve(this.rows.size);
  }

  orderBy(field: string): { toArray: () => Promise<T[]> } {
    const sorted = [...this.rows.values()].sort(
      (a, b) =>
        numeric((a as Record<string, unknown>)[field]) - numeric((b as Record<string, unknown>)[field]),
    );
    return { toArray: () => Promise.resolve(sorted) };
  }
}

interface Fake {
  db: OfflineDb;
  outbox: MemoryTable<OutboxRecord>;
  deadLetter: MemoryTable<DeadLetterRecord>;
  syncState: MemoryTable<SyncStateRecord>;
  /** One entry per `db.transaction(...)` call, so atomicity is observable. */
  transactions: string[];
}

function fakeDb(): Fake {
  const outbox = new MemoryTable<OutboxRecord>((row) => row.id);
  const deadLetter = new MemoryTable<DeadLetterRecord>((row) => row.id);
  const syncState = new MemoryTable<SyncStateRecord>((row) => row.key);
  const pendingUploads = new MemoryTable<PendingUpload>((row) => row.key);
  const transactions: string[] = [];

  const transaction = (mode: string, ...rest: unknown[]): Promise<unknown> => {
    transactions.push(mode);
    const body = rest[rest.length - 1];
    if (typeof body !== "function") throw new Error("transaction was given no callback");
    return Promise.resolve((body as () => Promise<unknown>)());
  };

  const db = { outbox, deadLetter, syncState, pendingUploads, transaction } as unknown as OfflineDb;
  return { db, outbox, deadLetter, syncState, transactions };
}

const scope: OfflineScope = {
  clinicId: "11111111-1111-4111-8111-111111111111",
  userId: "owner@clinic-a.test",
};
const otherPrincipal: OfflineScope = {
  clinicId: "22222222-2222-4222-8222-222222222222",
  userId: "owner@clinic-b.test",
};

function item(payload: Record<string, unknown> = { gender: "male" }): OutboxItem {
  return {
    envelope: makeMutation("patients", "create", payload),
    attempts: 0,
    nextAttemptAt: 0,
    lastError: null,
  };
}

/** Make ordering deterministic without sleeping on the wall clock. */
async function stampCreatedAt(table: MemoryTable<OutboxRecord>): Promise<void> {
  const rows = await table.toArray();
  let stamp = 1;
  for (const row of rows) {
    row.createdAt = stamp++;
    await table.put(row);
  }
}

describe("createDexieOutboxStore (WEAKNESSES C9)", () => {
  it("writes one record per mutation, inside a transaction", async () => {
    const fake = fakeDb();
    const store = createDexieOutboxStore(fake.db, scope);

    await store.put(item());

    expect(await fake.outbox.count()).toBe(1);
    expect(fake.transactions).toEqual(["rw"]);
    const stored = (await fake.outbox.toArray())[0]!;
    expect(stored.clinicId).toBe(scope.clinicId);
    expect(stored.userId).toBe(scope.userId);
    expect(stored.entity).toBe("patients");
  });

  it("keeps the original createdAt on a rewrite so FIFO order is stable", async () => {
    const fake = fakeDb();
    const store = createDexieOutboxStore(fake.db, scope);
    const queued = item();
    await store.put(queued);

    const seeded = (await fake.outbox.toArray())[0]!;
    seeded.createdAt = 1_000; // pretend it has been waiting a while
    await fake.outbox.put(seeded);

    // A retry updates the attempt bookkeeping, never the queue position.
    await store.put({ ...queued, attempts: 3, lastError: "network down" });

    expect(await fake.outbox.count()).toBe(1);
    const again = (await fake.outbox.toArray())[0]!;
    expect(again.createdAt).toBe(1_000);
    expect(again.attempts).toBe(3);
    expect(again.lastError).toBe("network down");
  });

  it("removes exactly the acknowledged ids, and short-circuits an empty list", async () => {
    const fake = fakeDb();
    const store = createDexieOutboxStore(fake.db, scope);
    const first = item();
    const second = item();
    await store.put(first);
    await store.put(second);

    await store.remove([]);
    expect(await fake.outbox.count()).toBe(2);

    await store.remove([first.envelope.clientMutationId]);
    expect((await fake.outbox.toArray()).map((r) => r.id)).toEqual([second.envelope.clientMutationId]);
  });

  it("dead-letters a refused mutation and bounds the reason", async () => {
    const fake = fakeDb();
    const store = createDexieOutboxStore(fake.db, scope);
    const doomed = item();
    await store.put(doomed);

    await store.deadLetter(doomed, "x".repeat(900));

    expect(await fake.outbox.count()).toBe(0);
    const dead = (await fake.deadLetter.toArray())[0]!;
    expect(dead.id).toBe(doomed.envelope.clientMutationId);
    expect(dead.reason).toHaveLength(500);
    expect(dead.clinicId).toBe(scope.clinicId);
    expect(dead.failedAt).toBeGreaterThan(0);
    // Both writes went through one transaction each - never a bare put.
    expect(fake.transactions).toEqual(["rw", "rw"]);
  });
});

describe("principal isolation (WEAKNESSES M6)", () => {
  it("loads this principal's queue in FIFO order and ignores the rest", async () => {
    const fake = fakeDb();
    const mine = createDexieOutboxStore(fake.db, scope);
    const theirs = createDexieOutboxStore(fake.db, otherPrincipal);
    const oldest = item();
    const newest = item();
    const foreign = item();
    await mine.put(oldest);
    await mine.put(newest);
    await theirs.put(foreign);
    await stampCreatedAt(fake.outbox);

    const items = await loadOutboxItems(fake.db, scope);

    expect(items.map((i) => i.envelope.clientMutationId)).toEqual([
      oldest.envelope.clientMutationId,
      newest.envelope.clientMutationId,
    ]);
  });

  it("purges foreign rows and reports how many it dropped", async () => {
    const fake = fakeDb();
    const mine = createDexieOutboxStore(fake.db, scope);
    const theirs = createDexieOutboxStore(fake.db, otherPrincipal);
    await mine.put(item());
    await mine.put(item());
    await theirs.put(item());

    expect(await purgeForeignOutbox(fake.db, scope)).toBe(1);
    expect(await fake.outbox.count()).toBe(2);
    // Idempotent: a second pass has nothing left to do.
    expect(await purgeForeignOutbox(fake.db, scope)).toBe(0);
  });
});

describe("durable pull cursor (WEAKNESSES H2/H5)", () => {
  it("starts at zero and round-trips what it was given", async () => {
    const fake = fakeDb();
    const cursors = createDexieCursorStore(fake.db);

    expect(await cursors.read()).toBe(CURSOR_ZERO);

    await cursors.write("42:7");

    expect(await cursors.read()).toBe("42:7");
    const row = (await fake.syncState.toArray())[0]!;
    expect(row.key).toBe("pull-cursor");
    expect(row.updatedAt).toBeGreaterThan(0);
  });
});

describe("inspector helpers with nobody signed in", () => {
  it("answer empty instead of throwing", async () => {
    expect(await listOutbox()).toEqual([]);
    expect(await listDeadLetters()).toEqual([]);
    expect(await countDeadLetters()).toBe(0);
  });
});
