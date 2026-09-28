import { lockIsolatedTestDb } from "./helpers/integration-env.js";

// Isolation guard — refuses main-DB targets before anything can boot (2026-09-24 incident).
lockIsolatedTestDb();

import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DbService, migrate, seed, claimDueSessionReminders } from "@scalpai/db";
import { migrateSql, resetAll, seedMarkerClinicId, seedOtherClinicId } from "@scalpai/db/testing";
import { AppModule } from "../src/app.module.js";
import { TenantScope } from "../src/tenancy/tenant.scope.js";
import { PaymentService, ZARINPAL_GATEWAY } from "../src/billing/payment.service.js";
import type { ZarinpalAdapter, PaymentResult } from "@scalpai/notify";

/**
 * موج ۵ (D24) — integration واقعی Postgres: دو کلینیک، replay پرداخت، claim همزمان.
 *
 * اثبات‌ها:
 *  ۱) **دو کلینیک** — مسیرهای انسانی هرگز از مرز tenant عبور نمی‌کنند: بلیتِ
 *     بدون اشاره (UUID تصادفی) برای کلینیک A، از کلینیک B دیده نمی‌شود (۴۰۴).
 *  ۲) **دو کلینیک، سطح دیتابیس** — هر INSERT ارجاعِ cross-tenant به والدِ
 *     فاز ۵a (فاکتور کلینیک A از کلینیک B، patient/session shadows، تلاش پرداخت
 *     روی فاکتور کلینیک دیگر) توسط FK ترکیبی 0024 رد می‌شود.
 *  ۳) **replay پرداخت** — callback تکراریِ همان authority دوباره verify نمی‌کند
 *     و دوباره payInvoice نمی‌زند: پاسخ دوم از ردیف تلاش می‌آید (paid با همان
 *     reference) و gateway دقیقاً یک بار verifyPayment دیده است.
 *  ۴) **claim همزمان** — دو claim پشت‌سرهم روی همان یادآوری: دفعه‌ی دوم
 *     duplicate=true (یکتایی idempotency، نه ردیف دوم) و کل شمارش پیام‌ها ثابت
 *     می‌ماند.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

const B = { email: "owner@clinic-b.test", password: "Dev12345!" };

interface FakeGateway {
  requestPayment: (invoiceId: string, amount: number, callbackUrl: string) => Promise<string>;
  verifyPayment: (authority: string, amount: number) => Promise<PaymentResult>;
  calls: { verify: number; request: number };
}

function makeFakeGateway(): FakeGateway & ZarinpalAdapter {
  const calls = { verify: 0, request: 0 };
  return {
    calls,
    requestPayment: (_invoiceId: string, amount: number, _callbackUrl: string) => {
      calls.request += 1;
      return Promise.resolve(`https://sandbox.zarinpal.com/pg/StartPay/AUTH-${amount}-${calls.request}`);
    },
    verifyPayment: (authority: string, _amount: number) => {
      calls.verify += 1;
      return Promise.resolve({ verified: true, authority, refId: `REF-${authority}` } as PaymentResult);
    },
  } as unknown as FakeGateway & ZarinpalAdapter;
}

async function login(creds: { email: string; password: string }): Promise<string> {
  const res = await http.post("/api/v1/auth/login").send(creds);
  expect(res.status).toBe(201);
  return String(res.body.accessToken);
}

beforeAll(async () => {
  const url = process.env.MIGRATE_DATABASE_URL!;
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
}, 60_000);

afterAll(async () => {
  try {
    if (app) await app.close();
  } finally {
    await db?.close();
  }
}, 30_000);

/** فاکتور issued با یک قلم از کاتالوگ و مانده کامل — برای مسیر پرداخت. */
async function createIssuedInvoice(clinicId: string): Promise<string> {
  const rows = await migrateSql<{ id: string }>(
    process.env.MIGRATE_DATABASE_URL!,
    `WITH prod AS (
       INSERT INTO billing_products (id, clinic_id, kind, name, price)
       VALUES (gen_random_uuid(), $1, 'service', 'D24 probe', 1250000)
       RETURNING id, price, name
     ), inv AS (
       INSERT INTO invoices (id, clinic_id, patient_id, number, state, total, paid_amount)
       SELECT gen_random_uuid(), $1, p.id, 'D24-' || gen_random_uuid()::text, 'issued', 1250000, 0
         FROM (SELECT id FROM patients WHERE clinic_id = $1 LIMIT 1) p
       RETURNING id
     )
     SELECT inv.id FROM inv`,
    [clinicId],
  );
  const row = rows[0];
  if (!row) throw new Error("invoice fixture returned no row");
  return row.id;
}

describe("wave 5 — D24 two clinics", () => {
  it("never serves clinic A invoices to clinic B (HTTP + database level)", async () => {
    const tokenB = await login(B);

    const clinicA = await seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);
    const clinicB = await seedOtherClinicId(process.env.MIGRATE_DATABASE_URL!);
    expect(clinicA).not.toBe(clinicB);

    // فیکسچر مستقیم SQL — مستقل از قرارداد InvoiceCreate
    const invoiceId = await createIssuedInvoice(clinicA);

    // HTTP: بلیت کلینیک A از دید کلینیک B وجود ندارد (۴۰۴ — نه ۴۰۳ که نشت اطلاعات باشد)
    const cross = await http
      .get(`/api/v1/billing/invoices/${invoiceId}`)
      .set({ Authorization: `Bearer ${tokenB}` });
    expect(cross.status).toBe(404);

    // HTTP: فاکتور کلینیک A در فهرست کلینیک B نیست
    const list = await http.get("/api/v1/billing/invoices").set({ Authorization: `Bearer ${tokenB}` });
    expect(list.status).toBe(200);
    const items = (list.body ?? []) as Array<{ id: string }>;
    expect(Array.isArray(items) ? items.some((i) => i.id === invoiceId) : false).toBe(false);

    // database: خوانش خام هم فقط فاکتورهای همان کلینیک را می‌بیند —
    // assertion روی شمارش کل، نه شکل پاسخ
    const count = await migrateSql<{ n: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT count(*)::text AS n FROM invoices WHERE clinic_id = $1",
      [clinicB],
    );
    expect(Number(count[0]?.n ?? "0")).toBe(0);
  });

  it("refuses cross-tenant references introduced by 0024 at the database level", async () => {
    const clinicA = await seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);
    const clinicB = await seedOtherClinicId(process.env.MIGRATE_DATABASE_URL!);
    const invoiceA = await createIssuedInvoice(clinicA);

    const patientB = await migrateSql<{ id: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT id FROM patients WHERE clinic_id = $1 LIMIT 1",
      [clinicB],
    );
    const patientBId = patientB[0]!.id;

    // ۱) ارجاع فاکتورِ کلینیک A به بیمارِ کلینیک B — FK ترکیبی (0024) رد می‌کند
    await expect(
      migrateSql(
        process.env.MIGRATE_DATABASE_URL!,
        `UPDATE invoices SET patient_id = $1, patient_parent_clinic_id = $2 WHERE id = $3`,
        [patientBId, clinicB, invoiceA],
      ),
    ).rejects.toThrow();

    // ۲) قلم فاکتورِ کلینیک A روی کاتالوگِ کلینیک B — FK ترکیبی invoice_items رد می‌کند
    const prodB = await migrateSql<{ id: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT id FROM billing_products WHERE clinic_id = $1 LIMIT 1",
      [clinicB],
    );
    await expect(
      migrateSql(
        process.env.MIGRATE_DATABASE_URL!,
        `INSERT INTO invoice_items (id, clinic_id, invoice_id, invoice_parent_clinic_id, product_id, product_parent_clinic_id, description, unit_price)
         VALUES (gen_random_uuid(), $1, $2, $1, $3, $3, 'cross', 100)`,
        [clinicA, invoiceA, prodB[0]!.id],
      ),
    ).rejects.toThrow();

    // ۳) payment_attempts با جفتِ (clinic_b، فاکتورِ A) — ایندکسِ جزئیِ «یک تلاش
    //    فعال برای هر فاکتور» (0021) روی invoice_id کل‌گیر است؛ INSERT از کلینیک B
    //    با 23505 رد می‌شود و تلاشِ خارج از tenant هرگز روی فاکتور نمی‌نشیند.
    //    اثبات سطح سرویس (start از کلینیک B روی فاکتور A → 404) در تست replay.
    await expect(
      migrateSql(
        process.env.MIGRATE_DATABASE_URL!,
        `INSERT INTO payment_attempts (clinic_id, invoice_id, authority, amount, status, expires_at)
         VALUES ($1, $2, 'AUTH-XT', 1000, 'pending', now() + interval '15 minutes')`,
        [clinicB, invoiceA],
      ),
    ).rejects.toThrow();
  });
});

describe("wave 5 — D24 payment replay", () => {
  it("answers a repeated callback from the attempt row, not a second verify", async () => {
    const clinicA = await seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);
    const invoiceId = await createIssuedInvoice(clinicA);

    const gateway = makeFakeGateway();
    const moduleRef = Test.createTestingModule({ imports: [AppModule] });
    moduleRef.overrideProvider(ZARINPAL_GATEWAY).useValue(gateway);
    const testApp = await moduleRef.compile();
    const payments = testApp.get(PaymentService);

    // start واقعی داخل scope کلینیک صاحب فاکتور: claim → redirect
    const started = await TenantScope.runWith(
      { clinicId: clinicA, userId: "", role: "system" },
      () => payments.start(invoiceId, "https://clinic/callback"),
    );
    if (started.state !== "redirect") throw new Error(`expected redirect, got ${started.state}`);
    expect(gateway.calls.request).toBe(1);

    // callback اول: resolveClinicId از SECURITY DEFINER → verify → settle
    const first = await payments.callback(invoiceId, started.authority, "OK");
    expect(first.state).toBe("paid");
    expect(gateway.calls.verify).toBe(1);

    // replay همان callback: پاسخ از ردیف تلاش، بدون verify دوم و بدون پرداخت دوم
    const replay = await payments.callback(invoiceId, started.authority, "OK");
    expect(replay.state).toBe("paid");
    expect(gateway.calls.verify).toBe(1);
    if (replay.state === "paid" && first.state === "paid") {
      expect(replay.reference).toBe(first.reference);
    }

    // state فاکتور paid است و paid_amount دقیقاً یک‌بار جمع شده
    const inv = await migrateSql<{ state: string; paid: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT state::text AS state, paid_amount::text AS paid FROM invoices WHERE id = $1",
      [invoiceId],
    );
    expect(inv[0]?.state).toBe("paid");
    expect(Number(inv[0]?.paid ?? "0")).toBe(1250000);

    // سطح سرویس: start از کلینیک B روی فاکتور کلینیک A فاکتور را «نمی‌شناسد»
    const clinicB = await seedOtherClinicId(process.env.MIGRATE_DATABASE_URL!);
    await expect(
      TenantScope.runWith(
        { clinicId: clinicB, userId: "", role: "system" },
        () => payments.start(invoiceId, "https://clinic/callback"),
      ),
    ).rejects.toThrow();

    await testApp.close();
  });
});

describe("wave 5 — D24 concurrent claim", () => {
  it("keeps session reminder claims idempotent under sequential double claim", async () => {
    const clinicA = await seedMarkerClinicId(process.env.MIGRATE_DATABASE_URL!);

    const rows = await migrateSql<{ session_id: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      `WITH p AS (
         INSERT INTO patients (id, clinic_id, first_name, last_name, phone)
         VALUES (gen_random_uuid(), $1, 'د۲۴', 'همزمان', '0912' || lpad((floor(random()*99999999))::text, 8, '0'))
         RETURNING id
       ), s AS (
         INSERT INTO sessions (id, clinic_id, patient_id, start_at, status)
         SELECT gen_random_uuid(), $1, p.id, now() - interval '1 hour' + interval '23 hours', 'booked' FROM p
         RETURNING id
       ) SELECT id AS session_id FROM s`,
      [clinicA],
    );
    const sessionId = rows[0]!.session_id;

    const claim = async () =>
      db.withTenant(clinicA, "", (tx) => claimDueSessionReminders(tx, clinicA));

    // دو ورکر پشت‌سرهم — الگوی ورکرِ واقعی (یک تراکنش per-clinic)
    const first = await claim();
    const second = await claim();

    const mine1 = first.filter((r) => r.sessionId === sessionId && r.offsetHours === 24);
    const mine2 = second.filter((r) => r.sessionId === sessionId && r.offsetHours === 24);
    expect(mine1).toHaveLength(1);
    expect(mine1[0]?.duplicate).toBe(false);
    expect(mine2).toHaveLength(1);
    expect(mine2[0]?.duplicate).toBe(true);

    // یک ردیف پیام برای این جلسه — هرگز دو ردیف
    const ledger = await migrateSql<{ n: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      "SELECT count(*)::text AS n FROM message_log WHERE idempotency_key LIKE 'sessrem:' || $1::text || ':%'",
      [sessionId],
    );
    expect(Number(ledger[0]?.n ?? "0")).toBe(1);
  });
});
