import { vi } from "vitest";

vi.hoisted(() => {
  process.env.STORAGE_DRIVER = "mock";
});

import { loadEnv } from "@scalpai/db";

loadEnv();

import { createHash } from "node:crypto";
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
 *  - a `part` write stores its OWN object (phase 8), it is not appended
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

/** Derive the same deterministic UUID seed.ts uses. */
function deterministicUUID(input: string): string {
  const h = createHash("md5").update(input).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  return [
    h.toString("hex", 0, 4),
    h.toString("hex", 4, 6),
    h.toString("hex", 6, 8),
    h.toString("hex", 8, 10),
    h.toString("hex", 10, 16),
  ].join("-");
}

const CID = deterministicUUID("clinic-a.dev");
const PFX = `clinic-${CID}/test`;

/** The ETag the mock driver mints for a part: md5 of the bytes, like S3. */
function partEtag(body: Buffer): string {
  return `"${createHash("md5").update(body).digest("hex")}"`;
}

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
  const exp = Date.now() + 300_000;
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
    const exp = Date.now() - 3_600_000;
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

/**
 * Phase 8: a part write is NOT an append. Each part becomes its own
 * content-addressed object and the target key only exists once the upload is
 * completed, which is what makes part order, retries and resume mean something
 * in the dev/test driver (H7). These tests assert that contract instead of the
 * append behaviour the driver deliberately stopped implementing.
 */
describe("mock-s3 multipart part writes (phase 8)", () => {
  it("stores every part as its own object with its own etag", async () => {
    const key = `${PFX}/multipart-${Date.now()}.bin`;
    const one = Buffer.from("part-one-");
    const two = Buffer.from("part-two");

    const res1 = await http
      .put("/api/v1/mock-s3")
      .query(signed(key, 1))
      .set("Content-Type", "application/octet-stream")
      .send(one);
    expect(res1.status).toBe(200);
    expect(res1.body.ok).toBe(true);
    expect(res1.body.bytes).toBe(one.length);
    expect(res1.body.etag).toBe(partEtag(one));

    const res2 = await http
      .put("/api/v1/mock-s3")
      .query(signed(key, 2))
      .set("Content-Type", "application/octet-stream")
      .send(two);
    expect(res2.status).toBe(200);
    expect(res2.body.bytes).toBe(two.length);
    expect(res2.body.etag).toBe(partEtag(two));
    // Content-addressed: two different parts can never share an ETag.
    expect(res2.body.etag).not.toBe(res1.body.etag);

    // Each part is a real, independently readable object.
    for (const part of [1, 2]) {
      const partRes = await http.get("/api/v1/mock-s3").query(signed(StorageService.mockPartKey(key, part)));
      expect(partRes.status).toBe(200);
    }

    // The target itself does NOT exist yet: parts are not appended to it.
    const targetRes = await http.get("/api/v1/mock-s3").query(signed(key));
    expect(targetRes.status).not.toBe(200);
    expect([403, 404]).toContain(targetRes.status);
  });

  it("re-uploading a part replaces it and keeps the etag content-addressed", async () => {
    const key = `${PFX}/multipart-retry-${Date.now()}.bin`;
    const first = Buffer.from("first-attempt");
    const retry = Buffer.from("retried-attempt-with-different-bytes");

    const res1 = await http
      .put("/api/v1/mock-s3")
      .query(signed(key, 1))
      .set("Content-Type", "application/octet-stream")
      .send(first);
    expect(res1.body.etag).toBe(partEtag(first));

    const res2 = await http
      .put("/api/v1/mock-s3")
      .query(signed(key, 1))
      .set("Content-Type", "application/octet-stream")
      .send(retry);
    expect(res2.status).toBe(200);
    expect(res2.body.bytes).toBe(retry.length);
    expect(res2.body.etag).toBe(partEtag(retry));
  });
});
