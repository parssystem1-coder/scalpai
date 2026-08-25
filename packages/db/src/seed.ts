import { loadEnv } from "./load-env.js";
loadEnv();
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Pool } from "pg";

/**
 * Dev/demo seed (phase 1): two clinics for cross-tenant negative tests,
 * one user per role for clinic A, starter+growth plans, entitlements.
 * Idempotent: skips when the marker clinic already exists.
 */
export async function seed(migrateUrl: string): Promise<{ skipped?: boolean; clinicA?: string; clinicB?: string }> {
  const pool = new Pool({ connectionString: migrateUrl, max: 1 });
  const client = await pool.connect();
  try {
    const marker = await client.query("SELECT id FROM clinics WHERE settings->>'seed' = 'v1' LIMIT 1");
    if ((marker.rowCount ?? 0) > 0) return { skipped: true };

    const password = process.env.SEED_PASSWORD ?? "Dev12345!";
    const argon = await hash(password);
    const clinicA = randomUUID();
    const clinicB = randomUUID();

    try {
      await client.query("BEGIN");

      // Plans catalog â€” new plan = INSERT only (Â§9.1)
      await client.query(
        `INSERT INTO plans (code, name, price, interval, limits) VALUES
         ('starter', '{"fa":"Ù¾Ø§ÛŒÙ‡","en":"Starter"}', '4900000', 'month', '{"max_users":3,"storage_mb":5120,"analyses_per_month":200,"branches":1}'),
         ('growth',  '{"fa":"Ø±Ø´Ø¯","en":"Growth"}',   '12900000','month', '{"max_users":10,"storage_mb":51200,"analyses_per_month":1500,"branches":3}')
         ON CONFLICT (code) DO NOTHING`,
      );
      await client.query(
        `INSERT INTO plan_features (plan_code, feature) VALUES
         ('starter','portal'),('starter','aftercare'),
         ('growth','portal'),('growth','aftercare'),('growth','scribe'),('growth','api'),('growth','ml_updates')
         ON CONFLICT DO NOTHING`,
      );

      await client.query(
        `INSERT INTO clinics (id, name, settings) VALUES
         ($1, 'Ú©Ù„ÛŒÙ†ÛŒÚ© Ø¯Ù…Ùˆ Ø§Ù„Ù', '{"seed":"v1"}'),
         ($2, 'Ú©Ù„ÛŒÙ†ÛŒÚ© Ø¯Ù…Ùˆ Ø¨',   '{"seed":"other"}')`,
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
         ($1, $3, 'Ù…Ø´Ø§ÙˆØ±Ù‡ ØªØ±ÛŒÚ©ÙˆÙ„ÙˆÚ˜ÛŒ', 30, '800000'),
         ($2, $3, 'Ø¬Ù„Ø³Ù‡ PRP',         60, '4500000')`,
        [serviceA, serviceB, clinicA],
      );

      await client.query(
        `INSERT INTO patients (id, clinic_id, first_name, last_name, phone) VALUES
         ($1, $3, 'Ø²Ù‡Ø±Ø§', 'Ù…Ø­Ù…Ø¯ÛŒ',  '09121234567'),
         ($2, $3, 'Ø¹Ù„ÛŒ',  'Ø±Ø¶Ø§ÛŒÛŒ',  '09359876543')`,
        [randomUUID(), randomUUID(), clinicA],
      );

      await client.query("COMMIT");
      return { clinicA, clinicB };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

const isCli = process.argv[1]?.replace(/\\/g, "/").endsWith("seed.ts");
if (isCli) {
  const url = process.env.MIGRATE_DATABASE_URL;
  if (!url) {
    console.error("MIGRATE_DATABASE_URL is required");
    process.exit(1);
  }
  seed(url)
    .then((r) => {
      console.log(r.skipped ? "seed: already seeded" : "seed: done (2 clinics)");
      process.exit(0);
    })
    .catch((e: Error) => {
      console.error("seed failed:", e.message);
      process.exit(1);
    });
}
