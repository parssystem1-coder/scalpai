import { loadEnv } from "../src/index.js";

loadEnv();

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Pool } from "pg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Seed N synthetic `done` gallery items for the marker clinic's first patient
 * so the web gallery can be perf-tested (Lighthouse / virtualization).
 * Idempotent: skips when the patient already has >= N done items.
 *
 *   pnpm --filter @scalpai/app-api seed:gallery [--force] [count]
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const count = Number(args.find((a) => /^\d+$/.test(a)) ?? 500);

  const pool = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL!, max: 4 });
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT!,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin-dev-only",
    },
  });
  const bucket = process.env.S3_BUCKET ?? "scalpai-dev";

  const clinic = await pool.query("SELECT id FROM clinics WHERE settings->>'seed' = 'v1' LIMIT 1");
  const clinicId = String(clinic.rows[0].id);
  const patient = await pool.query(
    "SELECT id FROM patients WHERE clinic_id=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
    [clinicId],
  );
  let pid = patient.rows[0]?.id as string | undefined;
  if (!pid) {
    pid = randomUUID();
    await pool.query(
      "INSERT INTO patients (id, clinic_id, first_name, last_name, phone) VALUES ($1,$2,'گالری','پرفورمنس',$3)",
      [pid, clinicId, `09120000000${Math.floor(Math.random() * 9)}`],
    );
  }

  const existing = await pool.query(
    "SELECT count(*)::int AS n FROM gallery_items WHERE patient_id=$1 AND upload_state='done'",
    [pid],
  );
  const have = existing.rows[0].n as number;
  if (have >= count && !force) {
    console.log(`seed-gallery: already ${have} items — skipping`);
    await pool.end();
    return;
  }
  const target = force ? count : Math.max(0, count - have); // top-up to exact count
  console.log(`seed-gallery: have=${have} target=${target}`);

  // one deterministic synthetic image, reused across objects
  const w = 480;
  const h = 360;
  const raw = Buffer.alloc(w * h * 3);
  let seedv = 99;
  const rand = () => ((seedv = (seedv * 1103515245 + 12345) >>> 0) / 0xffffffff);
  for (let i = 0; i < w * h; i++) {
    const v = Math.floor(rand() * 255);
    raw[i * 3] = v;
    raw[i * 3 + 1] = v;
    raw[i * 3 + 2] = v;
  }
  const original = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
  const thumb = await sharp(original).resize(512, 512, { fit: "inside" }).jpeg({ quality: 75 }).toBuffer();
  const sha256 = (await import("node:crypto")).createHash("sha256").update(original).digest("hex");

  for (let i = 0; i < target; i++) {
    const id = randomUUID();
    const rest = `gallery/${randomUUID()}/original.jpg`;
    const thumbRest = rest.replace("original.jpg", "thumb.jpg");
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `clinic-${clinicId}/${rest}`, Body: original, ContentType: "image/jpeg" }));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: `clinic-${clinicId}/${thumbRest}`, Body: thumb, ContentType: "image/jpeg" }));
    await pool.query(
      `INSERT INTO gallery_items (id, clinic_id, patient_id, storage_key, thumb_key, mime, exif_stripped, upload_state, quality, sha256)
       VALUES ($1,$2,$3,$4,$5,'image/jpeg',true,'done',$6,$7)`,
      [
        id,
        clinicId,
        pid,
        rest,
        thumbRest,
        JSON.stringify({ status: "pass", metrics: { blurVariance: 999, brightnessMean: 128, edgePixelRatio: 0.4 } }),
        sha256,
      ],
    );
    if ((i + 1) % 50 === 0) console.log(`seed-gallery: ${i + 1}/${count}`);
  }
  console.log(`seed-gallery: done (+${target} -> total ${have + target} for patient ${pid})`);
  await pool.end();
}

void main();
