#!/usr/bin/env node
/**
 * test-backup-stream.cjs — تست استریم و پروفایل حافظهٔ بکاپ فایل‌محور (موج ۳ / O2)
 * -----------------------------------------------------------------------
 * اجرا: node --expose-gc scripts/test-backup-stream.cjs
 * (اسکریپت pnpm مربوطه، «test:backup-stream»، --expose-gc را می‌دهد.)
 *
 * چرا این تست؟ مسیر قدیمی exportData کل ZIP را یک‌بار در حافظه می‌ساخت، به
 * base64 می‌برد و دوباره decode می‌کرد — با چند هزار تصویر یعنی ۳+ نسخهٔ
 * هم‌زمان از کل آرشیو در حافظه و یک payload سنگین روی IPC. مسیر جدید
 * (exportDataToFile → writeBackupZip) تصاویر را با stream می‌خواند/می‌نویسد.
 *
 * سناریو: ۵۰۰۰ تصویر مصنوعی روی دیسک (بایت‌های تصادفی → ZIP نزدیک به اندازهٔ
 * ورودی باقی می‌ماند، پس حجم آرشیو واقعی براس بزرگ است) و سپس:
 *  ۱) دلتا heap بعد از GC باید از سقف (۴۰MB) کوچک‌تر باشد در حالی که آرشیو > ۱۵MB است
 *  ۲) ساختار ZIP معتبر است: data.json + دقیقاً ۵۰۰۰ entry تصویر + محتوای یک نمونه
 *  ۳) خروجی قراردادی exportDataToFile (filePath/bytes/passwordProtected) درست است
 *  ۴) فایل موقت .part-* باقی نمی‌ماند
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

if (typeof global.gc !== 'function') {
  console.error('این تست باید با --expose-gc اجرا شود: node --expose-gc scripts/test-backup-stream.cjs');
  process.exit(1);
}

// mock ماژول electron (nativeImage) مثل test-db-contract.cjs
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      nativeImage: {
        createFromPath: () => ({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }), resize: () => ({ toJPEG: () => Buffer.alloc(0) }) }),
        createFromBuffer: () => ({ isEmpty: () => true, getSize: () => ({ width: 0, height: 0 }), resize: () => ({ toJPEG: () => Buffer.alloc(0) }) }),
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const Database = require('better-sqlite3');
const AdmZip = require('adm-zip');
const { createDbHandlers } = require('../electron/db-handlers.cjs');
const { createBaseTables, runMigrations } = require('../electron/schema-migrations.cjs');

const IMAGE_COUNT = 5000;
const IMAGE_BYTES = 4096; // 5000 × 4KiB ≈ 20MB ورودی (تصادفی → فشرده نمی‌شود)
const HEAP_DELTA_LIMIT_MB = 40; // از «۳+ نسخهٔ آرشیو» فاصلهٔ معنادار: آرشیو ~۲۰MB است
const MIN_ARCHIVE_BYTES = 15 * 1024 * 1024;

const safeStorageMock = { isEncryptionAvailable: () => false };

let failed = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1; };
const pass = (msg) => console.log(`✓ ${msg}`);

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-stream-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-stream-out-'));
  let db;
  try {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    createBaseTables(db);
    runMigrations(db);
    const handlers = createDbHandlers(db, userDataDir, safeStorageMock);

    // مشتری + ۵۰۰۰ ردیف گالری با فایل واقعی روی دیسک
    const clientId = 'stream-test-client';
    db.prepare("INSERT INTO clients (id, firstName, lastName, phone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(clientId, 'استریم', 'تست', '09000000000', new Date().toISOString(), new Date().toISOString());

    const imagesDir = path.join(userDataDir, 'images', clientId);
    fs.mkdirSync(imagesDir, { recursive: true });
    let sentinelBytes = null;
    const insertGallery = db.prepare(
      "INSERT INTO gallery (id, clientId, type, url, thumbnail, filename, metadata, filePath, createdAt) VALUES (?, ?, 'photo', ?, NULL, ?, '{}', ?, ?)",
    );
    const seed = db.transaction(() => {
      for (let i = 0; i < IMAGE_COUNT; i++) {
        const filename = `stream-${i}.jpg`;
        const filePath = path.join(imagesDir, filename);
        if (i === IMAGE_COUNT - 1) {
          sentinelBytes = crypto.randomBytes(IMAGE_BYTES);
          fs.writeFileSync(filePath, sentinelBytes);
        } else {
          fs.writeFileSync(filePath, crypto.randomBytes(IMAGE_BYTES));
        }
        insertGallery.run(`stream-img-${i}`, clientId, `file://${filePath}`, filename, filePath, new Date().toISOString());
      }
    });
    seed();
    pass(`${IMAGE_COUNT} تصویر ~${(IMAGE_COUNT * IMAGE_BYTES / 1048576).toFixed(0)}MB روی دیسک آماده شد`);

    // پروفایل حافظه: GC → baseline → export → GC → delta
    global.gc();
    const heapBefore = process.memoryUsage().heapUsed;

    const targetPath = path.join(outDir, 'stream-backup.zip');
    const result = await handlers.handleDbQuery('exportDataToFile', { targetPath });

    global.gc();
    const heapAfter = process.memoryUsage().heapUsed;
    const deltaMb = (heapAfter - heapBefore) / 1048576;

    assert.strictEqual(result.success, true, 'exportDataToFile باید success برگرداند');
    assert.strictEqual(result.filePath, targetPath, 'filePath برگشتی باید همان مقصد باشد');
    assert.strictEqual(result.passwordProtected, false, 'بدون پسورد');
    assert.strictEqual(fs.existsSync(targetPath), true, 'فایل ZIP روی دیسک هست');

    const stat = fs.statSync(targetPath);
    assert.strictEqual(result.bytes, stat.size, 'bytes برگشتی = اندازهٔ واقعی فایل');
    assert.strictEqual(
      stat.size > MIN_ARCHIVE_BYTES,
      true,
      `آرشیو باید > ۱۵MB باشد تا تست معنادار بماند (واقعی: ${(stat.size / 1048576).toFixed(1)}MB)`,
    );
    pass(`آرشیو ${(stat.size / 1048576).toFixed(1)}MB ساخته شد؛ قرارداد خروجی درست است`);

    if (deltaMb < HEAP_DELTA_LIMIT_MB) {
      pass(`دلتا heap = ${deltaMb.toFixed(1)}MB < ${HEAP_DELTA_LIMIT_MB}MB (آرشیو ${(stat.size / 1048576).toFixed(1)}MB — یعنی کپی کامل در حافظه نیست)`);
    } else {
      fail(`دلتا heap = ${deltaMb.toFixed(1)}MB از سقف ${HEAP_DELTA_LIMIT_MB}MB بیشتر است — استریم نشت حافظه دارد`);
    }

    // اعتبار ZIP
    const zip = new AdmZip(targetPath);
    const entries = zip.getEntries();
    const imageEntries = entries.filter(e => e.entryName.startsWith('images/'));
    assert.strictEqual(imageEntries.length, IMAGE_COUNT, `باید ${IMAGE_COUNT} تصویر در ZIP باشد`);
    const dataEntry = zip.getEntry('data.json');
    assert.ok(dataEntry, 'data.json موجود است');
    const envelope = JSON.parse(dataEntry.getData().toString('utf8'));
    assert.strictEqual(envelope.format, 'scalpai-backup');
    assert.strictEqual(envelope.version, 3, 'نسخهٔ envelope مسیر فایل = ۳');
    assert.strictEqual(envelope.data.gallery.length, IMAGE_COUNT, 'همهٔ ردیف‌های گالری در data.json هستند');

    // یک entry انتهایی بایت‌به‌بایت با فایل دیسک یکی است (یکپارچگی استریم)
    // نام entry: images/<clientId>/<filename> طبق getPortableRelativePath
    const lastEntry = zip.getEntry(`images/stream-test-client/stream-${IMAGE_COUNT - 1}.jpg`);
    assert.ok(lastEntry, 'entry انتخابی داخل ZIP هست');
    const entryBytes = lastEntry.getData();
    assert.strictEqual(entryBytes.equals(sentinelBytes), true, 'محتوای تصویر انتهایی بایت‌به‌بایت حفظ شده');
    pass(`ساختار ZIP معتبر: data.json + ${imageEntries.length} تصویر، و محتوا ۱:۱ حفظ شده`);

    // بدون مدل: نباید entry مدل باشد
    assert.strictEqual(zip.getEntry('model.json'), null, 'بدون modelBundle نباید model.json باشد');
    assert.strictEqual(zip.getEntry('model.weights.bin'), null, 'بدون modelBundle نباید model.weights.bin باشد');
    pass('بدون بستهٔ مدل، entryهای مدل غایب‌اند (سازگاری عقب‌رو)');

    // بدون فایل موقت باقی‌مانده
    const leftovers = fs.readdirSync(outDir).filter(f => f.includes('.part-'));
    assert.deepStrictEqual(leftovers, [], 'فایل .part-* باقی نمانده باشد');
    pass('فایل موقت .part باقی نماند (rename اتمیک)');
  } finally {
    if (db) { try { db.close(); } catch { /* ignore */ } }
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  if (failed) {
    console.error(`\n${failed} تست شکست خورد.`);
    process.exit(1);
  }
  console.log('\nتست استریم بکاپ سبز شد.');
}

main().catch((err) => {
  console.error('تست استریم بکاپ با خطا متوقف شد:', err);
  process.exit(1);
});
