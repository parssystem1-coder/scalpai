import { loadEnv } from "@scalpai/db";

loadEnv();

import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { DbService, migrate, seed, verifyChain } from "@scalpai/db";
import { Pool } from "pg";
import { AppModule } from "../src/app.module.js";

async function dbReset(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(`TRUNCATE audit_log, consents, analyses, gallery_items, sessions,
      patients, services, usage_counters, entitlements, plan_features, plans,
      refresh_tokens, users, branches, clinics RESTART IDENTITY CASCADE`);
  } finally {
    await pool.end();
  }
}

/**
 * Phase-1 integration suite Ã¢â‚¬â€ runs against the REAL PostgreSQL 17 instance
 * (ADR-0024) as the NOBYPASSRLS app role. Proves:
 *   login + rotating refresh with reuse detection Ã‚Â· cross-tenant 404
 *   audit hash-chain Ã‚Â· feature gating Ã‚Â· canonical error shape.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" }; // growth plan
const B = { email: "owner@clinic-b.test", password: "Dev12345!" }; // starter plan

async function login(creds: { email: string; password: string }): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return res.body;
}

beforeAll(async () => {
  const url = process.env.MIGRATE_DATABASE_URL!;
  await migrate(url);
  // Fresh deterministic dataset per run (phones are unique-constrained)
  await dbReset(url);
  await seed(url);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  // Fastify needs a real listener for HTTP-level tests
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl();
  http = request(base);
  db = app.get(DbService);
});

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

async function clinicAId(): Promise<string> {
  return db.withClient(async (tx) => {
    const res = await tx.execute(sql`SELECT id FROM clinics WHERE settings->>'seed' = 'v1' LIMIT 1`);
    return String((res.rows?.[0] as { id: string }).id);
  });
}

describe("auth", () => {
  it("rejects wrong password with the canonical error shape", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: A.email, password: "WrongPass123" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.details).toBeUndefined();
  });

  it("rotates refresh tokens; replaying an old one kills the family", async () => {
    const first = await login(A);
    expect(first.accessToken).toBeTruthy();

    const second = await http.post("/api/v1/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(second.status).toBe(201);
    expect(second.body.refreshToken).not.toBe(first.refreshToken);

    const replay = await http.post("/api/v1/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("REFRESH_REUSED");

    // Even the freshly issued child is dead after reuse detection
    const child = await http.post("/api/v1/auth/refresh").send({ refreshToken: second.body.refreshToken });
    console.log("DBG child:", child.status, child.body.code);
    expect(child.status).toBe(401);
  });

  it("blocks unauthenticated access", async () => {
    expect((await http.get("/api/v1/patients")).status).toBe(401);
  });
});

describe("cross-tenant isolation (RLS at API level)", () => {
  it("clinic B owner cannot read a clinic A patient Ã¢â‚¬â€ 404, not data", async () => {
    const a = await login(A);
    const created = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ firstName: "Ã™â€ Ã˜Â§Ã™â€¦", lastName: "Ã˜Â®Ã˜Â§Ã™â€ Ã™Ë†Ã˜Â§Ã˜Â¯Ã™â€¡", phone: "09120000001" });
    expect(created.status).toBe(201);
    const patientId = String(created.body.id);

    const b = await login(B);
    const leak = await http.get(`/api/v1/patients/${patientId}`).set("Authorization", `Bearer ${b.accessToken}`);
    expect(leak.status).toBe(404);

    const own = await http.get(`/api/v1/patients/${patientId}`).set("Authorization", `Bearer ${a.accessToken}`);
    expect(own.status).toBe(200);
    expect(String(own.body.phone)).toBe("09120000001");
  });
});

describe("audit hash-chain", () => {
  it("records mutations in a verifiable chain", async () => {
    const a = await login(A);
    await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ firstName: "Ã˜Â³Ã˜Â§Ã˜Â±Ã˜Â§", lastName: "ÃšÂ©Ã˜Â±Ã›Å’Ã™â€¦Ã›Å’", phone: "09122223344" });

    const clinicId = await clinicAId();
    const ok = await db.withTenant(clinicId, null, (tx) => verifyChain(tx));
    expect(ok).toBe(true);
  });
});

describe("feature gate (plans Ã‚Â§9.1)", () => {
  it("growth passes ml_updates; starter gets FEATURE_DISABLED", async () => {
    const a = await login(A);
    expect((await http.get("/api/v1/ml/status").set("Authorization", `Bearer ${a.accessToken}`)).status).toBe(200);

    const b = await login(B);
    const resB = await http.get("/api/v1/ml/status").set("Authorization", `Bearer ${b.accessToken}`);
    expect(resB.status).toBe(403);
    expect(resB.body.code).toBe("FEATURE_DISABLED");
  });
});
