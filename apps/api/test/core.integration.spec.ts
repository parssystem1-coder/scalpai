import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, getPatientIncludingDeleted, migrate, seed, verifyChain } from "@scalpai/db";
import { resetAll, seedMarkerClinicId } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";
import { REFRESH_COOKIE } from "../src/auth/refresh-cookie.js";

/**
 * Phase-1 integration suite against REAL PostgreSQL 17 (ADR-0024) as the
 * NOBYPASSRLS app role. Proves: rotating refresh + reuse detection,
 * cross-tenant isolation (404), audit hash-chain, feature gating.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" }; // growth plan
const B = { email: "owner@clinic-b.test", password: "Dev12345!" }; // starter plan

interface Session {
  accessToken: string;
  refreshCookie: string;
}

/** The refresh token is an HttpOnly cookie now (WEAKNESSES H1), not a body field. */
function refreshCookieOf(raw: unknown): string {
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === "string" ? [raw] : [];
  const cookie = list.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  expect(cookie).toBeTruthy();
  return cookie!.split(";")[0]!;
}

async function login(creds: { email: string; password: string }): Promise<Session> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return { accessToken: String(res.body.accessToken), refreshCookie: refreshCookieOf(res.headers["set-cookie"]) };
}

beforeAll(async () => {
  const url = process.env.MIGRATE_DATABASE_URL!;
  await migrate(url);
  await resetAll(url); // deterministic dataset (unique phones)
  await seed(url);

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

async function clinicAId(): Promise<string> {
  return seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);
}

describe("auth", () => {
  it("rejects wrong password with canonical error shape", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: A.email, password: "WrongPass123" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
    expect(typeof res.body.message).toBe("string");
  });

  it("rotates refresh tokens; replaying an old one kills the family", async () => {
    const first = await login(A);
    expect(first.accessToken).toBeTruthy();

    const second = await http.post("/api/v1/auth/refresh").set("Cookie", first.refreshCookie);
    expect(second.status).toBe(201);
    const secondCookie = refreshCookieOf(second.headers["set-cookie"]);
    expect(secondCookie).not.toBe(first.refreshCookie);

    const replay = await http.post("/api/v1/auth/refresh").set("Cookie", first.refreshCookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe("REFRESH_REUSED");

    // The freshly issued child died with the family after reuse detection
    const child = await http.post("/api/v1/auth/refresh").set("Cookie", secondCookie);
    expect(child.status).toBe(401);
  });

  it("blocks unauthenticated access", async () => {
    expect((await http.get("/api/v1/patients")).status).toBe(401);
  });
});

describe("cross-tenant isolation (RLS at API level)", () => {
  it("clinic B owner cannot read a clinic A patient - 404 not data", async () => {
    const a = await login(A);
    const created = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ firstName: "Sara", lastName: "Karimi", phone: "09120000001" });
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
      .send({ firstName: "Sara2", lastName: "Karimi2", phone: "09122223344" });

    const clinicId = await clinicAId();
    const ok = await db.withTenant(clinicId, null, (tx) => verifyChain(tx, clinicId));
    expect(ok).toBe(true);
  });

  // W06: concurrent same-clinic writes must not fork the chain — the advisory
  // lock in appendAudit serializes prev-hash reads. Without the lock this test
  // is flaky by design (two txns reading the same prev).
  it("chain stays intact under concurrent same-clinic creates", async () => {
    const a = await login(A);
    const auth = { Authorization: `Bearer ${a.accessToken}` };
    const stamp = Date.now().toString().slice(-7);
    // 0912 + 6 digits + index = exactly 11 digits, unique per worker request
    const creates = Array.from({ length: 6 }, (_, i) =>
      http
        .post("/api/v1/patients")
        .set(auth)
        .send({ firstName: "Conc", lastName: `Test${i}`, phone: `0912${stamp.slice(0, 6)}${i}` }),
    );
    const settled = await Promise.all(creates.map((p) => p.then((r) => r.status)));
    expect(settled.every((s) => s === 201 || s === 409)).toBe(true); // 409 only if phone collision

    const clinicId = await clinicAId();
    const ok = await db.withTenant(clinicId, null, (tx) => verifyChain(tx, clinicId));
    expect(ok).toBe(true);
  });
});

describe("updated_at maintenance (W07 trigger)", () => {
  it("bumps updated_at on soft delete", async () => {
    const a = await login(A);
    const created = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ firstName: "Touch", lastName: "Trigger", phone: `0912${Date.now()}`.slice(0, 11) });
    expect(created.status).toBe(201);
    const id = String(created.body.id);
    const before = new Date(String(created.body.updatedAt)).getTime();

    const del = await http.delete(`/api/v1/patients/${id}`).set("Authorization", `Bearer ${a.accessToken}`);
    expect(del.status).toBe(200);

    const clinicId = await clinicAId();
    const row = await db.withTenant(clinicId, null, (tx) => getPatientIncludingDeleted(tx, clinicId, id));
    expect(row).toBeTruthy();
    expect(row!.deletedAt).not.toBeNull();
    // timestamptz has µs precision — the trigger's now() must be strictly later
    expect(new Date(row!.updatedAt).getTime()).toBeGreaterThan(before);
  });
});

describe("feature gate (plans §9.1)", () => {
  it("growth passes ml_updates; starter gets FEATURE_DISABLED", async () => {
    const a = await login(A);
    expect((await http.get("/api/v1/ml/status").set("Authorization", `Bearer ${a.accessToken}`)).status).toBe(200);

    const b = await login(B);
    const resB = await http.get("/api/v1/ml/status").set("Authorization", `Bearer ${b.accessToken}`);
    expect(resB.status).toBe(403);
    expect(resB.body.code).toBe("FEATURE_DISABLED");
  });
});

describe("plans catalog is read-only for tenants (C4 — ADR-0031)", () => {
  it("reads stay available to an authenticated role", async () => {
    const a = await login(A);
    const auth = { Authorization: `Bearer ${a.accessToken}` };
    const list = await http.get("/api/v1/plans").set(auth);
    expect(list.status).toBe(200);
    expect(list.body.map((p: { code: string }) => p.code)).toContain("growth");

    const one = await http.get("/api/v1/plans/growth").set(auth);
    expect(one.status).toBe(200);
    expect(one.body.features).toContain("ml_updates");
  });

  it("a clinic owner can no longer write the shared catalog", async () => {
    const a = await login(A);
    const auth = { Authorization: `Bearer ${a.accessToken}` };
    const body = { code: "x_test", name: { fa: "ایکس", en: "X" }, price: 1_000_000 };

    expect((await http.post("/api/v1/plans").set(auth).send(body)).status).toBe(404);
    expect((await http.put("/api/v1/plans/growth").set(auth).send(body)).status).toBe(404);
    expect((await http.delete("/api/v1/plans/growth").set(auth)).status).toBe(404);

    // and nothing changed in the catalog
    const one = await http.get("/api/v1/plans/growth").set(auth);
    expect(one.status).toBe(200);
  });
});

describe("quota enforcement (§9.1 QuotaGuard)", () => {
  it("growth allows monthly_sessions=3; the 4th is QUOTA_EXCEEDED", async () => {
    const a = await login(A);
    const auth = { Authorization: `Bearer ${a.accessToken}` };
    const svcList = await http.get("/api/v1/services").set(auth);
    const serviceId = String(svcList.body[0].id);
    const pat = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "Q", lastName: "Uota", phone: `0912${Date.now()}`.slice(0, 11) });
    const patientId = String(pat.body.id);
    const startAt = new Date(Date.now() + 3_600_000).toISOString();
    const mk = () => http.post("/api/v1/sessions").set(auth).send({ patientId, serviceId, startAt });

    expect((await mk()).status).toBe(201);
    expect((await mk()).status).toBe(201);
    expect((await mk()).status).toBe(201);
    const fourth = await mk();
    expect(fourth.status).toBe(403);
    expect(fourth.body.code).toBe("QUOTA_EXCEEDED");
  });

  it("starter plan has its own monthly budget", async () => {
    const b = await login(B);
    const auth = { Authorization: `Bearer ${b.accessToken}` };
    const svcList = await http.get("/api/v1/services").set(auth);
    const serviceId = String(svcList.body[0].id);
    const pat = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "B", lastName: "Quota", phone: `0935${Date.now()}`.slice(0, 11) });
    const patientId = String(pat.body.id);
    const startAt = new Date(Date.now() + 3_600_000).toISOString();

    // starter limit is monthly_sessions=5 — burn them all
    for (let i = 0; i < 5; i++) {
      const r = await http.post("/api/v1/sessions").set(auth).send({ patientId, serviceId, startAt });
      expect(r.status).toBe(201);
    }
    const sixth = await http.post("/api/v1/sessions").set(auth).send({ patientId, serviceId, startAt });
    expect(sixth.status).toBe(403);
    expect(sixth.body.code).toBe("QUOTA_EXCEEDED");
  });
});
