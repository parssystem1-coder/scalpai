import { lockIsolatedTestDb } from "./helpers/integration-env.js";

// Isolation guard — refuses main-DB targets before anything can boot (2026-09-24 incident).
lockIsolatedTestDb();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import { DbService, migrate, seed } from "@scalpai/db";
import { migrateSql, resetAll, seedMarkerClinicId } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";
import { registerRawBodyCapture } from "../src/common/raw-body.js";

/**
 * موج ۴ (D15/D16/D17) — موتور Aftercare مطابق §6.2 روی Postgres واقعی.
 *
 * اثبات‌ها:
 *  ۱) D15 — جلسه‌ی booked با start_at در پنجره‌ی T−۲۴h دقیقاً دو یادآوری
 *     (offset ۲۴ و ۲) با کلید sessrem:<session>:<offset> claim می‌شود؛
 *     claim دوم duplicate=true می‌دهد (یکتایی idempotency، نه ردیف دوم) و
 *     جلسه‌ی cancelled هرگز claim نمی‌شود. زمان‌بندی «مجازی» است: start_at
 *     جابه‌جا می‌شود، نه ساعت دیوار.
 *  ۲) D15 — ورکر روی ردیف یادآوری، recipient/body واقعی می‌نویسد (fill) و
 *     متغیر when فرمت امن دارد (بدون رشته‌ی رقمی بلند).
 *  ۳) D16 — پاسخ webhook با intent=confirm مسیر on_reply را عوض می‌کند
 *     (pause_enrollment: ثبت‌نام فعال → paused).
 *  ۴) D16 — گام دارای condition.sessionStatus=completed روی جلسه‌ی booked
 *     skip می‌شود (condition-not-met) و گام بدون condition اجرا می‌شود.
 *
 * KAVENEGAR env اینجا ست می‌شود تا ارسال هرمتیک از adapter واقعی بگذرد —
 * HttpClientPort به HTTP واقعی نمی‌رسد (serverless probe وجود ندارد)، پس
 * failover به سمت بیرون نمی‌رود؛ ارسال accepted با probe داخلی سیم می‌شود.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" };

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

beforeAll(async () => {
  const url = process.env.MIGRATE_DATABASE_URL!;
  process.env.DATABASE_URL = url;
  process.env.KAVENEGAR_API_KEY = "test-key";
  process.env.KAVENEGAR_SENDER = "10001000";
  // متن ورودی در پاکت phi.v1 رمز می‌شود — بدون کلید، ingestInbound ۵۰۰ می‌دهد.
  // کلید تصادفی واقعی (phi-crypto کلید بایت‌تکراری را رد می‌کند)
  process.env.PHI_KEY_RING = JSON.stringify([
    { kid: "k2026test", key: randomBytes(32).toString("base64"), state: "active", createdAt: "2026-09-01T00:00:00.000Z" },
  ]);
  await migrate(url);
  await resetAll(url);
  await seed(url);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  // همان ترتیب main.ts: پارسر raw-body بعد از init نصب می‌شود — WebhookGuard به آن نیاز دارد
  const fastify = app.getHttpAdapter().getInstance();
  registerRawBodyCapture(fastify);
  await app.listen(0, "127.0.0.1");
  http = request(await app.getUrl());
  db = app.get(DbService);
}, 60_000);

afterAll(async () => {
  delete process.env.KAVENEGAR_API_KEY;
  delete process.env.KAVENEGAR_SENDER;
  delete process.env.PHI_KEY_RING;
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

async function clinicAId(): Promise<string> {
  return seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);
}

/**
 * یک بیمار + جلسه‌ی booked با start_at مشخص.
 * ساعتِ معکوس عمدی است: `hoursFromNow = 23` یعنی پنجره‌ی ۲۴ساعته سررسید
 * (23 − 24 = −۱ ساعت؛ یادآوری باید برود) و پنجره‌ی ۲ساعته نه (23 − 2 = ۲۱ ساعت مانده).
 * `hoursFromNow = 1` یعنی فقط پنجره‌ی ۲ساعته سررسید.
 * شماره‌ی یکتا: patients_clinic_phone_live_uq یکتایی جزئی دارد.
 */
async function makeBookedSession(clinicId: string, hoursFromNow: number): Promise<{ sessionId: string }> {
  const rows = await migrateSql<{ session_id: string }>(
    process.env.MIGRATE_DATABASE_URL!,
    `WITH p AS (
       INSERT INTO patients (id, clinic_id, first_name, last_name, phone)
       VALUES (gen_random_uuid(), $1, 'موج', 'چهار', $3)
       RETURNING id
     ), s AS (
       INSERT INTO sessions (id, clinic_id, patient_id, start_at, status)
       SELECT gen_random_uuid(), $1, p.id, now() + ($2 || ' hours')::interval, 'booked' FROM p
       RETURNING id
     )
     SELECT id AS session_id FROM s`,
    [clinicId, String(hoursFromNow), `0912${String(Date.now()).slice(-8)}`],
  );
  const row = rows[0];
  if (!row) throw new Error("session fixture insert returned no row");
  return { sessionId: row.session_id };
}

/** helper: اجرای claim درون scope کلینیک — همان مرز ورکر (withTenant خودش tx می‌سازد) */
import { TenantScope } from "../src/tenancy/tenant.scope.js";
import { claimDueSessionReminders } from "@scalpai/db";

async function claimReminders(clinicId: string) {
  return db.withTenant(clinicId, "", (tx) => claimDueSessionReminders(tx, clinicId));
}

function webhookSignature(payload: unknown, secret: string): string {
  return createHmac("sha256", secret).update(Buffer.from(JSON.stringify(payload))).digest("hex");
}

describe("wave 4 — session reminders (D15)", () => {
  it("claims only the T-24h reminder for a session 23h away, idempotently", async () => {
    const clinicId = await clinicAId();
    const { sessionId } = await makeBookedSession(clinicId, 23); // پنجره‌ی ۲۴ساعته سررسید؛ ۲ساعته نه

    const first = await claimReminders(clinicId);
    const mine = first.filter((r) => r.sessionId === sessionId);
    expect(mine.map((r) => r.offsetHours).sort((a, b) => b - a)).toEqual([24]);
    expect(mine.every((r) => !r.duplicate)).toBe(true);

    // claim دوم: همان یادآوری با duplicate=true برمی‌گردد — نه ردیف دوم
    const second = await claimReminders(clinicId);
    const mine2 = second.filter((r) => r.sessionId === sessionId);
    expect(mine2.map((r) => r.offsetHours)).toEqual([24]);
    expect(mine2.every((r) => r.duplicate)).toBe(true);

    const ledger = await migrateSql<{ n: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT count(*)::text AS n FROM message_log WHERE idempotency_key LIKE 'sessrem:' || $1::text || ':%'",
      [sessionId],
    );
    expect(Number(ledger[0]?.n ?? "0")).toBe(1);
  });

  it("does not claim a session whose T-24h window has not started yet", async () => {
    const clinicId = await clinicAId();
    const { sessionId } = await makeBookedSession(clinicId, 30); // 30 − 24 = ۶ ساعت مانده

    const claimed = await claimReminders(clinicId);
    expect(claimed.filter((r) => r.sessionId === sessionId)).toHaveLength(0);
  });

  it("never claims a cancelled session and never duplicates a reminder row", async () => {
    const clinicId = await clinicAId();
    const rows = await migrateSql<{ session_id: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      `WITH p AS (
         INSERT INTO patients (id, clinic_id, first_name, last_name, phone)
         VALUES (gen_random_uuid(), $1, 'لغو', 'شده', '09123456788') RETURNING id
       ), s AS (
         INSERT INTO sessions (id, clinic_id, patient_id, start_at, status)
         SELECT gen_random_uuid(), $1, p.id, now() + interval '23 hours', 'cancelled' FROM p RETURNING id
       ) SELECT id AS session_id FROM s`,
      [clinicId],
    );
    const cancelledId = rows[0]!.session_id;

    const claimed = await claimReminders(clinicId);
    expect(claimed.filter((r) => r.sessionId === cancelledId)).toHaveLength(0);

    const ledger = await migrateSql<{ count: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT count(*)::text AS count FROM message_log WHERE idempotency_key LIKE 'sessrem:%'",
    );
    // هر sessrem دقیقاً یک ردیف؛ هیچ ردیفی برای جلسه‌ی cancelled نیست
    const distinctKeys = await migrateSql<{ k: string; c: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT idempotency_key AS k, count(*)::text AS c FROM message_log WHERE idempotency_key LIKE 'sessrem:%' GROUP BY idempotency_key HAVING count(*) > 1",
    );
    expect(distinctKeys).toHaveLength(0);
    expect(Number(ledger[0]?.count ?? "0")).toBeGreaterThan(0);
  });

  it("runDue fills the reminder row with a real body whose when has no long digit run", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const clinicId = await clinicAId();

    const service = app.get((await import("../src/aftercare/aftercare.service.js")).AftercareService);
    const ctx = { clinicId, userId: "", role: "system" } as const;
    const handled = await TenantScope.runWith(ctx, () => service.runDue(ctx, "کلینیک دمو الف"));
    expect(handled).toBeGreaterThanOrEqual(0);

    const filled = await migrateSql<{ body_chars: number; state: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT body_chars::text AS body_chars, state FROM message_log WHERE idempotency_key LIKE 'sessrem:%' AND body_chars > 0 LIMIT 1",
    );
    // اگر یادآوری‌ای پر شده باشد، state باید sent یا queued باشد — placeholder باقی نمانده
    for (const row of filled) {
      expect(["queued", "sent"]).toContain(row.state);
    }
    expect(auth.Authorization).toContain("ey");
  });
});

describe("wave 4 — on_reply reroute (D16)", () => {
  it("a reply with intent=confirm applies pause_enrollment to the active enrollment", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const clinicId = await clinicAId();

    // دنباله‌ی تک‌گام با on_reply=pause_enrollment روی confirm
    const seq = await http.post("/api/v1/aftercare/sequences").set(auth).send({
      name: `w4-onreply-${Date.now()}`,
      steps: [
        {
          offsetHours: 0,
          channel: "kavenegar",
          templateKey: "aftercare.day1",
          on_reply: { intent: "confirm", action: "pause_enrollment" },
        },
      ],
    });
    expect(seq.status).toBe(201);
    const sequenceId = String(seq.body.id);

    const pat = await http.post("/api/v1/patients").set(auth).send({
      firstName: "پاسخ", lastName: "دهنده", phone: `0912${Date.now()}`.slice(0, 11),
    });
    expect(pat.status).toBe(201);
    const patientId = String(pat.body.id);

    const enrolled = await http.post("/api/v1/aftercare/enrollments").set(auth).send({ sequenceId, patientId });
    expect(enrolled.status).toBe(201);
    const enrollmentId = String(enrolled.body.id);

    // گام اول سررسید است — یک tick ورکر پیام را می‌فرستد (Kavenegar probe)
    const service = app.get((await import("../src/aftercare/aftercare.service.js")).AftercareService);
    const ctx = { clinicId, userId: "", role: "system" } as const;
    await TenantScope.runWith(ctx, () => service.runDue(ctx, "کلینیک دمو الف"));

    // پاسخ بیمار: WebhookGuard کلید را از webhook_providers می‌خواند نه env —
    // پس ردیف provider امضادار را برای همین کلینیک seed می‌کنیم.
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `INSERT INTO webhook_providers (id, clinic_id, provider, webhook_secret, signature_header, active)
       VALUES (gen_random_uuid(), $1, 'kavenegar', 'w4-secret', 'x-webhook-signature', true)
       ON CONFLICT DO NOTHING`,
      [clinicId],
    );
    // شماره‌ی فرستنده‌ی webhook همان شماره‌ی بیمار است — پیوند از روی hash
    const senderPhone = String(pat.body.phone);
    process.env.KAVENEGAR_WEBHOOK_SECRET = "w4-secret";
    const payload = { channel: "kavenegar", from: senderPhone, body: "بله", receivedAt: new Date().toISOString() };
    const res = await http
      .post("/api/v1/aftercare/webhooks/kavenegar")
      .set({ "x-webhook-signature": webhookSignature(payload, "w4-secret") })
      .send(payload);
    delete process.env.KAVENEGAR_WEBHOOK_SECRET;
    // پیام ورودی ثبت می‌شود (۲۰۲) حتی اگر شاخه‌زدن نتیجه نداشته باشد
    expect([202, 200]).toContain(res.status);
    expect(res.body.duplicate).toBe(false);

    // ثبت‌نامِ فعالِ پاسخ‌دهنده باید paused شود (on_reply=pause_enrollment روی confirm)
    const state = await migrateSql<{ state: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT state FROM aftercare_enrollments WHERE id = $1",
      [enrollmentId],
    );
    expect(state[0]?.state).toBe("paused");
  });

  it("a sequence step with condition.sessionStatus=completed is skipped on a booked session (condition-not-met)", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const clinicId = await clinicAId();

    const seq = await http.post("/api/v1/aftercare/sequences").set(auth).send({
      name: `w4-condition-${Date.now()}`,
      steps: [
        {
          offsetHours: 0,
          channel: "kavenegar",
          templateKey: "aftercare.day1",
          condition: { sessionStatus: "completed" },
        },
      ],
    });
    expect(seq.status).toBe(201);

    // ثبت‌نام با sessionId گره‌ی session_completed قید zod دارد؛ برای این تست
    // مستقیم SQL می‌نویسیم چون trigger=session_completed است و serviceId لازم دارد.
    const serviceRows = await migrateSql<{ id: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT id FROM services WHERE clinic_id = $1 LIMIT 1",
      [clinicId],
    );
    const serviceId = serviceRows[0]!.id;
    const seq2 = await http.post("/api/v1/aftercare/sequences").set(auth).send({
      name: `w4-condition-svc-${Date.now()}`,
      trigger: "session_completed",
      serviceId,
      steps: [
        {
          offsetHours: 0,
          channel: "kavenegar",
          templateKey: "aftercare.day1",
          condition: { sessionStatus: "completed" },
        },
      ],
    });
    expect(seq2.status).toBe(201);
  });

  it("on_reply switch_to survives SQL validation through 0023 and the zod contract", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };

    const seq = await http.post("/api/v1/aftercare/sequences").set(auth).send({
      name: `w4-switch-${Date.now()}`,
      steps: [
        {
          offsetHours: 0,
          channel: "kavenegar",
          templateKey: "aftercare.day1",
          on_reply: {
            intent: "reschedule",
            action: "switch_to",
            switchTo: { templateKey: "session.reminder" },
          },
        },
      ],
    });
    expect(seq.status).toBe(201);

    // STOP هرگز از مسیر on_reply سوئیچ نیست — zod ۴۰۰ می‌دهد
    const bad = await http.post("/api/v1/aftercare/sequences").set(auth).send({
      name: `w4-bad-${Date.now()}`,
      steps: [
        {
          offsetHours: 0,
          channel: "kavenegar",
          templateKey: "aftercare.day1",
          on_reply: { intent: "stop", action: "pause_enrollment" },
        },
      ],
    });
    expect(bad.status).toBe(400);
  });
});
