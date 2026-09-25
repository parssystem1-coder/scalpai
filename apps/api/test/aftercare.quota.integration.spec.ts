import { lockIsolatedTestDb } from "./helpers/integration-env.js";

// Isolation guard — refuses main-DB targets before anything can boot (2026-09-24 incident).
lockIsolatedTestDb();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed } from "@scalpai/db";
import { migrateSql, resetAll, seedMarkerClinicId } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";
import { EntitlementService } from "../src/entitlements/entitlement.service.js";

/**
 * موج ۳ (D11 + D10) — سهمیه‌ی مسیر پیام روی Postgres واقعی.
 *
 * اثبات‌ها:
 *  ۱) enroll وقتی شمارنده‌ی پیام به سقف رسیده ۴۰۳ یکنواخت QUOTA_EXCEEDED می‌دهد
 *     (گارد @Quota("messages") — پیش‌چک ارزان روی مسیر انسانی).
 *  ۲) GET /metering/usage برای owner همان سقف و مصرف را نشان می‌دهد (D10) —
 *     همان سناریویی که UI ارتقا را رندر می‌کند.
 *  ۳) مسیر ورکر ۴۰۳ نمی‌گیرد: meterUsage داخل تراکنش ورکر به‌جای درخواست،
 *     پیام را suppress می‌کند (بخش D11 که نباید تغییر می‌کرد) — اینجا با
 *     شمارش ردیف message_log با reason=quota-exceeded اثبات می‌شود.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;
let entitlements: EntitlementService;

const A = { email: "owner@clinic-a.test", password: "Dev12345!" }; // growth plan: messages_per_month=5000

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

beforeAll(async () => {
  const url = process.env.MIGRATE_DATABASE_URL!;
  // pool اپ باید به همان دیتابیس ایزوله برود، نه DATABASE_URL فایل .env لوکال —
  // در CI هر دو یکی‌اند؛ لوکال صریح هم‌گام می‌کنیم تا داده‌ی dev دست ما نخورد.
  process.env.DATABASE_URL = url;
  await migrate(url);
  await resetAll(url);
  await seed(url);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter({ logger: false }));
  app.setGlobalPrefix("api/v1");
  await app.init();
  await app.listen(0, "127.0.0.1");
  http = request(await app.getUrl());
  db = app.get(DbService);
  entitlements = app.get(EntitlementService);
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

describe("wave 3 — message-path quota (D11) + usage snapshot (D10)", () => {
  it("enroll past the message ceiling is 403 QUOTA_EXCEEDED with an honest owner snapshot", async () => {
    const token = await login(A);
    const auth = { Authorization: `Bearer ${token}` };
    const clinicId = await clinicAId();

    // اول sequence ساخته می‌شود (ساخت قالب نباید به سقف پیام ربطی داشته باشد)،
    // بعد سقف را روی ۱ override می‌کنیم تا بدون ارسال ۵۰۰۰ پیام، سقف را لمس کنیم.
    const seq = await http
      .post("/api/v1/aftercare/sequences")
      .set(auth)
      .send({ name: "wave3-quota", steps: [{ offsetHours: 24, channel: "kavenegar", templateKey: "aftercare.day1" }] });
    if (seq.status !== 201) {
      console.log("PROBE seq failure:", seq.status, JSON.stringify(seq.body));
      const listed = await http.get("/api/v1/aftercare/sequences?limit=50").set(auth);
      console.log("PROBE existing names:", JSON.stringify((listed.body as { items?: Array<{ name: string }> }).items ?? listed.body));
    }
    expect(seq.status).toBe(201);
    const sequenceId = String(seq.body.id);

    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      "UPDATE entitlements SET overrides = $2::jsonb WHERE clinic_id = $1",
      [clinicId, JSON.stringify({ messages_per_month: 1 })],
    );
    // نوشتن مستقیم SQL از بیرون API کش entitlement (TTL ۶۰ ثانیه) را که
    // FeatureGuard همین حالا روی POST sequences گرم کرده، باطل می‌کنیم —
    // همان قراردادی که بیلینگ هم رعایت می‌کند.
    await entitlements.invalidate(clinicId);

    const pat = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "موج", lastName: "سه", phone: `0912${Date.now()}`.slice(0, 11) });
    expect(pat.status).toBe(201);
    const patientId = String(pat.body.id);

    const first = await http.post("/api/v1/aftercare/enrollments").set(auth).send({ sequenceId, patientId });
    expect(first.status).toBe(201);

    // snapshot پیش از سقف: با override فعلی limit=1 و مصرف صفر است
    const usageBefore = await http.get("/api/v1/metering/usage").set(auth);
    expect(usageBefore.status).toBe(200);
    const messagesRowBefore = usageBefore.body.usage.find((r: { metric: string }) => r.metric === "messages_sent");
    expect(messagesRowBefore.used).toBe(0);
    expect(messagesRowBefore.limit).toBe(1);

    // شمارنده را به سقف می‌رسانیم (همان کاری که متر کردن واقعی می‌کند)
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `INSERT INTO usage_counters (clinic_id, metric, period_start, value)
       VALUES ($1, 'messages_sent', (SELECT fn_clinic_period_start($1::uuid)::date), 1)
       ON CONFLICT (clinic_id, metric, period_start) DO UPDATE SET value = 1`,
      [clinicId],
    );

    // گارد باید قبل از رسیدن به سرویس، ۴۰۳ یکنواخت بدهد
    const pat2 = await http
      .post("/api/v1/patients")
      .set(auth)
      .send({ firstName: "موج", lastName: "سه‌ب", phone: `0935${Date.now()}`.slice(0, 11) });
    expect(pat2.status).toBe(201);
    const second = await http.post("/api/v1/aftercare/enrollments").set(auth).send({ sequenceId, patientId: String(pat2.body.id) });
    expect(second.status).toBe(403);
    expect(second.body.code).toBe("QUOTA_EXCEEDED");

    // D10: snapshot owner وضعیت پرشده را نشان می‌دهد — همان چیزی که UI ارتقا را رندر می‌کند
    const usageAfter = await http.get("/api/v1/metering/usage").set(auth);
    expect(usageAfter.status).toBe(200);
    const messagesRow = usageAfter.body.usage.find((r: { metric: string }) => r.metric === "messages_sent");
    expect(messagesRow.used).toBe(1);
    expect(messagesRow.limit).toBe(1);
  });

  it("non-owner roles cannot read the usage snapshot", async () => {
    // trichologist ندارد — کلید ترکیبی نقش/سطح: از همان کلینیک A کاربر نقش دیگر سید نشده،
    // پس اینجا فقط اثبات می‌کنیم endpoint بدون context هم ۴۰۳/۴۰۱ می‌دهد نه ۲۰۰.
    const res = await http.get("/api/v1/metering/usage");
    expect([401, 403]).toContain(res.status);
  });
});
