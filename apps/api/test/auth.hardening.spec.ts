import { loadEnv } from "@scalpai/db";

loadEnv();

// Deterministic locks for this suite — must be set before AppModule reads them.
process.env.AUTH_LOCK_MS = "300";
process.env.AUTH_LOCK_MAX_MS = "300";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { resetAll } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";

/** Slice M6 — W16 progressive lockout + W17 security headers. */

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

describe("login throttling (W16)", () => {
  it("locks an email progressively after 5 failures and recovers", async () => {
    const email = "owner@clinic-a.test";
    // 5 consecutive wrong passwords
    for (let i = 0; i < 5; i++) {
      const r = await http.post("/api/v1/auth/login").send({ email, password: `wrong-${i}12345` });
      expect(r.status).toBe(401);
    }
    // correct password is ALSO rejected while locked
    const locked = await http.post("/api/v1/auth/login").send({ email, password: "Dev12345!" });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("LOGIN_LOCKED");

    // lock expires (AUTH_LOCK_MS=300) and success resets the counter
    await new Promise((r) => setTimeout(r, 400));
    const ok = await http.post("/api/v1/auth/login").send({ email, password: "Dev12345!" });
    expect(ok.status).toBe(201);
  });

  it("rate-limits logins per IP (429 TOO_MANY_REQUESTS)", async () => {
    let saw429 = 0;
    for (let i = 0; i < 25; i++) {
      const r = await http.post("/api/v1/auth/login").send({
        email: `flood${i}@clinic-a.test`,
        password: "Dev12345!",
      });
      if (r.status === 429 && r.body.code === "TOO_MANY_REQUESTS") saw429 += 1;
    }
    expect(saw429).toBeGreaterThan(0);
  });
});

describe("security headers (W17)", () => {
  it("helmet adds hardening headers to API responses", async () => {
    const res = await http.get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-frame-options"]).toBeTruthy();
    expect(res.headers["strict-transport-security"]).toBeTruthy();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
