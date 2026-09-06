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

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
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

describe("sync push (§8)", () => {
  it("applies a patient create and records the mutation", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const push = await http
      .post("/api/v1/sync/push")
      .set(auth)
      .send({
        mutations: [
          {
            clientMutationId: "550e8400-e29b-41d4-a716-446655440001",
            entity: "patients",
            op: "create",
            schemaVersion: 1,
            clientUpdatedAt: "2026-08-26T12:00:00Z",
            payload: {
              firstName: "علی",
              lastName: "رضایی",
              phone: "09120001111",
            },
          },
        ],
      });
    expect(push.status).toBe(201);
    expect(push.body.results[0].status).toBe("applied");
    expect(push.body.results[0].clientMutationId).toBe("550e8400-e29b-41d4-a716-446655440001");
  });

  it("deduplicates mutations by clientMutationId", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const mutation = {
      clientMutationId: "550e8400-e29b-41d4-a716-446655440002",
      entity: "patients",
      op: "create",
      schemaVersion: 1,
      clientUpdatedAt: "2026-08-26T12:00:00Z",
      payload: { firstName: "تست", lastName: "تکرار", phone: "09120002222" },
    };
    const first = await http.post("/api/v1/sync/push").set(auth).send({ mutations: [mutation] });
    expect(first.status).toBe(201);
    expect(first.body.results[0].status).toBe("applied");

    const second = await http.post("/api/v1/sync/push").set(auth).send({ mutations: [mutation] });
    expect(second.status).toBe(201);
    expect(second.body.results[0].status).toBe("duplicate");
  });

  it("rejects unsupported schemaVersion", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const res = await http
      .post("/api/v1/sync/push")
      .set(auth)
      .send({
        mutations: [
          {
            clientMutationId: "550e8400-e29b-41d4-a716-446655440003",
            entity: "patients",
            op: "create",
            schemaVersion: 99,
            clientUpdatedAt: "2026-08-26T12:00:00Z",
            payload: { firstName: "X", lastName: "Y", phone: "09120003333" },
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.results[0].status).toBe("rejected");
    expect(res.body.results[0].reason).toContain("unsupported schemaVersion");
  });

  it("processes a batch of mixed mutations atomically", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const push = await http
      .post("/api/v1/sync/push")
      .set(auth)
      .send({
        mutations: [
          {
            clientMutationId: "550e8400-e29b-41d4-a716-446655440010",
            entity: "patients",
            op: "create",
            schemaVersion: 1,
            clientUpdatedAt: "2026-08-26T12:00:00Z",
            payload: { firstName: " BATCH", lastName: "TEST", phone: "09120004444" },
          },
          {
            clientMutationId: "550e8400-e29b-41d4-a716-446655440011",
            entity: "patients",
            op: "create",
            schemaVersion: 1,
            clientUpdatedAt: "2026-08-26T12:00:00Z",
            payload: { firstName: " BATCH2", lastName: "TEST2", phone: "09120005555" },
          },
        ],
      });
    expect(push.status).toBe(201);
    expect(push.body.results).toHaveLength(2);
    expect(push.body.results.every((r: { status: string }) => r.status === "applied")).toBe(true);
  });
});

describe("sync pull (§8) — commit-safe cursor", () => {
  it("returns applied mutations after a cursor and terminates", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };

    // push a known mutation first
    await http
      .post("/api/v1/sync/push")
      .set(auth)
      .send({
        mutations: [
          {
            clientMutationId: "550e8400-e29b-41d4-a716-446655440020",
            entity: "patients",
            op: "create",
            schemaVersion: 1,
            clientUpdatedAt: "2026-08-26T12:00:00Z",
            payload: { firstName: "PULL", lastName: "TEST", phone: "09120006666" },
          },
        ],
      });

    // from the zero cursor — everything the clinic has
    const first = await http.get("/api/v1/sync/pull?cursor=0:0").set(auth);
    expect(first.status).toBe(200);
    expect(first.body.items.length).toBeGreaterThan(0);
    expect(first.body.cursor).toMatch(/^\d+:\d+$/);

    // resuming from the returned cursor — nothing new, cursor unchanged
    const cursor = String(first.body.cursor);
    const empty = await http.get(`/api/v1/sync/pull?cursor=${encodeURIComponent(cursor)}`).set(auth);
    expect(empty.status).toBe(200);
    expect(empty.body.items).toHaveLength(0);
    expect(empty.body.cursor).toBe(cursor);
    expect(empty.body.hasMore).toBe(false);
  });
});
