import { describe, expect, it } from "vitest";
import { CURSOR_ZERO, makeMutation, type OutboxItem } from "@scalpai/sync-client";
import { offlineDbName, sameScope, type OfflineScope } from "./db.js";
import { drainPull, toItem, toRecord, type CursorStore, type PullPage } from "./sync.js";

const scope: OfflineScope = { clinicId: "11111111-1111-4111-8111-111111111111", userId: "owner@clinic-a.test" };

function item(payload: Record<string, unknown>, baseVersion: number | null = null): OutboxItem {
  return {
    envelope: makeMutation(baseVersion === null ? "patients" : "patients", baseVersion === null ? "create" : "update", payload, baseVersion),
    attempts: 2,
    nextAttemptAt: 1_700_000_000_000,
    lastError: "network down",
  };
}

function memoryCursors(initial = CURSOR_ZERO) {
  let cursor = initial;
  const store: CursorStore = {
    read: async () => cursor,
    write: async (next: string) => {
      cursor = next;
    },
  };
  return { store, value: () => cursor };
}

describe("offline scope (WEAKNESSES H8)", () => {
  it("gives every clinic and user its own database name", () => {
    const other: OfflineScope = { ...scope, clinicId: "22222222-2222-4222-8222-222222222222" };
    const otherUser: OfflineScope = { ...scope, userId: "tricho@clinic-a.test" };
    expect(offlineDbName(scope)).not.toBe(offlineDbName(other));
    expect(offlineDbName(scope)).not.toBe(offlineDbName(otherUser));
    expect(offlineDbName(scope)).toMatch(/^scalpai-offline-[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+$/);
  });

  it("compares scopes structurally", () => {
    expect(sameScope(scope, { ...scope })).toBe(true);
    expect(sameScope(scope, { ...scope, userId: "someone-else" })).toBe(false);
    expect(sameScope(null, scope)).toBe(false);
  });
});

describe("outbox records", () => {
  it("round-trips retry state and the base version", () => {
    const original = item({ id: "p1", gender: "female" }, 4);
    const record = toRecord(original, scope, 123);
    expect(record.createdAt).toBe(123);
    expect(record.clinicId).toBe(scope.clinicId);
    expect(record.baseVersion).toBe(4);

    const back = toItem(record);
    expect(back.attempts).toBe(2);
    expect(back.nextAttemptAt).toBe(1_700_000_000_000);
    expect(back.lastError).toBe("network down");
    expect(back.envelope.clientMutationId).toBe(original.envelope.clientMutationId);
    expect(back.envelope.payload).toEqual({ id: "p1", gender: "female" });
  });

  it("never writes readable PHI into IndexedDB", () => {
    const record = toRecord(item({ firstName: "علی", phone: "09120000000", notes: "محرمانه", gender: "male" }), scope);
    const stored = JSON.parse(record.payload) as Record<string, unknown>;
    expect(stored).toEqual({ gender: "male" });
  });

  it("survives a corrupted payload without throwing", () => {
    const record = { ...toRecord(item({ gender: "male" }), scope), payload: "{not json" };
    expect(toItem(record).envelope.payload).toEqual({});
  });
});

describe("drainPull (WEAKNESSES H2/H5)", () => {
  it("applies a page BEFORE it moves the durable cursor", async () => {
    const cursors = memoryCursors();
    const order: string[] = [];
    const pages: PullPage[] = [
      { items: [{ entity: "patients", op: "create", serverSeq: 1, cursor: "10:1" }], cursor: "10:1", hasMore: true },
      { items: [{ entity: "analyses", op: "create", serverSeq: 2, cursor: "11:2" }], cursor: "11:2", hasMore: false },
    ];
    let index = 0;

    const result = await drainPull(
      cursors.store,
      async (cursor) => {
        order.push(`fetch:${cursor}`);
        return pages[index++]!;
      },
      {
        onPage: async (page) => {
          order.push(`apply:${page.cursor}@${cursors.value()}`);
        },
      },
    );

    expect(result.received).toBe(2);
    expect(result.rounds).toBe(2);
    expect(result.entities.sort()).toEqual(["analyses", "patients"]);
    expect(cursors.value()).toBe("11:2");
    expect(order).toEqual(["fetch:0:0", "apply:10:1@0:0", "fetch:10:1", "apply:11:2@10:1"]);
  });

  it("stops on an empty page and leaves the cursor alone", async () => {
    const cursors = memoryCursors("7:7");
    const result = await drainPull(cursors.store, async () => ({ items: [], cursor: "7:7", hasMore: false }));
    expect(result.received).toBe(0);
    expect(result.rounds).toBe(1);
    expect(cursors.value()).toBe("7:7");
  });

  it("is bounded even when the server always says hasMore", async () => {
    const cursors = memoryCursors();
    let seq = 0;
    const result = await drainPull(
      cursors.store,
      async () => {
        seq += 1;
        return {
          items: [{ entity: "patients", op: "create", serverSeq: seq, cursor: `1:${seq}` }],
          cursor: `1:${seq}`,
          hasMore: true,
        };
      },
      { maxRounds: 3 },
    );
    expect(result.rounds).toBe(3);
    expect(result.received).toBe(3);
    expect(cursors.value()).toBe("1:3");
  });
});
