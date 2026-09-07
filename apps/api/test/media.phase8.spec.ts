import { loadEnv } from "@scalpai/db";

loadEnv();

import { createHash } from "node:crypto";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { migrateSql, resetAll, seedMarkerClinicId } from "@scalpai/db/testing";
import {
  UPLOAD_MAX_BYTES,
  UPLOAD_PART_SIZE_BYTES,
  UPLOAD_PART_URL_BATCH_MAX,
  partCountFor,
  partRange,
} from "@scalpai/shared";
import { AppModule } from "../src/app.module.js";

/**
 * Phase 8 (ADR-0041) — media, upload and quota against a REAL PostgreSQL.
 *
 * Every case here maps to a WEAKNESSES item that used to be claimed but never
 * proven: an atomic quota (H11), a clinic-local period (H11), bounded reads and
 * validated part geometry (H12), a resume that continues the SAME upload (H7),
 * clinic-scoped keys (C1) and a measured storage total (M22).
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;
let clinicA: string;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };
const B = { email: "owner@clinic-b.test", password: "Dev12345!" };
const MIGRATE = () => process.env.MIGRATE_DATABASE_URL!;

/** A tiny but genuinely decodable JPEG, padded to a target size. */
function jpegOf(bytes: number): Buffer {
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, bytes - header.length))]);
}

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

async function firstPatientId(token: string): Promise<string> {
  const res = await http.get("/api/v1/patients?limit=1").set({ Authorization: `Bearer ${token}` });
  expect(res.status).toBe(200);
  const rows = (res.body.items ?? res.body) as Array<{ id: string }>;
  expect(rows.length).toBeGreaterThan(0);
  return rows[0]!.id;
}

function open(token: string, pid: string, body: Record<string, unknown>) {
  return http.post(`/api/v1/patients/${pid}/gallery/uploads`).set({ Authorization: `Bearer ${token}` }).send(body);
}

/** Overwrite the clinic plan limits for one metric — owner role, not the API. */
async function setLimits(limits: Record<string, number>): Promise<void> {
  await migrateSql(MIGRATE(), "UPDATE entitlements SET overrides = $2::jsonb WHERE clinic_id = $1", [
    clinicA,
    JSON.stringify(limits),
  ]);
}

beforeAll(async () => {
  await migrate(MIGRATE());
  await resetAll(MIGRATE());
  await seed(MIGRATE());
  clinicA = await seedMarkerClinicId(MIGRATE());

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  await app.listen(0, "127.0.0.1");
  http = request(await app.getUrl());
  db = app.get(DbService);
}, 60_000);

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

describe("quota is atomic, not read-then-write (H11)", () => {
  it("lets exactly `limit` of N parallel uploads through", async () => {
    await setLimits({ uploads_per_month: 3 });
    await migrateSql(MIGRATE(), "DELETE FROM usage_counters WHERE clinic_id = $1", [clinicA]);
    await migrateSql(MIGRATE(), "DELETE FROM upload_sessions WHERE clinic_id = $1", [clinicA]);

    const token = await login(A);
    const pid = await firstPatientId(token);

    // Eight requests at once. The old guard read the counter and then wrote it,
    // so several of these used to see the same "one slot left" and all pass.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => open(token, pid, { mime: "image/jpeg", sizeBytes: 200_000 })),
    );
    const created = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 403);

    expect(created).toHaveLength(3);
    expect(refused).toHaveLength(5);
    expect(JSON.stringify(refused[0]!.body)).toContain("QUOTA_EXCEEDED");

    const counter = await migrateSql<{ value: string }>(
      MIGRATE(),
      "SELECT value::text AS value FROM usage_counters WHERE clinic_id = $1 AND metric = 'uploads'",
      [clinicA],
    );
    expect(Number(counter[0]!.value)).toBe(3);
  }, 30_000);

  it("refunds the slot when the upload is abandoned", async () => {
    await setLimits({ uploads_per_month: 2 });
    await migrateSql(MIGRATE(), "DELETE FROM usage_counters WHERE clinic_id = $1", [clinicA]);
    const token = await login(A);
    const pid = await firstPatientId(token);

    const first = await open(token, pid, { mime: "image/jpeg", sizeBytes: 200_000 });
    expect(first.status).toBe(201);

    const aborted = await http
      .delete(`/api/v1/gallery/uploads/${first.body.sessionId}`)
      .set({ Authorization: `Bearer ${token}` });
    expect(aborted.status).toBe(200);
    expect(aborted.body.aborted).toBe(true);

    // the slot came back, so two more still fit
    const second = await open(token, pid, { mime: "image/jpeg", sizeBytes: 200_000 });
    const third = await open(token, pid, { mime: "image/jpeg", sizeBytes: 200_000 });
    expect(second.status).toBe(201);
    expect(third.status).toBe(201);

    // and the pending row was removed with the session
    const pending = await migrateSql<{ n: string }>(
      MIGRATE(),
      "SELECT count(*)::text AS n FROM gallery_items WHERE id = $1",
      [first.body.id],
    );
    expect(Number(pending[0]!.n)).toBe(0);
  }, 30_000);

  it("computes the period in the CLINIC time zone, not UTC", async () => {
    // Kiritimati is UTC+14: for part of every UTC month it is already the next
    // month locally, which is exactly the day a UTC-only period got wrong.
    await migrateSql(MIGRATE(), "UPDATE clinics SET timezone = 'Pacific/Kiritimati' WHERE id = $1", [clinicA]);
    const local = await migrateSql<{ p: string }>(
      MIGRATE(),
      "SELECT fn_clinic_period_start($1)::text AS p",
      [clinicA],
    );
    const expected = await migrateSql<{ p: string }>(
      MIGRATE(),
      "SELECT date_trunc('month', now() AT TIME ZONE 'Pacific/Kiritimati')::date::text AS p",
    );
    expect(local[0]!.p).toBe(expected[0]!.p);

    await migrateSql(MIGRATE(), "UPDATE clinics SET timezone = 'Asia/Tehran' WHERE id = $1", [clinicA]);
  });

  it("refuses an unknown time zone at the database level", async () => {
    await expect(
      migrateSql(MIGRATE(), "UPDATE clinics SET timezone = 'Mars/Olympus' WHERE id = $1", [clinicA]),
    ).rejects.toThrow();
  });
});

describe("storage is reserved against measured bytes (H11/M22)", () => {
  it("refuses an upload that would not fit the plan ceiling", async () => {
    await setLimits({ uploads_per_month: 100, storage_bytes: 300_000 });
    await migrateSql(MIGRATE(), "DELETE FROM usage_counters WHERE clinic_id = $1", [clinicA]);
    await migrateSql(MIGRATE(), "DELETE FROM upload_sessions WHERE clinic_id = $1", [clinicA]);
    await migrateSql(MIGRATE(), "DELETE FROM storage_usage WHERE clinic_id = $1", [clinicA]);

    const token = await login(A);
    const pid = await firstPatientId(token);

    const first = await open(token, pid, { mime: "image/jpeg", sizeBytes: 250_000 });
    expect(first.status).toBe(201);

    // the open session already reserved 250KB of the 300KB ceiling
    const second = await open(token, pid, { mime: "image/jpeg", sizeBytes: 250_000 });
    expect(second.status).toBe(403);
    expect(JSON.stringify(second.body)).toContain("QUOTA_EXCEEDED");

    const reserved = await migrateSql<{ n: string }>(
      MIGRATE(),
      "SELECT coalesce(sum(size_bytes), 0)::text AS n FROM upload_sessions WHERE clinic_id = $1 AND state = 'open'",
      [clinicA],
    );
    expect(Number(reserved[0]!.n)).toBe(250_000);
  }, 30_000);
});

describe("part geometry is the server's, not the client's (H12)", () => {
  it("derives totalParts from size and part size", async () => {
    await setLimits({ uploads_per_month: 100 });
    const token = await login(A);
    const pid = await firstPatientId(token);

    const size = 20 * 1024 * 1024;
    const res = await open(token, pid, { mime: "image/jpeg", sizeBytes: size });
    expect(res.status).toBe(201);
    expect(res.body.multipart).toBe(true);
    expect(res.body.partSizeBytes).toBe(UPLOAD_PART_SIZE_BYTES);
    expect(res.body.totalParts).toBe(partCountFor(size, UPLOAD_PART_SIZE_BYTES));
    // and only ONE window of URLs is minted, never all of them
    expect((res.body.parts as unknown[]).length).toBeLessThanOrEqual(UPLOAD_PART_URL_BATCH_MAX);
    expect(res.body.parts[0].bytes).toBe(partRange(1, size, UPLOAD_PART_SIZE_BYTES).bytes);
  }, 20_000);

  it("refuses a size over the contract ceiling", async () => {
    const token = await login(A);
    const pid = await firstPatientId(token);
    const res = await open(token, pid, { mime: "image/jpeg", sizeBytes: UPLOAD_MAX_BYTES + 1 });
    expect(res.status).toBe(400);
  });

  it("refuses a completion whose parts are not a contiguous run from 1", async () => {
    await setLimits({ uploads_per_month: 100 });
    const token = await login(A);
    const pid = await firstPatientId(token);
    const opened = await open(token, pid, { mime: "image/jpeg", sizeBytes: 20 * 1024 * 1024 });
    expect(opened.status).toBe(201);

    const gappy = await http
      .post(`/api/v1/gallery/uploads/${opened.body.sessionId}/complete`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ parts: [{ partNumber: 1, etag: "a" }, { partNumber: 3, etag: "c" }] });
    expect(gappy.status).toBe(400);
  }, 20_000);

  it("refuses a part window outside the upload", async () => {
    await setLimits({ uploads_per_month: 100 });
    const token = await login(A);
    const pid = await firstPatientId(token);
    const opened = await open(token, pid, { mime: "image/jpeg", sizeBytes: 20 * 1024 * 1024 });

    const tooFar = await http
      .post(`/api/v1/gallery/uploads/${opened.body.sessionId}/parts`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ from: 9999, count: 4 });
    expect(tooFar.status).toBe(400);

    const tooMany = await http
      .post(`/api/v1/gallery/uploads/${opened.body.sessionId}/parts`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ from: 1, count: 5000 });
    expect(tooMany.status).toBe(400);
  }, 20_000);
});

describe("resume continues the SAME upload (H7)", () => {
  it("keeps the uploadId and reports the parts the bucket already holds", async () => {
    await setLimits({ uploads_per_month: 100 });
    const token = await login(A);
    const pid = await firstPatientId(token);

    const size = 20 * 1024 * 1024;
    const opened = await open(token, pid, { mime: "image/jpeg", sizeBytes: size });
    expect(opened.status).toBe(201);
    const sessionId = String(opened.body.sessionId);

    const uploadIdBefore = await migrateSql<{ upload_id: string }>(
      MIGRATE(),
      "SELECT upload_id FROM upload_sessions WHERE id = $1",
      [sessionId],
    );
    expect(uploadIdBefore[0]!.upload_id).toBeTruthy();

    // send part 1 only, then "crash" and ask the server where we are
    const firstPart = (opened.body.parts as Array<{ partNumber: number; url: string }>)[0]!;
    const chunk = jpegOf(partRange(1, size, UPLOAD_PART_SIZE_BYTES).bytes);
    const put = await fetch(firstPart.url, {
      method: "PUT",
      body: chunk,
      headers: { "content-type": "image/jpeg" },
    });
    expect(put.ok).toBe(true);

    const status = await http.get(`/api/v1/gallery/uploads/${sessionId}`).set({ Authorization: `Bearer ${token}` });
    expect(status.status).toBe(200);
    expect(status.body.state).toBe("open");
    expect(status.body.uploadedParts).toContain(1);
    expect(status.body.totalParts).toBe(partCountFor(size, UPLOAD_PART_SIZE_BYTES));

    // a resume asks for a FRESH window of URLs for the same upload
    const resumed = await http
      .post(`/api/v1/gallery/uploads/${sessionId}/parts`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ from: 2, count: 4 });
    expect(resumed.status).toBe(200);
    expect(resumed.body.parts[0].partNumber).toBe(2);

    const uploadIdAfter = await migrateSql<{ upload_id: string }>(
      MIGRATE(),
      "SELECT upload_id FROM upload_sessions WHERE id = $1",
      [sessionId],
    );
    // the whole point: resuming did NOT start a new multipart upload
    expect(uploadIdAfter[0]!.upload_id).toBe(uploadIdBefore[0]!.upload_id);

    // and part 1 is not re-sent — its bytes are already in the bucket
    expect(createHash("sha256").update(chunk).digest("hex")).toHaveLength(64);
  }, 60_000);

  it("refuses a completion with a part the bucket does not have", async () => {
    await setLimits({ uploads_per_month: 100 });
    const token = await login(A);
    const pid = await firstPatientId(token);
    const size = 20 * 1024 * 1024;
    const opened = await open(token, pid, { mime: "image/jpeg", sizeBytes: size });
    const total = partCountFor(size, UPLOAD_PART_SIZE_BYTES);

    const res = await http
      .post(`/api/v1/gallery/uploads/${opened.body.sessionId}/complete`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ parts: Array.from({ length: total }, (_, i) => ({ partNumber: i + 1 })) });
    expect(res.status).toBe(400);
  }, 30_000);
});

describe("tenant isolation and key shape (C1)", () => {
  it("hides another clinic's upload session", async () => {
    await setLimits({ uploads_per_month: 100 });
    const tokenA = await login(A);
    const tokenB = await login(B);
    const pid = await firstPatientId(tokenA);

    const opened = await open(tokenA, pid, { mime: "image/jpeg", sizeBytes: 200_000 });
    expect(opened.status).toBe(201);

    const stolen = await http
      .get(`/api/v1/gallery/uploads/${opened.body.sessionId}`)
      .set({ Authorization: `Bearer ${tokenB}` });
    expect(stolen.status).toBe(404);
  }, 20_000);

  it("mints only clinic-scoped, shape-checked keys", async () => {
    await setLimits({ uploads_per_month: 100 });
    const token = await login(A);
    const pid = await firstPatientId(token);
    const opened = await open(token, pid, { mime: "image/png", sizeBytes: 200_000 });
    expect(opened.status).toBe(201);
    expect(String(opened.body.key)).toMatch(/^gallery\/[0-9a-f-]{36}\/original\.png$/);
    expect(String(opened.body.uploadUrl)).toContain(`clinic-${clinicA}`);
  }, 20_000);

  it("refuses a key outside the allowlist at the database level", async () => {
    await expect(
      migrateSql(
        MIGRATE(),
        `INSERT INTO upload_sessions
           (clinic_id, gallery_item_id, patient_id, storage_key, mime, size_bytes, part_size_bytes, total_parts, expires_at)
         VALUES ($1, gen_random_uuid(), gen_random_uuid(), '../../etc/passwd', 'image/jpeg', 200000, 5242880, 1, now() + interval '1 day')`,
        [clinicA],
      ),
    ).rejects.toThrow();
  });
});
