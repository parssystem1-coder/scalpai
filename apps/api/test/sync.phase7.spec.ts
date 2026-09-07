import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { resetAll } from "@scalpai/db/testing";
import {
  Outbox,
  PermanentPushError,
  RETRY_MAX_DELAY_MS,
  flushOutbox,
  type MutationEnvelope,
  type OutboxItem,
  type OutboxStore,
  type PushItemResult,
} from "@scalpai/sync-client";
import { AppModule } from "../src/app.module.js";

/**
 * Phase 7 (ADR-0039) + phase 7.1 (ADR-0040) — offline correctness against a REAL
 * PostgreSQL.
 *
 * Every test here maps to a WEAKNESSES item that used to be claimed but never
 * proven: per-item isolation (H4), an honest ledger (H3), tenant-scoped dedupe
 * (H4), version-based conflict resolution (H6) and a cursor that cannot skip (H5).
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };
const B = { email: "owner@clinic-b.test", password: "Dev12345!" };

/** Stable, collision-free ids for this suite. */
const mid = (n: number) => `550e8400-e29b-41d4-a716-7000${String(n).padStart(8, "0")}`;

interface PullItem {
  entity: string;
  op: string;
  payload: Record<string, unknown>;
  serverSeq: number;
  cursor: string;
}

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

function push(token: string, mutations: unknown[]) {
  return http.post("/api/v1/sync/push").set({ Authorization: `Bearer ${token}` }).send({ mutations });
}

function pull(token: string, cursor = "0:0", limit = 500) {
  return http
    .get(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=${limit}`)
    .set({ Authorization: `Bearer ${token}` });
}

function createEnvelope(n: number, over: Record<string, unknown> = {}) {
  return {
    clientMutationId: mid(n),
    entity: "patients",
    op: "create",
    schemaVersion: 1,
    clientUpdatedAt: "2026-09-06T12:00:00Z",
    payload: {
      firstName: "فاز",
      lastName: "هفت",
      phone: `0912700${String(n).padStart(4, "0")}`,
      ...over,
    },
  };
}

function updateEnvelope(n: number, id: string, patch: Record<string, unknown>, baseVersion: number) {
  return {
    clientMutationId: mid(n),
    entity: "patients",
    op: "update",
    schemaVersion: 1,
    clientUpdatedAt: "2026-09-06T12:05:00Z",
    baseVersion,
    payload: { id, ...patch },
  };
}

async function lastPulled(token: string): Promise<PullItem> {
  const res = await pull(token);
  expect(res.status).toBe(200);
  const items = res.body.items as PullItem[];
  expect(items.length).toBeGreaterThan(0);
  return items[items.length - 1]!;
}

/** How many rows the clinic ledger holds right now — H3 evidence, not a guess. */
async function ledgerSize(token: string): Promise<number> {
  const res = await pull(token);
  expect(res.status).toBe(200);
  return (res.body.items as PullItem[]).length;
}

/** Create a patient THROUGH sync and learn its id + version from the ledger. */
async function createPatient(token: string, n: number, over: Record<string, unknown> = {}) {
  const res = await push(token, [createEnvelope(n, over)]);
  expect(res.status).toBe(201);
  expect(res.body.results[0].status).toBe("applied");
  const item = await lastPulled(token);
  return { id: String(item.payload._id), version: Number(item.payload._version) };
}

/**
 * A REAL device: its own durable store, its own clock, and a queue that can be
 * rebooted from what survived on disk. Two of these is what "two devices" has to
 * mean — the previous test logged in once and fired three sequential requests
 * from a single session, which proves nothing about two offline peers.
 */
function newDevice(startAt = 1_800_000_000_000) {
  let clock = startAt;
  const records = new Map<string, OutboxItem>();
  const dead: Array<{ id: string; reason: string }> = [];
  const store: OutboxStore = {
    async put(item) {
      records.set(item.envelope.clientMutationId, { ...item });
    },
    async remove(ids) {
      for (const id of ids) records.delete(id);
    },
    async deadLetter(item, reason) {
      records.delete(item.envelope.clientMutationId);
      dead.push({ id: item.envelope.clientMutationId, reason });
    },
  };
  return {
    records,
    dead,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
    /** Boot the queue from the durable records — a process restart. */
    open(): Outbox {
      const outbox = new Outbox(store, () => clock);
      outbox.restore([...records.values()].map((item) => ({ ...item })));
      return outbox;
    },
  };
}

/** The real HTTP transport for one device, with the client's 400 semantics. */
function transport(token: string) {
  const results: PushItemResult[] = [];
  const calls: string[][] = [];
  return {
    results,
    calls,
    push: async (batch: MutationEnvelope[]): Promise<PushItemResult[]> => {
      calls.push(batch.map((m) => m.clientMutationId));
      const res = await push(token, batch);
      if (res.status === 400) {
        const code = String(res.body?.code ?? "VALIDATION_ERROR");
        throw new PermanentPushError(code, 400, { code });
      }
      if (res.status !== 201) throw new Error(`push failed with status ${res.status}`);
      const page = (res.body.results ?? []) as PushItemResult[];
      results.push(...page);
      return page;
    },
  };
}

beforeAll(async () => {
  await migrate(process.env.MIGRATE_DATABASE_URL!);
  await resetAll(process.env.MIGRATE_DATABASE_URL!);
  await seed(process.env.MIGRATE_DATABASE_URL!);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  await app.listen(0, "127.0.0.1");
  http = request(await app.getUrl());
  db = app.get(DbService);
}, 30_000);

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

describe("push isolation and an honest ledger (H3/H4)", () => {
  it("keeps the applied item when a sibling in the same batch is refused", async () => {
    const token = await login(A);
    const broken = {
      clientMutationId: mid(11),
      entity: "patients",
      op: "update",
      schemaVersion: 1,
      clientUpdatedAt: "2026-09-06T12:00:00Z",
      baseVersion: 1,
      payload: { lastName: "بدون شناسه" }, // no payload.id
    };
    const res = await push(token, [createEnvelope(10), broken]);
    expect(res.status).toBe(201);
    expect(res.body.results[0].status).toBe("applied");
    expect(res.body.results[1].status).toBe("rejected");
    expect(res.body.results[1].reason).toContain("payload.id");

    // the refused item is NOT in the ledger, so peers never see it
    const page = await pull(token);
    const updates = (page.body.items as PullItem[]).filter((i) => i.op === "update");
    expect(updates).toHaveLength(0);

    // and re-pushing it is a fresh attempt, not a phantom duplicate
    const retry = await push(token, [broken]);
    expect(retry.body.results[0].status).toBe("rejected");
  });

  it("broadcasts field names and ids, never readable PHI", async () => {
    const token = await login(A);
    await createPatient(token, 20, { gender: "male" });
    const page = await pull(token);
    const items = page.body.items as PullItem[];
    for (const item of items) {
      expect(item.payload).not.toHaveProperty("firstName");
      expect(item.payload).not.toHaveProperty("lastName");
      expect(item.payload).not.toHaveProperty("phone");
    }
    const last = items[items.length - 1]!;
    expect(Array.isArray(last.payload._fields)).toBe(true);
    expect(last.payload._fields).toContain("phone");
    expect(typeof last.payload._id).toBe("string");
    expect(last.payload._version).toBe(1);
  });

  it("scopes idempotency to the clinic, not the whole table (H4)", async () => {
    const tokenA = await login(A);
    const tokenB = await login(B);
    const shared = createEnvelope(30);

    const inA = await push(tokenA, [shared]);
    expect(inA.body.results[0].status).toBe("applied");

    // same uuid, different tenant — a real mutation, not a duplicate
    const inB = await push(tokenB, [shared]);
    expect(inB.status).toBe(201);
    expect(inB.body.results[0].status).toBe("applied");

    // same uuid, same tenant — still idempotent
    const again = await push(tokenA, [shared]);
    expect(again.body.results[0].status).toBe("duplicate");

    // and clinic B cannot see clinic A's ledger
    const pageB = await pull(tokenB);
    expect((pageB.body.items as PullItem[]).length).toBe(1);
  });
});

describe("per-item validation of a push batch (ADR-0040)", () => {
  it("refuses only the malformed items and applies their healthy siblings", async () => {
    const token = await login(A);
    const badTimestamp = { ...createEnvelope(81), clientUpdatedAt: "دیروز" };
    const res = await push(token, [
      createEnvelope(80),
      badTimestamp,
      { ...createEnvelope(82), entity: "consents" },
      createEnvelope(83),
    ]);

    // one broken envelope no longer answers for the batch around it
    expect(res.status).toBe(201);
    expect(res.body.results).toHaveLength(4);
    expect(res.body.results[0].status).toBe("applied");
    expect(res.body.results[1].status).toBe("rejected");
    expect(res.body.results[1].clientMutationId).toBe(mid(81));
    expect(res.body.results[1].reason).toContain("clientUpdatedAt");
    expect(res.body.results[2].status).toBe("rejected");
    expect(res.body.results[2].reason).toContain("entity");
    expect(res.body.results[3].status).toBe("applied");

    // a refused item left NO trace: pushing it again is a fresh refusal, not a
    // duplicate, so the ledger never learned about it
    const retry = await push(token, [badTimestamp]);
    expect(retry.status).toBe(201);
    expect(retry.body.results[0].status).toBe("rejected");
  });

  it("refuses an update without a baseVersion per item, not per batch (H6)", async () => {
    const token = await login(A);
    const res = await push(token, [
      {
        clientMutationId: mid(50),
        entity: "patients",
        op: "update",
        schemaVersion: 1,
        clientUpdatedAt: "2026-09-06T12:00:00Z",
        payload: { id: "11111111-1111-4111-8111-111111111111", gender: "male" },
      },
    ]);
    expect(res.status).toBe(201);
    expect(res.body.results[0].status).toBe("rejected");
    expect(res.body.results[0].reason).toContain("baseVersion");
  });

  it("400s the batch only when an item cannot be answered per item", async () => {
    const token = await login(A);
    const res = await push(token, [createEnvelope(84), { ...createEnvelope(85), clientMutationId: "not-a-uuid" }]);
    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    expect(body).toContain("SYNC_MUTATION_UNADDRESSABLE");
    // the offending indexes are named, so the client dead-letters exactly those
    expect(body).toContain("indexes");

    // and nothing in a 400 request was applied
    const applied = await push(token, [createEnvelope(84)]);
    expect(applied.status).toBe(201);
    expect(applied.body.results[0].status).toBe("applied");
  });

  it("refuses an empty batch", async () => {
    const token = await login(A);
    const res = await push(token, []);
    expect(res.status).toBe(400);
  });
});

describe("conflict resolution on server versions (H6)", () => {
  it("two devices, two tokens, two offline outboxes — each keeps its own field", async () => {
    const tokenA = await login(A);
    const tokenB = await login(A); // a second sign-in = a second device/session
    const patient = await createPatient(tokenA, 40, { gender: "male" });
    expect(patient.version).toBe(1);

    const deviceA = newDevice();
    const deviceB = newDevice();
    const outboxA = deviceA.open();
    const outboxB = deviceB.open();

    // Both devices are OFFLINE, both edit the SAME base version, different fields.
    await outboxA.enqueue("patients", "update", { id: patient.id, lastName: "الف" }, patient.version);
    await outboxB.enqueue("patients", "update", { id: patient.id, gender: "female" }, patient.version);

    const offline = async (): Promise<PushItemResult[]> => {
      throw new Error("network unreachable");
    };
    for (const [device, outbox] of [
      [deviceA, outboxA],
      [deviceB, outboxB],
    ] as const) {
      const report = await flushOutbox(outbox, offline, { now: device.now });
      expect(report.stopped).toBe("transport");
      expect(report.retried).toBe(1);
      expect(report.dead).toBe(0);
      expect(outbox.size).toBe(1); // still queued
      expect(device.records.size).toBe(1); // and it survived on disk
    }

    // Back online — each device flushes with ITS OWN token.
    deviceA.advance(RETRY_MAX_DELAY_MS + 1);
    deviceB.advance(RETRY_MAX_DELAY_MS + 1);
    const wireA = transport(tokenA);
    const wireB = transport(tokenB);
    const flushA = await flushOutbox(outboxA, wireA.push, { now: deviceA.now });
    const flushB = await flushOutbox(outboxB, wireB.push, { now: deviceB.now });

    expect(flushA.applied).toBe(1);
    expect(flushB.applied).toBe(1);
    expect(outboxA.size).toBe(0);
    expect(outboxB.size).toBe(0);
    expect(deviceA.records.size).toBe(0);
    expect(deviceB.records.size).toBe(0);
    expect(deviceA.dead).toHaveLength(0);
    expect(deviceB.dead).toHaveLength(0);
    expect(wireA.results[0]!.rowVersion).toBe(2);
    expect(wireB.results[0]!.conflicts).toBeUndefined(); // a different field: no conflict

    // A third device is still on version 1 and touches the field A changed.
    const deviceC = newDevice();
    const outboxC = deviceC.open();
    await outboxC.enqueue("patients", "update", { id: patient.id, lastName: "جیم" }, 1);
    const wireC = transport(tokenA);
    const flushC = await flushOutbox(outboxC, wireC.push, { now: deviceC.now });
    expect(flushC.applied).toBe(1);
    expect(wireC.results[0]!.conflicts).toEqual(["lastName"]);

    const readBack = await http.get(`/api/v1/patients/${patient.id}`).set({ Authorization: `Bearer ${tokenA}` });
    expect(readBack.status).toBe(200);
    expect(readBack.body.lastName).toBe("الف"); // device A survived device C
    expect(readBack.body.gender).toBe("female"); // device B survived too
    expect(readBack.body.rowVersion).toBeGreaterThanOrEqual(3);
  });

  it("refuses a baseVersion the server never issued", async () => {
    const token = await login(A);
    const patient = await createPatient(token, 51);
    const res = await push(token, [updateEnvelope(52, patient.id, { gender: "female" }, 99)]);
    expect(res.status).toBe(201);
    expect(res.body.results[0].status).toBe("rejected");
    expect(res.body.results[0].reason).toContain("baseVersion");
  });
});

describe("crash mid-push and outbox state after a restart (C9)", () => {
  it("keeps a committed push after a crash and never applies it twice", async () => {
    const token = await login(A);
    const device = newDevice();
    const outbox = device.open();
    const envelope = await outbox.enqueue("patients", "create", {
      firstName: "برق",
      lastName: "رفت",
      phone: "09127000070",
    });
    const before = await ledgerSize(token);

    // The server COMMITS, then the device dies before it can record the ack.
    const crashed = await flushOutbox(
      outbox,
      async (batch) => {
        await push(token, batch);
        throw new Error("power lost before the ack");
      },
      { now: device.now },
    );
    expect(crashed.stopped).toBe("transport");
    expect(crashed.applied).toBe(0);
    expect(crashed.dead).toBe(0);

    // the write IS on the server ...
    expect(await ledgerSize(token)).toBe(before + 1);
    // ... and the mutation is still queued, with its retry state persisted
    expect(outbox.size).toBe(1);
    const stored = device.records.get(envelope.clientMutationId);
    expect(stored?.attempts).toBe(1);
    expect(stored?.lastError).toContain("power lost");

    // RESTART: a fresh queue rehydrated from disk — same id, same retry state.
    device.advance(RETRY_MAX_DELAY_MS + 1);
    const rebooted = device.open();
    expect(rebooted.size).toBe(1);
    expect(rebooted.snapshot()[0]!.attempts).toBe(1);
    expect(rebooted.snapshot()[0]!.envelope.clientMutationId).toBe(envelope.clientMutationId);

    const wire = transport(token);
    const retry = await flushOutbox(rebooted, wire.push, { now: device.now });
    expect(retry.duplicate).toBe(1); // the server remembers the id
    expect(retry.applied).toBe(0);
    expect(retry.stopped).toBe("drained");
    expect(rebooted.size).toBe(0);
    expect(device.records.size).toBe(0);
    expect(device.dead).toHaveLength(0);
    expect(await ledgerSize(token)).toBe(before + 1); // no second ledger row
  });

  it("keeps the items of an earlier successful push when a later one crashes", async () => {
    const token = await login(A);
    const device = newDevice();
    const outbox = device.open();
    const first = await outbox.enqueue("patients", "create", {
      firstName: "نیمه",
      lastName: "کاره",
      phone: "09127000071",
    });
    const second = await outbox.enqueue("patients", "create", {
      firstName: "نیمه",
      lastName: "دوم",
      phone: "09127000072",
    });
    const before = await ledgerSize(token);

    let call = 0;
    const report = await flushOutbox(
      outbox,
      async (batch) => {
        call += 1;
        const res = await push(token, batch);
        // the second batch commits on the server, then the process dies
        if (call === 2) throw new Error("crashed after the second batch committed");
        return (res.body.results ?? []) as PushItemResult[];
      },
      { now: device.now, batchSize: 1 },
    );

    expect(report.applied).toBe(1); // batch 1 acked
    expect(report.retried).toBe(1); // batch 2 committed but unacked
    expect(outbox.size).toBe(1);
    expect(device.records.has(first.clientMutationId)).toBe(false); // settled, gone
    expect([...device.records.keys()]).toEqual([second.clientMutationId]);
    expect(await ledgerSize(token)).toBe(before + 2); // BOTH writes are on the server

    // the survivor is retried and answered as a duplicate — never applied twice
    device.advance(RETRY_MAX_DELAY_MS + 1);
    const wire = transport(token);
    const drain = await flushOutbox(device.open(), wire.push, { now: device.now });
    expect(drain.duplicate).toBe(1);
    expect(drain.applied).toBe(0);
    expect(device.records.size).toBe(0);
    expect(await ledgerSize(token)).toBe(before + 2);
  });
});

describe("paged pull (H5)", () => {
  it("never skips, never repeats and always terminates", async () => {
    const token = await login(A);
    await push(token, [createEnvelope(60), createEnvelope(61), createEnvelope(62), createEnvelope(63), createEnvelope(64)]);

    let cursor = "0:0";
    const seen: number[] = [];
    for (let round = 0; round < 60; round++) {
      const page = await pull(token, cursor, 2);
      expect(page.status).toBe(200);
      for (const item of page.body.items as PullItem[]) seen.push(item.serverSeq);
      const next = String(page.body.cursor);
      if (!page.body.hasMore || (page.body.items as PullItem[]).length === 0) {
        cursor = next;
        break;
      }
      expect(next).not.toBe(cursor);
      cursor = next;
    }

    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));

    const drained = await pull(token, cursor, 2);
    expect(drained.body.items).toHaveLength(0);
    expect(drained.body.hasMore).toBe(false);
    expect(drained.body.cursor).toBe(cursor);
  });

  it("refuses a malformed cursor instead of replaying the whole ledger", async () => {
    const token = await login(A);
    const res = await http.get("/api/v1/sync/pull?cursor=not-a-cursor").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("SYNC_CURSOR");
  });
});
