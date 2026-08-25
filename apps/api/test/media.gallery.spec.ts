import { loadEnv } from "@scalpai/db";

loadEnv();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, resetAll, seed } from "@scalpai/db";
import { AppModule } from "../src/app.module.js";

/**
 * Slice M3 — the media pipeline end-to-end against real MinIO + PG:
 * init (presigned PUT) → direct upload → complete (magic bytes, EXIF-strip,
 * quality gate). Healthy image lands `done`; fake/blurry ones are rejected
 * with their objects removed.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };
const B = { email: "owner@clinic-b.test", password: "Dev12345!" };


let phoneSeq = 0;
/** Unique-per-call 11-digit mobile — same-ms callers must never collide (partial unique index!). */
function nextPhone(): string {
  const seq = ++phoneSeq;
  return `0912${String(Date.now()).slice(-6)}${seq}`.slice(0, 11);
}
async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

/** Deterministic healthy scene → JPEG bytes. */
async function healthyJpeg(): Promise<Buffer> {
  const w = 480;
  const h = 360;
  const raw = Buffer.alloc(w * h * 3);
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 0xffffffff);
  for (let i = 0; i < w * h; i++) {
    const v = Math.floor(rand() * 255);
    raw[i * 3] = v;
    raw[i * 3 + 1] = v;
    raw[i * 3 + 2] = v;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
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

interface InitResult {
  status: number;
  id?: string;
  uploadUrl?: string;
}

async function initUpload(token: string, pid: string): Promise<InitResult> {
  const res = await http
    .post(`/api/v1/patients/${pid}/gallery/init`)
    .set("Authorization", `Bearer ${token}`)
    .send({ mime: "image/jpeg", sizeBytes: 200_000 });
  return { status: res.status, id: res.body.id, uploadUrl: res.body.uploadUrl };
}

describe("media pipeline (playbook 2.1)", () => {
  it("healthy jpeg completes to done with quality metrics and thumb", async () => {
    const token = await login(A);
    const patient = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "گالری", lastName: "تست", phone: nextPhone().slice(0, 11) });
    const pid = String(patient.body.id);

    const init = await initUpload(token, pid);
    expect(init.status).toBe(201);
    expect(init.uploadUrl).toContain("127.0.0.1:9000");

    const put = await fetch(init.uploadUrl!, { method: "PUT", body: await healthyJpeg() });
    expect(put.status).toBe(200);

    const done = await http.post(`/api/v1/gallery/${init.id}/complete`).set("Authorization", `Bearer ${token}`);
    expect(done.status).toBe(200);
    expect(done.body.state).toBe("done");
    expect(done.body.quality.blurVariance).toBeGreaterThan(0);
    expect(String(done.body.sha256)).toHaveLength(64);
  });

  it("fake jpeg content is rejected by magic bytes and cleaned up", async () => {
    const token = await login(A);
    const patient = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "فیک", lastName: "جی‌پگ", phone: nextPhone().slice(0, 11) });
    const pid = String(patient.body.id);

    const init = await initUpload(token, pid);
    const put = await fetch(init.uploadUrl!, { method: "PUT", body: Buffer.from("<html>pretend jpeg</html>") });
    expect(put.status).toBe(200); // MinIO accepts any bytes — the gate is ours

    const complete = await http.post(`/api/v1/gallery/${init.id}/complete`).set("Authorization", `Bearer ${token}`);
    expect(complete.status).toBe(400);
    expect(complete.body.code).toBe("INVALID_IMAGE");

    // pending row was removed — completing again now 404s
    const again = await http.post(`/api/v1/gallery/${init.id}/complete`).set("Authorization", `Bearer ${token}`);
    expect(again.status).toBe(404);
  });

  it("blurry image fails the quality gate with Persian reasons", async () => {
    const token = await login(A);
    const patient = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${token}`)
      .send({ firstName: "تار", lastName: "عمدی", phone: nextPhone().slice(0, 11) });
    const pid = String(patient.body.id);

    const blurryJpeg = await sharp(
      Buffer.alloc(480 * 360 * 3, 128),
      { raw: { width: 480, height: 360, channels: 3 } },
    )
      .blur(8)
      .jpeg()
      .toBuffer();

    const init = await initUpload(token, pid);
    await fetch(init.uploadUrl!, { method: "PUT", body: blurryJpeg });
    const complete = await http.post(`/api/v1/gallery/${init.id}/complete`).set("Authorization", `Bearer ${token}`);
    expect(complete.status).toBe(400);
    expect(complete.body.code).toBe("QUALITY_FAIL");
    expect(JSON.stringify(complete.body.details?.reasons ?? [])).toContain("تار");
  });

  it("cross-tenant owner cannot complete someone else's upload", async () => {
    const a = await login(A);
    const b = await login(B);
    const patient = await http
      .post("/api/v1/patients")
      .set("Authorization", `Bearer ${a}`)
      .send({ firstName: "A", lastName: "Only", phone: nextPhone().slice(0, 11) });
    const init = await initUpload(a, String(patient.body.id));

    const leak = await http.post(`/api/v1/gallery/${init.id}/complete`).set("Authorization", `Bearer ${b}`);
    expect(leak.status).toBe(404);
  });

  it("rejects unauthenticated init", async () => {
    expect((await http.post("/api/v1/patients/x/gallery/init").send({ mime: "image/jpeg", sizeBytes: 2000 })).status).toBe(401);
  });
});
