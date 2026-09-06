import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DbService,
  deletePlanAsPlatform,
  listPlansAsPlatform,
  migrate,
  seed,
  upsertPlanAsPlatform,
} from "@scalpai/db";
import {
  assertResettableTarget,
  migrateSql,
  resetAll,
  seedMarkerClinicId,
  seedOtherClinicId,
} from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";
import { REFRESH_COOKIE } from "../src/auth/refresh-cookie.js";

/**
 * Phase 2 — tenancy lock, RLS and access boundaries (WEAKNESSES C4, C5, H18,
 * M12, R3, R5). Everything here runs against real PostgreSQL as the
 * NOBYPASSRLS app role, so a policy or grant regression fails the build.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;
let clinicA: string;
let clinicB: string;
let sessionA: Session;
let sessionB: Session;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };
const B = { email: "owner@clinic-b.test", password: "Dev12345!" };

const url = (): string => process.env.MIGRATE_DATABASE_URL!;

interface Session {
  accessToken: string;
  refreshCookie: string;
}

let phoneSeq = 0;
function nextPhone(): string {
  const seq = ++phoneSeq;
  return `0912${String(Date.now()).slice(-6)}${seq}`.slice(0, 11);
}

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

const bearer = (s: Session) => ({ Authorization: `Bearer ${s.accessToken}` });

beforeAll(async () => {
  await migrate(url());
  await resetAll(url());
  await seed(url());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  await app.listen(0, "127.0.0.1");
  http = request(await app.getUrl());
  db = app.get(DbService);

  clinicA = await seedMarkerClinicId(url());
  clinicB = await seedOtherClinicId(url());
  // one login per clinic — the per-IP login limiter is deliberately tight
  sessionA = await login(A);
  sessionB = await login(B);
}, 30_000);

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

describe("policy matrix — clinics (C5)", () => {
  it("the app role sees exactly its own clinic row", async () => {
    const rows = await db.withTenant(clinicA, null, async (tx) => (await tx.client.query("SELECT id FROM clinics")).rows);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].id)).toBe(clinicA);
  });

  it("UPDATE hits its own row and silently matches nothing for another clinic", async () => {
    const own = await db.withTenant(clinicA, null, async (tx) =>
      (await tx.client.query("UPDATE clinics SET status = 'active' WHERE id = $1", [clinicA])).rowCount,
    );
    expect(own).toBe(1);

    const other = await db.withTenant(clinicA, null, async (tx) =>
      (await tx.client.query("UPDATE clinics SET status = 'suspended' WHERE id = $1", [clinicB])).rowCount,
    );
    expect(other).toBe(0);

    const untouched = await migrateSql<{ status: string }>(url(), "SELECT status FROM clinics WHERE id = $1", [clinicB]);
    expect(untouched[0]?.status).toBe("active");
  });

  it("INSERT and DELETE on clinics are not granted to the app role at all", async () => {
    await expect(
      db.withTenant(clinicA, null, (tx) => tx.client.query("INSERT INTO clinics (name) VALUES ('rogue clinic')")),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withTenant(clinicA, null, (tx) => tx.client.query("DELETE FROM clinics WHERE id = $1", [clinicB])),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("policy matrix — refresh_tokens is definer-only (C5/R5)", () => {
  it("the app role has no direct privilege on the table", async () => {
    await expect(
      db.withTenant(clinicA, null, (tx) => tx.client.query("SELECT id FROM refresh_tokens")),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withTenant(clinicA, null, (tx) => tx.client.query("DELETE FROM refresh_tokens")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("login and rotation still work through the scalpai_auth definer surface", async () => {
    const rotated = await http.post("/api/v1/auth/refresh").set("Cookie", sessionB.refreshCookie);
    expect(rotated.status).toBe(201);
    sessionB = { accessToken: String(rotated.body.accessToken), refreshCookie: refreshCookieOf(rotated.headers["set-cookie"]) };
    const probe = await http.get("/api/v1/patients").set(bearer(sessionB));
    expect(probe.status).toBe(200);
  });

  it("every issued token is clinic-scoped", async () => {
    const mine = await migrateSql<{ n: number }>(
      url(),
      "SELECT count(*)::int AS n FROM refresh_tokens WHERE clinic_id = $1",
      [clinicA],
    );
    expect(mine[0]!.n).toBeGreaterThan(0);
    const orphans = await migrateSql<{ n: number }>(url(), "SELECT count(*)::int AS n FROM refresh_tokens WHERE clinic_id IS NULL");
    expect(orphans[0]!.n).toBe(0);
  });
});

describe("platform catalog is out of the tenant API (C4)", () => {
  it("catalog reads stay available to the tenant", async () => {
    const list = await http.get("/api/v1/plans").set(bearer(sessionA));
    expect(list.status).toBe(200);
    expect(list.body.map((p: { code: string }) => p.code)).toContain("growth");
  });

  it("catalog writes no longer exist on the tenant API", async () => {
    const body = { code: "x_rogue", name: { fa: "ایکس", en: "X" }, price: 1_000_000 };
    expect((await http.post("/api/v1/plans").set(bearer(sessionA)).send(body)).status).toBe(404);
    expect((await http.put("/api/v1/plans/growth").set(bearer(sessionA)).send(body)).status).toBe(404);
    expect((await http.delete("/api/v1/plans/growth").set(bearer(sessionA))).status).toBe(404);
  });

  it("the app role cannot write the catalog even in raw SQL", async () => {
    await expect(
      db.withTenant(clinicA, null, (tx) =>
        tx.client.query("INSERT INTO plans (code, name, price) VALUES ('rogue', '{}', '0')"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withTenant(clinicA, null, (tx) => tx.client.query("UPDATE plans SET price = '1' WHERE code = 'growth'")),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.withTenant(clinicA, null, (tx) => tx.client.query("DELETE FROM plan_features WHERE plan_code = 'growth'")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("the platform helpers own the catalog lifecycle", async () => {
    const code = `pro_${String(Date.now()).slice(-6)}`;
    await upsertPlanAsPlatform(
      {
        code,
        name: { fa: "حرفه‌ای", en: "Pro" },
        price: 9_900_000,
        features: ["portal", "api"],
        limits: { monthly_sessions: 10 },
      },
      url(),
    );

    const got = await http.get(`/api/v1/plans/${code}`).set(bearer(sessionA));
    expect(got.status).toBe(200);
    expect([...got.body.features].sort()).toEqual(["api", "portal"]);

    const catalog = await listPlansAsPlatform(url());
    expect(catalog.map((p) => String(p.code))).toContain("growth");

    expect(await deletePlanAsPlatform(code, url())).toBe(true);
    expect((await http.get(`/api/v1/plans/${code}`).set(bearer(sessionA))).status).toBe(404);
  });

  it("refuses to delete a plan a clinic still sits on", async () => {
    await expect(deletePlanAsPlatform("growth", url())).rejects.toThrow(/referenced/i);
  });

  it("rejects limits that are negative, fractional or overflowing", async () => {
    const base = { code: "bad_plan", name: { fa: "بد" }, price: 1_000 };
    await expect(upsertPlanAsPlatform({ ...base, limits: { monthly_sessions: -1 } }, url())).rejects.toThrow(/limit/);
    await expect(upsertPlanAsPlatform({ ...base, limits: { monthly_sessions: 2.5 } }, url())).rejects.toThrow(/limit/);
    await expect(
      upsertPlanAsPlatform({ ...base, limits: { storage_mb: Number.MAX_SAFE_INTEGER } }, url()),
    ).rejects.toThrow(/limit/);
    const leftovers = await migrateSql<{ n: number }>(url(), "SELECT count(*)::int AS n FROM plans WHERE code = 'bad_plan'");
    expect(leftovers[0]!.n).toBe(0);
  });
});

describe("request-scoped tenant context (R3)", () => {
  it("20 interleaved cross-tenant requests never observe the other clinic", async () => {
    const createdA = await http.post("/api/v1/patients").set(bearer(sessionA)).send({ firstName: "ALS", lastName: "A", phone: nextPhone() });
    const createdB = await http.post("/api/v1/patients").set(bearer(sessionB)).send({ firstName: "ALS", lastName: "B", phone: nextPhone() });
    expect(createdA.status).toBe(201);
    expect(createdB.status).toBe(201);
    const idA = String(createdA.body.id);
    const idB = String(createdB.body.id);

    const calls: Array<Promise<{ clinic: "A" | "B"; ids: string[]; status: number }>> = [];
    for (let i = 0; i < 10; i++) {
      calls.push(
        http
          .get("/api/v1/patients?limit=100")
          .set(bearer(sessionA))
          .then((r) => ({ clinic: "A" as const, status: r.status, ids: (r.body as Array<{ id: string }>).map((p) => String(p.id)) })),
      );
      calls.push(
        http
          .get("/api/v1/patients?limit=100")
          .set(bearer(sessionB))
          .then((r) => ({ clinic: "B" as const, status: r.status, ids: (r.body as Array<{ id: string }>).map((p) => String(p.id)) })),
      );
    }
    const settled = await Promise.all(calls);

    for (const res of settled) {
      expect(res.status).toBe(200);
      if (res.clinic === "A") {
        expect(res.ids).toContain(idA);
        expect(res.ids).not.toContain(idB);
      } else {
        expect(res.ids).toContain(idB);
        expect(res.ids).not.toContain(idA);
      }
    }

    // and the database itself refuses the cross-tenant read by id (M12 + RLS)
    const leak = await db.withTenant(clinicB, null, async (tx) =>
      (await tx.client.query("SELECT id FROM patients WHERE id = $1", [idA])).rows,
    );
    expect(leak).toHaveLength(0);
  });
});

describe("identity model (C5/M12 — ADR-0032)", () => {
  it("the same email cannot exist twice, not even with different casing or clinic", async () => {
    await expect(
      migrateSql(url(), "INSERT INTO users (clinic_id, role, email, password_hash) VALUES ($1, 'owner', $2, 'x')", [
        clinicB,
        "Owner@Clinic-A.test",
      ]),
    ).rejects.toThrow(/users_email_lower_uq|duplicate key/i);
  });

  it("login accepts any casing of the identifier", async () => {
    const res = await http.post("/api/v1/auth/login").send({ email: "OWNER@CLINIC-A.TEST", password: A.password });
    expect(res.status).toBe(201);
    expect(res.body.user.clinicId).toBe(clinicA);
  });
});

describe("destructive helpers fail closed (H18)", () => {
  it("refuses to run with NODE_ENV=production", () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertResettableTarget("postgresql://u:p@localhost:5432/scalpai")).toThrow(/production/i);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it("refuses production-looking names, remote hosts and garbage targets", () => {
    expect(() => assertResettableTarget("postgresql://u:p@localhost:5432/scalpai_prod")).toThrow();
    expect(() => assertResettableTarget("postgresql://u:p@db.example.com:5432/scalpai")).toThrow();
    expect(() => assertResettableTarget("definitely-not-a-url")).toThrow();
  });

  it("accepts the local dev/CI target", () => {
    expect(() => assertResettableTarget(url())).not.toThrow();
  });

  it("resetAll aborts before opening a connection to an unsafe target", async () => {
    await expect(resetAll("postgresql://u:p@db.production.example.com:5432/scalpai")).rejects.toThrow();
  });
});
