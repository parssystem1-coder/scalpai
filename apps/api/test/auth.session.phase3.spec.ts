import { vi } from "vitest";

vi.hoisted(() => {
  process.env.STORAGE_DRIVER = "mock";
  // This suite hammers the auth routes on purpose: the IP windows are not what
  // is under test here (auth.hardening.spec.ts owns those).
  process.env.AUTH_IP_MAX = "1000";
  process.env.AUTH_REFRESH_IP_MAX = "1000";
  process.env.AUTH_LOGOUT_IP_MAX = "1000";
  // No principal caching, so a revoked/moved user is visible immediately.
  process.env.AUTH_PRINCIPAL_TTL_MS = "0";
  // L4: a deliberately tiny budget so the guard is observable in a test.
  process.env.RATE_LIMIT_SYNC_PULL_MAX = "3";
});

import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { migrateSql, resetAll, seedMarkerClinicId, seedOtherClinicId } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";

/**
 * Phase 3 — session, token and auth transaction integrity
 * (WEAKNESSES R4, R5, R11, R12, L4 · ADR-0033, ADR-0034).
 *
 * Everything here is a regression test for a race or a replay that the phase-2
 * implementation could not refuse.
 */

const OWNER = "owner@clinic-a.test";
const SECOND_USER = "tricho@clinic-a.test";
const PASSWORD = process.env.SEED_PASSWORD ?? "Dev12345!";

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

function migrateUrl(): string {
  return process.env.MIGRATE_DATABASE_URL!;
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw: unknown = res.headers["set-cookie"];
  const value = Array.isArray(raw) ? String(raw[0]) : String(raw ?? "");
  const first = value.split(";")[0];
  if (!first || first.length === 0) throw new Error("response carried no refresh cookie");
  return first;
}

async function loginCookie(email = OWNER): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(201);
  return cookieOf(res);
}

async function accessToken(email = OWNER): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(res.status).toBe(201);
  return String((res.body as { accessToken?: string }).accessToken);
}

async function liveTokens(email = OWNER): Promise<number> {
  const rows = await migrateSql<{ n: string }>(
    migrateUrl(),
    `SELECT count(*)::text AS n FROM refresh_tokens
      WHERE revoked_at IS NULL AND user_id = (SELECT id FROM users WHERE lower(email) = lower($1))`,
    [email],
  );
  return Number(rows[0]?.n ?? "0");
}

async function clearTokens(email = OWNER): Promise<void> {
  await migrateSql(
    migrateUrl(),
    `DELETE FROM refresh_tokens WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower($1))`,
    [email],
  );
}

beforeAll(async () => {
  await migrate(migrateUrl());
  await resetAll(migrateUrl());
  await seed(migrateUrl());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  const { registerSecurityHeaders } = await import("../src/common/security-headers.js");
  await registerSecurityHeaders(app);
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

describe("atomic refresh rotation under concurrency (R4/H1)", () => {
  it("turns 20 simultaneous refreshes into exactly one success and one dead family", async () => {
    await clearTokens();
    const cookie = await loginCookie();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => http.post("/api/v1/auth/refresh").set("Cookie", cookie)),
    );
    const accepted = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 401);

    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(19);
    expect(refused.some((r) => (r.body as { code?: string }).code === "REFRESH_REUSED")).toBe(true);

    // Reuse is treated as compromise: the child minted by the winner dies with
    // the family, so a stolen token cannot be replayed after the race either.
    const child = cookieOf(accepted[0]!);
    const replay = await http.post("/api/v1/auth/refresh").set("Cookie", child);
    expect(replay.status).toBe(401);
    expect(await liveTokens()).toBe(0);
  }, 30_000);

  it("rotates sequential refreshes cleanly and marks every parent replaced", async () => {
    await clearTokens();
    let cookie = await loginCookie();

    for (let i = 0; i < 3; i += 1) {
      const res = await http.post("/api/v1/auth/refresh").set("Cookie", cookie);
      expect(res.status).toBe(201);
      cookie = cookieOf(res);
    }

    const rows = await migrateSql<{ total: string; replaced: string; live: string }>(
      migrateUrl(),
      `SELECT count(*)::text AS total,
              count(replaced_by)::text AS replaced,
              count(*) FILTER (WHERE revoked_at IS NULL)::text AS live
         FROM refresh_tokens
        WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower($1))`,
      [OWNER],
    );
    expect(rows[0]).toMatchObject({ total: "4", replaced: "3", live: "1" });
  });
});

describe("refresh refusal matrix (R12/R5)", () => {
  it("refuses a replaced parent and revokes the whole family", async () => {
    await clearTokens();
    const parent = await loginCookie();
    const rotated = await http.post("/api/v1/auth/refresh").set("Cookie", parent);
    expect(rotated.status).toBe(201);

    const reuse = await http.post("/api/v1/auth/refresh").set("Cookie", parent);
    expect(reuse.status).toBe(401);
    expect((reuse.body as { code?: string }).code).toBe("REFRESH_REUSED");

    const child = await http.post("/api/v1/auth/refresh").set("Cookie", cookieOf(rotated));
    expect(child.status).toBe(401);
    expect(await liveTokens()).toBe(0);
  });

  it("refuses an expired family", async () => {
    await clearTokens();
    const cookie = await loginCookie();
    await migrateSql(
      migrateUrl(),
      `UPDATE refresh_tokens SET expires_at = now() - interval '1 hour'
        WHERE user_id = (SELECT id FROM users WHERE lower(email) = lower($1))`,
      [OWNER],
    );

    const res = await http.post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(res.status).toBe(401);
    expect((res.body as { code?: string }).code).toBe("REFRESH_EXPIRED");
    expect(await liveTokens()).toBe(0);
  });

  it("refuses a revoked user even with a structurally valid token", async () => {
    await clearTokens();
    const cookie = await loginCookie();
    try {
      await migrateSql(migrateUrl(), `UPDATE users SET revoked_at = now() WHERE lower(email) = lower($1)`, [OWNER]);
      const res = await http.post("/api/v1/auth/refresh").set("Cookie", cookie);
      expect(res.status).toBe(401);
      expect((res.body as { code?: string }).code).toBe("SESSION_INVALID");
    } finally {
      await migrateSql(migrateUrl(), `UPDATE users SET revoked_at = NULL WHERE lower(email) = lower($1)`, [OWNER]);
    }
  });

  it("refuses a token whose clinic no longer matches the user (claims come from the DB)", async () => {
    await clearTokens();
    const home = await seedMarkerClinicId(migrateUrl());
    const other = await seedOtherClinicId(migrateUrl());
    const cookie = await loginCookie();
    try {
      await migrateSql(migrateUrl(), `UPDATE users SET clinic_id = $2 WHERE lower(email) = lower($1)`, [OWNER, other]);
      const res = await http.post("/api/v1/auth/refresh").set("Cookie", cookie);
      expect(res.status).toBe(401);
      expect((res.body as { code?: string }).code).toBe("SESSION_INVALID");
      expect(await liveTokens()).toBe(0);
    } finally {
      await migrateSql(migrateUrl(), `UPDATE users SET clinic_id = $2 WHERE lower(email) = lower($1)`, [OWNER, home]);
    }
  });

  it("refuses a token that never existed", async () => {
    const res = await http
      .post("/api/v1/auth/refresh")
      .set("Cookie", "scalpai_rt=00000000-0000-0000-0000-000000000000.00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  it("logout kills the family in a single call", async () => {
    await clearTokens();
    const cookie = await loginCookie();
    const out = await http.post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(201);
    expect(await liveTokens()).toBe(0);

    const after = await http.post("/api/v1/auth/refresh").set("Cookie", cookie);
    expect(after.status).toBe(401);
  });
});

describe("per-clinic rate budget on expensive endpoints (L4)", () => {
  it("refuses with 429 once the clinic budget is spent, and the budget is shared by its users", async () => {
    const ownerToken = await accessToken(OWNER);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await http.get("/api/v1/sync/pull").set("Authorization", `Bearer ${ownerToken}`);
      statuses.push(res.status);
    }
    expect(statuses[0]).toBe(200);
    const limited = statuses.filter((s) => s === 429);
    expect(limited.length).toBeGreaterThan(0);

    // Same clinic, different user, same bucket — the budget is tenant-scoped.
    const colleagueToken = await accessToken(SECOND_USER);
    const shared = await http.get("/api/v1/sync/pull").set("Authorization", `Bearer ${colleagueToken}`);
    expect(shared.status).toBe(429);
    expect((shared.body as { code?: string }).code).toBe("TOO_MANY_REQUESTS");
  });
});
