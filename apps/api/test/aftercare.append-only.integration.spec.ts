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

/**
 * موج ۵ (D22) — append-only بودن `message_log` / `inbound_messages` روی
 * Postgres واقعی (ADR-0057 + migration 0025).
 *
 * اثبات‌ها:
 *  ۱) DELETE روی هر دو جدول در سطح دیتابیس خطا می‌دهد (`msg_no_mutate`).
 *  ۲) گذر وضعیت رو به عقب خطاست؛ زنجیره‌ی مجاز رو به جلو عبور می‌کند.
 *  ۳) محتوای پیام پس از فاز placeholder ثابت است (fill فقط در queued).
 *  ۴) متادیتای رسیدگی inbox (handled/intent) آزاد می‌ماند — گارد مسیر محصول
 *     را نمی‌بندد.
 *  ۵) D23: قرارداد webhook پیام فقط kavenegar است — zarinpal دیگر route
 *     ندارد (404) درحالی‌که kavenegar سر جایش است (بدون امضا 401).
 *
 * نکته‌ی عمدی: TRUNCATE (resetAll) از triggerهای row-level عبور می‌کند —
 * تنها مسیر پاک‌سازی تست/بازیابی؛ نقش‌های اپ به آن دسترسی ندارند.
 */

let app: NestFastifyApplication;
let http: ReturnType<typeof request>;
let db: DbService;

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

/** یک ردیف queued در message_log (placeholder مثل خروجی fn_aftercare_claim_session_reminders). */
async function insertQueuedMessage(clinicId: string): Promise<string> {
  const rows = await migrateSql<{ id: string }>(
    process.env.MIGRATE_DATABASE_URL!,
    `INSERT INTO message_log (clinic_id, channel, template_key, recipient_hash, body_sha256, body_chars, idempotency_key, state)
     VALUES ($1, 'kavenegar', 'aftercare.day1', repeat('a', 64), repeat('b', 64), 0, 'd22:' || gen_random_uuid()::text, 'queued')
     RETURNING id`,
    [clinicId],
  );
  return rows[0]!.id;
}

/** یک ردیف new در inbound_messages (بدنه اینجا null — ستون nullable است؛ گارد به آن کاری ندارد). */
async function insertInbound(clinicId: string): Promise<string> {
  const rows = await migrateSql<{ id: string }>(
    process.env.MIGRATE_DATABASE_URL!,
    `INSERT INTO inbound_messages (clinic_id, channel, sender_hash, state, received_at)
     VALUES ($1, 'kavenegar', repeat('c', 64), 'new', now())
     RETURNING id`,
    [clinicId],
  );
  return rows[0]!.id;
}

/** اجرای SQL خام با انتظار خطای گارد — پیام باید msg_no_mutate داشته باشد. */
async function expectGuardReject(statement: string, params: unknown[] = []): Promise<void> {
  await expect(migrateSql(process.env.MIGRATE_DATABASE_URL!, statement, params)).rejects.toThrow(/msg_no_mutate/);
}

describe("wave 5 — D22 append-only guards (0025)", () => {
  it("refuses DELETE on message_log and inbound_messages at the database level", async () => {
    const clinicId = await clinicAId();
    const mid = await insertQueuedMessage(clinicId);
    const iid = await insertInbound(clinicId);

    await expectGuardReject(`DELETE FROM message_log WHERE clinic_id = $1 AND id = $2`, [clinicId, mid]);
    await expectGuardReject(`DELETE FROM inbound_messages WHERE clinic_id = $1 AND id = $2`, [clinicId, iid]);
  });

  it("refuses backward state transitions on both tables", async () => {
    const clinicId = await clinicAId();
    const mid = await insertQueuedMessage(clinicId);
    const iid = await insertInbound(clinicId);

    // message_log: queued -> sent (مجاز) سپس sent -> queued (ممنوع)
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE message_log SET state = 'sent', sent_at = now() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, mid],
    );
    await expectGuardReject(`UPDATE message_log SET state = 'queued' WHERE clinic_id = $1 AND id = $2`, [clinicId, mid]);
    // پرش نامجاز: sent -> suppressed
    await expectGuardReject(`UPDATE message_log SET state = 'suppressed' WHERE clinic_id = $1 AND id = $2`, [clinicId, mid]);

    // inbound: new -> read (مجاز) سپس read -> new (ممنوع)
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE inbound_messages SET state = 'read', handled_at = now() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, iid],
    );
    await expectGuardReject(`UPDATE inbound_messages SET state = 'new' WHERE clinic_id = $1 AND id = $2`, [clinicId, iid]);
  });

  it("keeps message content immutable after the queued phase but lets the placeholder fill", async () => {
    const clinicId = await clinicAId();
    const mid = await insertQueuedMessage(clinicId);

    // فاز placeholder: پر کردن در queued مجاز است (مسیر fillSessionReminder)
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE message_log
         SET recipient_hash = repeat('d', 64), body_sha256 = repeat('e', 64), body_chars = 12, channel = 'bale'
       WHERE clinic_id = $1 AND id = $2`,
      [clinicId, mid],
    );

    const sentRows = await migrateSql<{ id: string }>(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE message_log SET state = 'sent', sent_at = now() WHERE clinic_id = $1 AND id = $2 RETURNING id`,
      [clinicId, mid],
    );
    expect(sentRows[0]?.id).toBe(mid);

    // پس از خروج از queued: تغییر محتوا خطاست، گذر وضعیت رو به جلو آزاد
    await expectGuardReject(
      `UPDATE message_log SET recipient_hash = repeat('f', 64), body_chars = 99 WHERE clinic_id = $1 AND id = $2`,
      [clinicId, mid],
    );
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE message_log SET state = 'delivered', delivered_at = now() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, mid],
    );
  });

  it("allows the inbox handling path: forward transitions and handled metadata", async () => {
    const clinicId = await clinicAId();
    const iid = await insertInbound(clinicId);

    // مسیر محصول: recordInbound → setInboundState (new → replied با intent)
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE inbound_messages SET state = 'replied', handled_at = now(), intent = 'confirm'
       WHERE clinic_id = $1 AND id = $2`,
      [clinicId, iid],
    );
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE inbound_messages SET state = 'archived' WHERE clinic_id = $1 AND id = $2`,
      [clinicId, iid],
    );

    // متادیتای رسیدگی آزاد است — حتی بی‌تغییرِ state
    await migrateSql(
      process.env.MIGRATE_DATABASE_URL!,
      `UPDATE inbound_messages SET handled_at = now() WHERE clinic_id = $1 AND id = $2`,
      [clinicId, iid],
    );
  });

  it("keeps the messaging webhook contract kavenegar-only (D23)", async () => {
    // مسیر zarinpal حذف شده: 404 از fastify (route not found) — نه 401 گارد.
    const z = await http.post("/api/v1/aftercare/webhooks/zarinpal").send({});
    expect(z.status).toBe(404);

    // مسیر پیام‌رسانی سر جایش است: بدون امضا گارد 401 می‌دهد.
    const k = await http.post("/api/v1/aftercare/webhooks/kavenegar").send({ channel: "kavenegar", from: "09120000000", body: "سلام" });
    expect(k.status).toBe(401);
  });
});
