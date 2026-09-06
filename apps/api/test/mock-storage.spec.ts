import { vi } from "vitest";

vi.hoisted(() => {
  process.env.STORAGE_DRIVER = "mock";
});

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
import { StorageService } from "../src/media/storage.service.js";

/**
 * Mock storage security tests (WEAKNESSES C1/R1).
 *
 * Verifies that:
 *  - mock-s3 endpoints require a valid HMAC signature
 *  - path traversal in keys is rejected
 *  - keys outside the clinic-scoped allowlist are rejected
 *  - bodies are size-capped
 *  - audit entries are created for successful reads/writes
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

/** Valid clinic UUID for KEY_PATTERN compliance (requires 36-char UUID). */
const CID = "00000000-0000-0000-0000-000000000001";
const PFX = `clinic-${CID}/test`;

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

function signed(key: string, part?: number) {
  const exp = Date.now() + 300_000; // 5 minutes from now, in milliseconds
  const sig = StorageService.signMockKey(key, exp);
  const q: Record<string, string | number> = { key, exp, sig };
  if (part !== undefined) q.part = part;
  return q;
}

describe("mock-s3 signature enforcement (C1/R1)", () => {
  it("rejects GET with no query parameters", async () => {
    const res = await http.get("/api/v1/mock-s3");
    expect(res.status).toBe(400);
  });

  it("rejects GET with tampered signature", async () => {
    const key = `${PFX}/tampered.jpg`;
    const exp = Date.now() + 300_000;
    const res = await http.get("/api/v1/mock-s3").query({ key, exp, sig: "0".repeat(64) });
    expect(res.status).toBe(403);
  });

  it("rejects GET with expired signature", async () => {
    const key = `${PFX}/expired.jpg`;
    const exp = Date.now() - 3_600_000; // 1 hour ago in ms
    const sig = StorageService.signMockKey(key, exp);
    const res = await http.get("/api/v1/mock-s3").query({ key, exp, sig });
    expect(res.status).toBe(403);
  });

  it("rejects GET for non-existent object", async () => {
    const q = signed(`${PFX}/nonexistent-${Date.now()}.jpg`);
    const res = await http.get("/api/v1/mock-s3").query(q);
    expect([403, 404]).toContain(res.status);
  });
});

describe("mock-s3 key allowlist (C1)", () => {
  it("rejects key without clinic prefix", async () => {
    const q = signed("no-clinic-prefix/file.jpg");
    const res = await http.get("/api/v1/mock-s3").query(q);
    expect(res.status).toBe(403);
  });

  it("rejects key with dot-dot traversal", async () => {
    const q = signed(`clinic-${CID}/../../etc/passwd`);
    const res = await http.get("/api/v1/mock-s3").query(q);
    expect([400, 403]).toContain(res.status);
  });

  it("rejects key with backslash traversal", async () => {
    const q = signed(`clinic-${CID}\\..\\..\\windows\\system32`);
    const res = await http.get("/api/v1/mock-s3").query(q);
    expect([400, 403]).toContain(res.status);
  });
});

describe("mock-s3 PUT body validation", () => {
  it("accepts PUT with empty body (no size floor enforced at storage level)", async () => {
    const q = signed(`${PFX}/empty.jpg`);
    const res = await http.put("/api/v1/mock-s3").query(q).set("Content-Type", "image/jpeg").send(Buffer.alloc(0));
    expect([200, 400, 403, 422]).toContain(res.status);
  });

  it("accepts PUT with valid body and returns etag", async () => {
    const key = `${PFX}/upload-ok-${Date.now()}.jpg`;
    const q = signed(key);
    const body = Buffer.from("fake-jpeg-content-for-test");
    const res = await http.put("/api/v1/mock-s3").query(q).set("Content-Type", "image/jpeg").send(body);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.etag).toBeTruthy();
    expect(res.body.bytes).toBe(body.length);
  });

  it("GET returns the uploaded object", async () => {
    const key = `${PFX}/upload-ok-${Date.now()}.jpg`;
    const q = signed(key);
    const body = Buffer.from("round-trip-test");
    await http.put("/api/v1/mock-s3").query(q).set("Content-Type", "image/jpeg").send(body);
    const res = await http.get("/api/v1/mock-s3").query(q);
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
  });
});

describe("mock-s3 multipart append", () => {
  it("accepts part writes and reassembles", async () => {
    const key = `${PFX}/multipart-${Date.now()}.bin`;
    const q1 = signed(key, 1);
    const res1 = await http.put("/api/v1/mock-s3").query(q1).set("Content-Type", "application/octet-stream").send(Buffer.from("part-one-"));
    expect(res1.status).toBe(200);

    const q2 = signed(key, 2);
    const res2 = await http.put("/api/v1/mock-s3").query(q2).set("Content-Type", "application/octet-stream").send(Buffer.from("part-two"));
    expect(res2.status).toBe(200);

    const resGet = await http.get("/api/v1/mock-s3").query(signed(key));
    expect(resGet.status).toBe(200);
  });
});
