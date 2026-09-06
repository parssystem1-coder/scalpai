import { vi } from "vitest";

vi.hoisted(() => {
  process.env.STORAGE_DRIVER = "mock";
  process.env.AUTH_LOCK_MS = "200";
  process.env.AUTH_LOCK_MAX_MS = "200";
});

import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, resetAll, seed } from "@scalpai/db";
import { AppModule } from "../src/app.module.js";

/**
 * Phase 1 negative e2e tests (WEAKNESSES C1,C3,C6,C7,H1,R12).
 *
 * Covers:
 *  - Forged / malformed JWT access tokens are rejected
 *  - Missing / empty Authorization header is rejected on protected endpoints
 *  - Refresh token reuse after logout is rejected
 *  - Mock-s3 GET/PUT without valid HMAC signature is rejected
 *  - Unauthorized origin (simulated via missing Origin header) returns no CORS headers
 *  - Login with wrong credentials returns 401
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

beforeAll(async () => {
  await migrate(process.env.MIGRATE_DATABASE_URL!);
  await resetAll(process.env.MIGRATE_DATABASE_URL!);
  await seed(process.env.MIGRATE_DATABASE_URL!);

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

describe("forged / malformed JWT (C6, R12)", () => {
  it("rejects a completely fake Bearer token", async () => {
    const res = await http
      .get("/api/v1/patients")
      .set("Authorization", "Bearer totally-fake-jwt-token");
    expect(res.status).toBe(401);
  });

  it("rejects a JWT signed with wrong secret (tampered header.payload)", async () => {
    // Build a structurally valid but wrongly-signed JWT
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "00000000-0000-0000-0000-000000000000", clinicId: "clinic-a", role: "owner", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString("base64url");
    const fakeSig = "a".repeat(64);
    const forgedToken = `${header}.${payload}.${fakeSig}`;

    const res = await http
      .get("/api/v1/patients")
      .set("Authorization", `Bearer ${forgedToken}`);
    expect(res.status).toBe(401);
  });

  it("rejects Bearer without a token part", async () => {
    const res = await http
      .get("/api/v1/patients")
      .set("Authorization", "Bearer ");
    expect(res.status).toBe(401);
  });

  it("rejects non-Bearer scheme", async () => {
    const res = await http
      .get("/api/v1/patients")
      .set("Authorization", "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
  });
});

describe("missing auth on protected endpoints (C3, R12)", () => {
  it("GET /patients returns 401 without Authorization", async () => {
    const res = await http.get("/api/v1/patients");
    expect(res.status).toBe(401);
  });

  it("POST /sync/push returns 401 without Authorization", async () => {
    const res = await http.post("/api/v1/sync/push").send({ mutations: [] });
    expect(res.status).toBe(401);
  });
});

describe("login failure cases (C3, R12)", () => {
  it("returns 401 for wrong password", async () => {
    const res = await http
      .post("/api/v1/auth/login")
      .send({ email: "owner@clinic-a.test", password: "wrong-password-123" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 for non-existent email", async () => {
    const res = await http
      .post("/api/v1/auth/login")
      .send({ email: "nonexistent@nowhere.test", password: "Dev12345!" });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing email field", async () => {
    const res = await http
      .post("/api/v1/auth/login")
      .send({ password: "Dev12345!" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing password field", async () => {
    const res = await http
      .post("/api/v1/auth/login")
      .send({ email: "owner@clinic-a.test" });
    expect(res.status).toBe(400);
  });
});

describe("refresh token reuse after logout (H1)", () => {
  it("rejects a refresh token that was already logged out", async () => {
    // Login to get a refresh cookie
    const loginRes = await http
      .post("/api/v1/auth/login")
      .send({ email: "owner@clinic-a.test", password: "Dev12345!" });
    expect(loginRes.status).toBe(201);
    const refreshCookie = loginRes.headers["set-cookie"]?.[0]?.split(";")[0];

    // Logout (revokes the token family)
    const logoutRes = await http.post("/api/v1/auth/logout").set("Cookie", refreshCookie);
    expect(logoutRes.status).toBe(201);

    // Attempt refresh with the same (now revoked) cookie
    const refreshRes = await http.post("/api/v1/auth/refresh").set("Cookie", refreshCookie);
    expect(refreshRes.status).toBe(401);
  });
});

describe("mock-s3 without valid signature (C1)", () => {
  it("rejects GET /mock-s3 without query params", async () => {
    const res = await http.get("/api/v1/mock-s3");
    expect(res.status).toBe(400);
  });

  it("rejects GET /mock-s3 with invalid signature", async () => {
    const res = await http
      .get("/api/v1/mock-s3")
      .query({
        key: "clinic-a/test/file.jpg",
        exp: Math.floor(Date.now() / 1000) + 300,
        sig: "a".repeat(64),
      });
    expect(res.status).toBe(403);
  });

  it("rejects PUT /mock-s3 with traversal in key", async () => {
    const res = await http
      .put("/api/v1/mock-s3")
      .query({
        key: "clinic-a/../../etc/passwd",
        exp: Math.floor(Date.now() / 1000) + 300,
        sig: "b".repeat(64),
      })
      .set("Content-Type", "image/jpeg")
      .send(Buffer.from("data"));
    expect([400, 403]).toContain(res.status);
  });
});

describe("CORS — no reflection of arbitrary origin (C7)", () => {
  it("does not echo back Access-Control-Allow-Origin for unknown origin", async () => {
    const res = await http
      .get("/api/v1/health")
      .set("Origin", "https://evil-attacker.com");
    // Either no ACAO header, or it's not the attacker origin
    const acao = res.headers["access-control-allow-origin"];
    if (acao) {
      expect(acao).not.toBe("https://evil-attacker.com");
    }
  });
});
