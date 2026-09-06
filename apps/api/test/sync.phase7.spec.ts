import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { resetAll } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";

/**
 * Phase 7 (ADR-0039) — offline correctness against a REAL PostgreSQL.
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

/** Create a patient THROUGH sync and learn its id + version from the ledger. */
async function createPatient(token: string, n: number, over: Record<string, unknown> = {}) {
  const res = await push(token, [createEnvelope(n, over)]);
  expect(res.status).toBe(201);
  expect(res.body.results[0].status).toBe("applied");
  const item = await lastPulled(token);
  return { id: String(item.payload._id), version: Number(item.payload._version) };
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

describe("conflict resolution on server versions (H6)", () => {
  it("two devices on the same base each keep their own field", async () => {
    const token = await login(A);
    const patient = await createPatient(token, 40, { gender: "male" });
    expect(patient.version).toBe(1);

    // device A renames, based on version 1
    const deviceA = await push(token, [updateEnvelope(41, patient.id, { lastName: "الف" }, 1)]);
    expect(deviceA.body.results[0].status).toBe("applied");
    expect(deviceA.body.results[0].rowVersion).toBe(2);

    // device B is still on version 1 and touches a DIFFERENT field — no conflict
    const deviceB = await push(token, [updateEnvelope(42, patient.id, { gender: "female" }, 1)]);
    expect(deviceB.body.results[0].status).toBe("applied");
    expect(deviceB.body.results[0].conflicts).toBeUndefined();

    // device C is on version 1 and touches the field A already changed — server wins
    const deviceC = await push(token, [updateEnvelope(43, patient.id, { lastName: "جیم" }, 1)]);
    expect(deviceC.body.results[0].status).toBe("applied");
    expect(deviceC.body.results[0].conflicts).toEqual(["lastName"]);

    const readBack = await http.get(`/api/v1/patients/${patient.id}`).set({ Authorization: `Bearer ${token}` });
    expect(readBack.status).toBe(200);
    expect(readBack.body.lastName).toBe("الف"); // A survived C
    expect(readBack.body.gender).toBe("female"); // B survived too
    expect(readBack.body.rowVersion).toBeGreaterThanOrEqual(3);
  });

  it("refuses an update without a baseVersion at the contract boundary", async () => {
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
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("baseVersion");
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
