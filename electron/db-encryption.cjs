/**
 * db-encryption.cjs — مهاجرت دیتابیس SQLite از plaintext به SQLCipher (موج ۲ / C1)
 * -----------------------------------------------------------------------
 * قانون سخت موج ۲ پیاده‌سازی می‌شود: «کپی → راستی‌آزمایی → جایگزینی»:
 *   ۱) بکاپ سطح-فایل از دیتابیس (پس از WAL checkpoint توسط caller) به userData/backups
 *   ۲) ساخت فایل .enc با همان اسکیمای کد (createBaseTables + runMigrations)
 *   ۳) کپی جدول‌به‌جدول با ATTACH فایل plaintext به‌عنوان src با KEY خالی
 *      (کلید خالی در SQLCipher یعنی «این اتچ بدون کدَک است» — الگوی استاندارد)
 *   ۴) راستی‌آزمایی: تعداد ردیف هر جدول با مبدأ برابر + integrity_check=ok
 *   ۵) جایگزینی: db → db.plain.old (نگه داشته می‌شود تا حداقل یک نشست موفق)
 *      و .enc → db؛ در پایان یک باز کردن آزمایشی انجام و در صورت شکست
 *      rollback کامل انجام می‌شود.
 *
 * چرا بکاپ سطح-فایل و نه ZIP بکاپ v3: این مهاجرت فقط به فایل DB دست می‌زند
 * (تصاویر در C1 تغییر نمی‌کنند)؛ کپی checkpointشدهٔ فایل دقیق‌ترین و
 * قابل‌بازگردانی‌ترین حالت است و استارت‌آپ را با صدها مگابایت ZIP کند نمی‌کند.
 */

const fs = require('fs');
const path = require('path');
const { createBaseTables, runMigrations } = require('./schema-migrations.cjs');
const { SYSTEM_TRAINING_POOL_CLIENT_ID } = require('./db-common.cjs');

const PLAIN_OLD_SUFFIX = '.plain.old';
const PLAIN_OLD_MARKER_SUFFIX = '.plain.old.booted';

/** ساخت pragma key امن برای کلید hex (بدون کاراکتر خاص — امن برای درج در رشته) */
function keyPragmaSql(hexKey) {
  if (!/^[0-9a-f]{64}$/i.test(hexKey)) throw new Error('db-encryption: invalid hex key');
  return `key = '${hexKey.toLowerCase()}'`;
}

/**
 * تلاش برای باز کردن دیتابیس «با کلید» و خواندن sqlite_master.
 * @returns {{ db: any, encrypted: boolean }}
 */
function tryOpenKeyed(Database, dbPath, hexKey) {
  const db = new Database(dbPath);
  db.pragma(keyPragmaSql(hexKey));
  // اولین خواندن واقعی — cipher اینجا قفل/خطا می‌شود
  db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
  return { db, encrypted: true };
}

/**
 * تلاش برای باز کردن دیتابیس «بدون کلید» (plaintext یا درایور بدون cipher).
 * @returns {any} نمونهٔ db
 */
function openPlain(Database, dbPath) {
  const db = new Database(dbPath);
  db.prepare("SELECT count(*) AS c FROM sqlite_master").get();
  return db;
}

/**
 * مهاجرت فایل دیتابیس موجود به فرمت رمزشده. پیش‌شرط: caller اتصال باز به
 * dbPath را بسته و WAL checkpoint(TRUNCATE) اجرا کرده است.
 * @param {{ Database: any, dbPath: string, hexKey: string, backupDir: string, log?: object }} opts
 * @returns {{ backupPath: string, plainOldPath: string, tablesCopied: string[], rowsCopied: number }}
 */
function migratePlaintextToEncrypted({ Database, dbPath, hexKey, backupDir, log = console }) {
  const encPath = dbPath + '.enc';
  const plainOldPath = dbPath + PLAIN_OLD_SUFFIX;

  fs.rmSync(encPath, { force: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `scalpai-pre-encryption-${stamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  log.log(`[db-encryption] pre-migration file backup: ${backupPath}`);

  const enc = new Database(encPath);
  const tablesCopied = [];
  let rowsCopied = 0;
  try {
    enc.pragma(keyPragmaSql(hexKey));
    enc.pragma('journal_mode = WAL');
    // اسکیما از روی کد ساخته می‌شود (نه کپی sqlite_master از مبدأ) تا نتیجه
    // دقیقاً همان چیزی شود که یک نصب تازهٔ رمزشده داشت.
    createBaseTables(enc);
    runMigrations(enc);
    // migration نسخهٔ ۷ ردیف سیستمی «استخر آموزشی» را seed می‌کند؛ اگر بماند،
    // کپی clients از مبدأ (که همان ردیف را دارد) نقض PK می‌کند. ردیف سیستمی
    // قطعاً داخل دادهٔ مبدأ هم هست و با کپی دوباره می‌آید.
    enc.prepare('DELETE FROM clients WHERE id = ?').run(SYSTEM_TRAINING_POOL_CLIENT_ID);

    const escaped = dbPath.replace(/'/g, "''");
    enc.exec(`ATTACH DATABASE '${escaped}' AS src KEY ''`);

    // schema_version مستثناست: هر دو طرف هم‌ارزش id=1 دارند و INSERT دوباره
    // نقض PK می‌کند؛ مقدار درست از runMigrations بالا روی مقصد هست.
    const tables = enc
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_version' ORDER BY name",
      )
      .all()
      .map((r) => r.name);

    const copyTx = enc.transaction(() => {
      for (const table of tables) {
        enc.exec(`INSERT INTO main."${table}" SELECT * FROM src."${table}"`);
        tablesCopied.push(table);
      }
    });
    copyTx();

    // راستی‌آزمایی ۱: برابری تعداد ردیف هر جدول با مبدأ
    for (const table of tablesCopied) {
      const dstCount = enc.prepare(`SELECT count(*) AS c FROM main."${table}"`).get().c;
      const srcCount = enc.prepare(`SELECT count(*) AS c FROM src."${table}"`).get().c;
      if (dstCount !== srcCount) {
        throw new Error(`row count mismatch in table "${table}": src=${srcCount} dst=${dstCount}`);
      }
      rowsCopied += dstCount;
    }
    enc.exec('DETACH DATABASE src');

    // راستی‌آزمایی ۲: سلامت ساختاری نسخهٔ رمزشده
    const integrity = enc.pragma('integrity_check', { simple: true });
    const integrityText = typeof integrity === 'string' ? integrity : integrity && integrity.integrity_check;
    if (integrityText !== 'ok') throw new Error(`integrity_check failed: ${integrityText}`);
  } catch (error) {
    try { enc.close(); } catch { /* ignore */ }
    fs.rmSync(encPath, { force: true });
    throw error;
  }
  enc.close();

  // ۵) جایگزینی + باز کردن آزمایشی؛ شکست = rollback کامل
  fs.renameSync(dbPath, plainOldPath);
  fs.renameSync(encPath, dbPath);
  try {
    const probe = tryOpenKeyed(Database, dbPath, hexKey);
    probe.db.close();
  } catch (error) {
    log.error('[db-encryption] post-swap open failed, rolling back:', error.message);
    try { fs.rmSync(dbPath + '-wal', { force: true }); } catch { /* ignore */ }
    try { fs.rmSync(dbPath + '-shm', { force: true }); } catch { /* ignore */ }
    fs.renameSync(dbPath, encPath);
    fs.renameSync(plainOldPath, dbPath);
    throw new Error('Encrypted database failed post-migration verification; rolled back. Cause: ' + error.message);
  }

  log.log(`[db-encryption] migration done: ${tablesCopied.length} tables, ${rowsCopied} rows copied`);
  return { backupPath, plainOldPath, tablesCopied, rowsCopied };
}

/**
 * سیاست حذف db.plain.old: فایل رمزنشدهٔ کامل باید حذف شود، ولی نه قبل از اینکه
 * بوت رمزشده حداقل یک نشست کامل را تجربه کرده باشد. پیاده‌سازی: بوت اول
 * (پس از مهاجرت) فقط marker می‌گذارد؛ بوت بعدی که marker را دید و اتصال
 * رمزشده سالم بود، هر دو فایل را حذف می‌کند.
 * @param {string} dbPath
 * @param {object} [log]
 */
function cleanupPlainOldAfterSuccessfulBoot(dbPath, log = console) {
  const plainOld = dbPath + PLAIN_OLD_SUFFIX;
  const marker = dbPath + PLAIN_OLD_MARKER_SUFFIX;
  try {
    if (fs.existsSync(plainOld) && fs.existsSync(marker)) {
      fs.rmSync(plainOld, { force: true });
      fs.rmSync(marker, { force: true });
      log.log('[db-encryption] plain old database removed after a successful encrypted session');
    } else if (fs.existsSync(plainOld) && !fs.existsSync(marker)) {
      fs.writeFileSync(marker, new Date().toISOString(), 'utf-8');
      log.log('[db-encryption] plain old database kept for this session; will be removed next successful boot');
    }
  } catch (error) {
    log.warn('[db-encryption] plain-old cleanup failed (non-fatal):', error.message);
  }
}

/**
 * ترمیم حالت «کرش وسط جایگزینیِ مهاجرت»: اگر فرایند بین دو rename کشته شود،
 * dbPath ممکن است گم باشد ولی هیچ داده‌ای از دست نرفته (plain.old یا .enc).
 * بدون این ترمیم، بوت بعدی یک DB خالی می‌ساخت و داده «ناپدید» به نظر می‌رسید.
 * idempotent — فقط وقتی اثر می‌گذارد که dbPath موجود نباشد.
 * @param {string} dbPath
 * @param {{ Database?: any, hexKey?: string }} [keyCtx] — برای راستی‌آزمایی .enc قبل از جایگزینی
 * @param {object} [log]
 * @returns {{ recovered: boolean, mode?: 'plain'|'encrypted' }}
 */
function recoverIncompleteMigration(dbPath, keyCtx = {}, log = console) {
  const plainOld = dbPath + PLAIN_OLD_SUFFIX;
  const encPath = dbPath + '.enc';
  try {
    if (fs.existsSync(dbPath)) return { recovered: false };
    if (fs.existsSync(plainOld)) {
      // rename اول انجام و دوم نه → برگشت به plaintext (مهاجرت دوباره تلاش می‌کند)
      fs.renameSync(plainOld, dbPath);
      fs.rmSync(encPath, { force: true });
      log.warn('[db-encryption] recovered interrupted migration: restored plaintext database (migration will retry)');
      return { recovered: true, mode: 'plain' };
    }
    if (fs.existsSync(encPath) && keyCtx.Database && keyCtx.hexKey) {
      // فقط .enc مانده — قبل از جایگزینی باید با کلید باز و سالم باشد
      try {
        const probe = tryOpenKeyed(keyCtx.Database, encPath, keyCtx.hexKey);
        const integrity = probe.db.pragma('integrity_check', { simple: true });
        const integrityText = typeof integrity === 'string' ? integrity : integrity && integrity.integrity_check;
        probe.db.close();
        if (integrityText !== 'ok') throw new Error('integrity: ' + integrityText);
        fs.renameSync(encPath, dbPath);
        log.warn('[db-encryption] recovered interrupted migration: promoted verified .enc to main database');
        return { recovered: true, mode: 'encrypted' };
      } catch (probeError) {
        // .enc خراب/ناقص است — ترویج نکن؛ فایل برای بررسی دستی می‌ماند
        log.error('[db-encryption] .enc candidate failed verification, kept for manual inspection:', probeError.message);
      }
    }
  } catch (error) {
    log.error('[db-encryption] recovery failed:', error.message);
  }
  return { recovered: false };
}

module.exports = {
  keyPragmaSql,
  tryOpenKeyed,
  openPlain,
  migratePlaintextToEncrypted,
  cleanupPlainOldAfterSuccessfulBoot,
  recoverIncompleteMigration,
  PLAIN_OLD_SUFFIX,
};
