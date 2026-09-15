import { loadEnv } from "./load-env.js";
loadEnv();
import { randomUUID, createHash } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Pool, type PoolClient } from "pg";

/**
 * Dev/demo seed (phase 1): two clinics for cross-tenant negative tests,
 * one user per role for clinic A, starter+growth plans, entitlements.
 * Idempotent: skips when the marker clinic already exists.
 *
 * Clinic IDs are DETERMINISTIC (derived from the clinic name) so that tests
 * and documentation can reference them reliably. This is safe for non-production
 * only: production must never hash identifiers.
 *
 * Phase 5a (ADR-0046) adds `seedPhase5a`, which has its OWN marker
 * (`settings->>'seed5a'`) rather than bumping the v1 one. Two reasons, both
 * practical:
 *
 *   1. Bumping v1 would re-run the block above on an existing database and die
 *      on the clinics primary key — the ids are deterministic.
 *   2. A dev database seeded before this phase would otherwise never get the new
 *      fixtures, which is exactly the situation where somebody concludes the
 *      feature is broken.
 */
function deterministicUUID(input: string): string {
  const h = createHash("md5").update(input).digest();
  // noUncheckedIndexedAccess: indexing a Buffer yields `number | undefined`, so
  // the version/variant bytes are read into locals before they are masked. An
  // md5 digest is always 16 bytes, which makes the fallbacks unreachable — the
  // produced UUIDs are byte-identical either way.
  const versionByte = h[6] ?? 0;
  const variantByte = h[8] ?? 0;
  h[6] = (versionByte & 0x0f) | 0x50;
  h[8] = (variantByte & 0x3f) | 0x80;
  return [
    h.toString("hex", 0, 4),
    h.toString("hex", 4, 6),
    h.toString("hex", 6, 8),
    h.toString("hex", 8, 10),
    h.toString("hex", 10, 16),
  ].join("-");
}

interface SeedResult {
  skipped?: boolean;
  clinicA?: string;
  clinicB?: string;
  phase5a?: "created" | "present";
}

/**
 * فاز ۵a — داده نمونه: یک دنباله پیگیری، دو محصول، یک ثبت‌نام سررسیده و یک
 * پیش‌فاکتور.
 *
 * گام اول ثبت‌نام عمداً الان سررسید است (مبدأ ۲۵ ساعت قبل و گام روز ۱):
 * یک tick ورکر باید واقعاً کاری انجام دهد، وگرنه توسعه‌دهنده باید ردیف را
 * دستی دستکاری کند تا مسیر را ببیند.
 *
 * مبلغ فاکتور از `fn_invoice_recalc` می‌آید نه از یک عدد دستی: یک seed با مبلغِ
 * دستی، seed ای است که می‌تواند با کدی که قرار بود نشان دهد اختلاف داشته باشد.
 */
async function seedPhase5a(client: PoolClient, clinicA: string): Promise<boolean> {
  const done = await client.query(
    "SELECT 1 FROM clinics WHERE id = $1 AND settings->>'seed5a' = 'v1' LIMIT 1",
    [clinicA],
  );
  if ((done.rowCount ?? 0) > 0) return false;

  const patient = await client.query<{ id: string }>(
    "SELECT id FROM patients WHERE clinic_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
    [clinicA],
  );
  const patientId = patient.rows[0]?.id;

  try {
    await client.query("BEGIN");

    // ۱) کاتالوگ — یک کالا و یک بسته خدمتی
    const shampooId = randomUUID();
    const packageId = randomUUID();
    await client.query(
      `INSERT INTO products (id, clinic_id, sku, name, kind, unit, price, tax_rate) VALUES
       ($1, $3, 'SHMP-500', 'شامپوی تخصصی ۵۰۰ میلی',   'goods',   'bottle', '1850000', 9),
       ($2, $3, 'PRP-PKG-4', 'بسته ۴ جلسه‌ای PRP',      'package', 'package','16000000', 0)`,
      [shampooId, packageId, clinicA],
    );

    // ۲) یک دنباله پیگیری واقعی — روز ۱، روز ۳، هفته ۲، ماه ۱
    const steps = [
      { offsetHours: 24, channel: "kavenegar", templateKey: "aftercare.day1" },
      { offsetHours: 72, channel: "kavenegar", templateKey: "aftercare.day3" },
      { offsetHours: 336, channel: "kavenegar", templateKey: "aftercare.week2" },
      { offsetHours: 720, channel: "kavenegar", templateKey: "aftercare.month1" },
    ];
    const sequenceId = randomUUID();
    await client.query(
      `INSERT INTO aftercare_sequences (id, clinic_id, name, description, trigger, locale, steps, active)
       VALUES ($1, $2, 'پیگیری پس از PRP', 'چهار پیام در یک ماه پس از جلسه', 'manual', 'fa', $3::jsonb, true)`,
      [sequenceId, clinicA, JSON.stringify(steps)],
    );

    // ۳) یک ثبت‌نام که گام اولش همین الان سررسید است
    if (patientId) {
      await client.query(
        `INSERT INTO aftercare_enrollments
           (clinic_id, sequence_id, patient_id, state, current_step, steps_snapshot, locale,
            started_at, next_run_at)
         VALUES ($1, $2, $3, 'active', 0, $4::jsonb, 'fa',
                 now() - interval '25 hours', now() - interval '1 hour')`,
        [clinicA, sequenceId, patientId, JSON.stringify(steps)],
      );

      // ۴) یک پیش‌فاکتور با دو سطر. شماره و مبالغ از خودِ توابع می‌آیند.
      const numberRes = await client.query<{ number: string }>(
        "SELECT fn_invoice_next_number($1::uuid) AS number",
        [clinicA],
      );
      const invoiceNumber = numberRes.rows[0]?.number;
      if (invoiceNumber) {
        const invoiceId = randomUUID();
        await client.query(
          `INSERT INTO invoices (id, clinic_id, patient_id, number, state, currency, due_at)
           VALUES ($1, $2, $3, $4, 'draft', 'IRR', now() + interval '14 days')`,
          [invoiceId, clinicA, patientId, invoiceNumber],
        );
        await client.query(
          `INSERT INTO invoice_items
             (clinic_id, invoice_id, product_id, description, quantity, unit_price, tax_rate, position)
           VALUES
             ($1, $2, $3, 'بسته ۴ جلسه‌ای PRP',        1,  '16000000', 0, 0),
             ($1, $2, $4, 'شامپوی تخصصی ۵۰۰ میلی', 2,  '1850000',  9, 1)`,
          [clinicA, invoiceId, packageId, shampooId],
        );
        await client.query("SELECT fn_invoice_recalc($1::uuid, $2::uuid)", [clinicA, invoiceId]);
      }
    }

    await client.query(
      `UPDATE clinics SET settings = settings || '{"seed5a":"v1"}'::jsonb WHERE id = $1`,
      [clinicA],
    );

    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function seed(config: string | import("pg").PoolConfig): Promise<SeedResult> {
  const poolConfig = typeof config === "string" ? { connectionString: config, max: 1 } : { ...config, max: 1 };
  const pool = new Pool(poolConfig);
  const client = await pool.connect();
  try {
    const marker = await client.query<{ id: string }>(
      "SELECT id FROM clinics WHERE settings->>'seed' = 'v1' LIMIT 1",
    );
    if ((marker.rowCount ?? 0) > 0) {
      // دیتابیس از قبل seed شده — فقط داده‌ی فاز ۵a را تکمیل می‌کنیم
      const clinicA = marker.rows[0]?.id;
      if (!clinicA) return { skipped: true };
      const created = await seedPhase5a(client, clinicA);
      return { skipped: !created, clinicA, phase5a: created ? "created" : "present" };
    }

    const password = process.env.SEED_PASSWORD ?? "Dev12345!";
    const argon = await hash(password);
    const clinicA = deterministicUUID("clinic-a.dev");
    const clinicB = deterministicUUID("clinic-b.dev");

    try {
      await client.query("BEGIN");

      await client.query(
        `INSERT INTO plans (code, name, price, interval, limits) VALUES
         ('starter', '{"fa":"پایه","en":"Starter"}', '4900000', 'month', '{"max_users":3,"storage_mb":5120,"analyses_per_month":200,"branches":1,"monthly_sessions":5,"messages_per_month":500,"upload_mb_per_month":5120}'),
         ('growth',  '{"fa":"رشد","en":"Growth"}',   '12900000','month', '{"max_users":10,"storage_mb":51200,"analyses_per_month":1500,"branches":3,"monthly_sessions":3,"messages_per_month":5000,"upload_mb_per_month":51200}')
         ON CONFLICT (code) DO NOTHING`,
      );
      await client.query(
        `INSERT INTO plan_features (plan_code, feature) VALUES
         ('starter','portal'),('starter','aftercare'),
         ('growth','portal'),('growth','aftercare'),('growth','scribe'),('growth','api'),('growth','ml_updates'),('growth','admin')
         ON CONFLICT DO NOTHING`,
      );

      await client.query(
        `INSERT INTO clinics (id, name, settings) VALUES
         ($1, 'کلینیک دمو الف', '{"seed":"v1"}'),
         ($2, 'کلینیک دمو ب",   '{"seed":"other"}')`.replace('ب"', 'ب\''),
        [clinicA, clinicB],
      );
      await client.query(
        `INSERT INTO entitlements (clinic_id, plan_code, current_period_end)
         VALUES ($1, 'growth',  now() + interval '30 days'),
                ($2, 'starter', now() + interval '30 days')`,
        [clinicA, clinicB],
      );

      const ownerA = randomUUID();
      const trichologistA = randomUUID();
      const receptionistA = randomUUID();
      const ownerB = randomUUID();
      await client.query(
        `INSERT INTO users (id, clinic_id, role, email, password_hash) VALUES
         ($1, $5, 'owner',        'owner@clinic-a.test',     $7),
         ($2, $5, 'trichologist', 'tricho@clinic-a.test',    $7),
         ($3, $5, 'receptionist', 'reception@clinic-a.test', $7),
         ($4, $6, 'owner',        'owner@clinic-b.test',     $7)`,
        [ownerA, trichologistA, receptionistA, ownerB, clinicA, clinicB, argon],
      );

      const serviceA = randomUUID();
      const serviceB = randomUUID();
      await client.query(
        `INSERT INTO services (id, clinic_id, name, duration_min, price) VALUES
         ($1, $3, 'مشاوره تریکولوژی', 30, '800000'),
         ($2, $3, 'جلسه PRP',         60, '4500000')`,
        [serviceA, serviceB, clinicA],
      );
      await client.query(`INSERT INTO services (id, clinic_id, name, duration_min, price) VALUES ($1, $2, 'مشاوره', 30, '500000')`, [
        randomUUID(),
        clinicB,
      ]);

      await client.query(
        `INSERT INTO patients (id, clinic_id, first_name, last_name, phone) VALUES
         ($1, $3, 'زهرا', 'محمدی',  '09121234567'),
         ($2, $3, 'علی',  'رضایی',  '09359876543')`,
        [randomUUID(), randomUUID(), clinicA],
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    // داده‌ی فاز ۵a در تراکنش خودش — تا یک خطای اینجا، seed پایه را عقب نزند
    const created = await seedPhase5a(client, clinicA);
    return { clinicA, clinicB, phase5a: created ? "created" : "present" };
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = process.argv[1]?.replace(/\\/g, "/").endsWith("seed.ts");
if (isCli) {
  let config: string | import("pg").PoolConfig;

  if (process.env.SQL_HOST) {
    config = {
      host: process.env.SQL_HOST,
      user: process.env.SQL_ADMIN_USER,
      password: process.env.SQL_ADMIN_PASSWORD,
      database: process.env.SQL_DB_NAME,
      port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : undefined,
    };
  } else {
    const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
      console.error("MIGRATE_DATABASE_URL or DATABASE_URL is required");
      process.exit(1);
    }
    config = url;
  }

  seed(config)
    .then((r) => {
      const base = r.skipped ? "seed: already seeded" : `seed: done (2 clinics: A=${r.clinicA}, B=${r.clinicB})`;
      console.log(r.phase5a ? `${base} — phase 5a: ${r.phase5a}` : base);
      process.exit(0);
    })
    .catch((e: Error) => {
      console.error("seed failed:", e.message);
      process.exit(1);
    });
}
