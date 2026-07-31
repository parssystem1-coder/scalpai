/**
 * test-encryption.cjs — تست‌های موج ۲ (رمزنگاری دادهٔ در سکون)
 * -----------------------------------------------------------------------
 * پوشش:
 *  ۱) file-crypto: رفت‌وبرگشت AES-256-GCM، تشخیص magic، کلید غلط، دستکاری، HKDF
 *  ۲) پشتیبان رمزدار (PBKDF2 + GCM): رفت‌وبرگشت، پسورد غلط، پارامترهای نامعتبر
 *  ۳) dek.cjs: تولید/بازکردن DEK با mock safeStorage + حالت unavailable
 *  ۴) مهاجرت SQLite: DB واقعی plaintext (با دادهٔ fake) → SQLCipher →
 *     باز شدن خارجی بدون کلید شکست می‌خورد؛ داده یک‌به‌یک حفظ شده
 *  ۵) تصاویر روی دیسک رمزشده‌اند (magic header) و از طریق هندلر شفاف خوانده می‌شوند
 *  ۶) بک‌اند JSON: فایل رمز می‌شود و با کلید گمشده هرگز بازنویسی نمی‌شود
 *  ۷) بکاپ v3: تصاویر رمزشده با کلید envelope → import روی دستگاهِ دیگرِ شبیه‌سازی‌شده
 *
 * روی ماشین‌هایی که درایور SQLCipher نصب نیست، بخش‌های ۴-۷ با هشدار skip
 * می‌شوند و تست سبز می‌ماند (همان فلسفهٔ scripts/rebuild-native.cjs).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');

const {
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  derivePurposeKey,
  encryptWithPassword,
  decryptWithPassword,
  isPasswordProtectedBuffer,
  reencryptImportedMedia,
} = require('../electron/file-crypto.cjs');
const dek = require('../electron/dek.cjs');
const { loadSqliteDriver } = require('../electron/sqlite-driver.cjs');
const {
  migratePlaintextToEncrypted,
  cleanupPlainOldAfterSuccessfulBoot,
  recoverIncompleteMigration,
  tryOpenKeyed,
  openPlain,
  PLAIN_OLD_SUFFIX,
} = require('../electron/db-encryption.cjs');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log('  ✓', name);
}

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** safeStorage تستی — wrap/unwrap قابل‌پیش‌بینی بدون کلید واقعی سیستم‌عامل */
function makeSafeStorageMock(available = true) {
  const PREFIX = 'mockwrap:';
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s) => Buffer.from(PREFIX + s, 'utf-8'),
    decryptString: (buf) => {
      const text = buf.toString('utf-8');
      if (!text.startsWith(PREFIX)) throw new Error('mock: cannot unwrap (foreign machine)');
      return text.slice(PREFIX.length);
    },
  };
}

// ---------------------------------------------------------------- 1) file-crypto
function testFileCrypto() {
  console.log('file-crypto:');
  const key = crypto.randomBytes(32);
  const plain = Buffer.from('دادهٔ بالینی تست — confidential', 'utf-8');

  const enc = encryptBuffer(plain, key);
  assert.ok(isEncryptedBuffer(enc), 'encrypted buffer should carry magic');
  assert.ok(!isEncryptedBuffer(plain), 'plain buffer must not look encrypted');
  assert.deepStrictEqual(decryptBuffer(enc, key), plain, 'round-trip must be byte-exact');
  ok('round-trip byte-exact + magic detection');

  const otherKey = crypto.randomBytes(32);
  assert.throws(() => decryptBuffer(enc, otherKey), /decryption failed/, 'wrong key must fail');
  ok('wrong key fails');

  const tampered = Buffer.from(enc);
  tampered[tampered.length - 20] ^= 0xff;
  assert.throws(() => decryptBuffer(tampered, key), /decryption failed/, 'tamper must fail');
  ok('tampered ciphertext fails (GCM auth)');

  const k1 = derivePurposeKey(key, 'image-aes');
  const k2 = derivePurposeKey(key, 'image-aes');
  const k3 = derivePurposeKey(key, 'json-store');
  assert.ok(k1.equals(k2), 'HKDF must be deterministic');
  assert.ok(!k1.equals(k3), 'different purposes must derive different keys');
  assert.strictEqual(k1.length, 32);
  ok('HKDF deterministic + purpose-separated');
}

// ---------------------------------------------------------------- 2) password backup codec
function testPasswordCodec() {
  console.log('password backup codec:');
  const plain = Buffer.from('ZIP-CONTENT-SIMULATED');
  const enc = encryptWithPassword(plain, 'گذرواژه تست 123');
  assert.ok(isPasswordProtectedBuffer(enc));
  assert.deepStrictEqual(decryptWithPassword(enc, 'گذرواژه تست 123'), plain);
  ok('password round-trip byte-exact');

  assert.throws(() => decryptWithPassword(enc, 'wrong-password'), /decryption failed/);
  ok('wrong password fails');

  const mutant = Buffer.from(enc);
  // iterations غیرعادی (بیش از سقف) — باید قبل از KDF گران رد شود
  mutant.writeUInt32BE(50_000_000, 5);
  assert.throws(() => decryptWithPassword(mutant, 'x'), /invalid KDF parameters/);
  ok('extreme KDF params rejected (no DoS)');

  // reencryptImportedMedia
  const srcKey = crypto.randomBytes(32);
  const dstKey = crypto.randomBytes(32);
  const raw = Buffer.from('JPEG-BYTES');
  assert.deepStrictEqual(reencryptImportedMedia(raw, null, null), raw, 'plain→plain passthrough');
  const atSource = encryptBuffer(raw, srcKey);
  const rewrapped = reencryptImportedMedia(atSource, srcKey, dstKey);
  assert.deepStrictEqual(decryptBuffer(rewrapped, dstKey), raw, 'source→dest re-wrap');
  assert.throws(() => reencryptImportedMedia(atSource, null, dstKey), /no media key/);
  const decryptedOnImport = reencryptImportedMedia(atSource, srcKey, null);
  assert.deepStrictEqual(decryptedOnImport, raw, 'encrypted backup into plaintext machine');
  ok('reencryptImportedMedia: passthrough / re-wrap / missing-key error / decrypt-on-import');
}

// ---------------------------------------------------------------- 3) dek
function testDek() {
  console.log('dek:');
  const dir = tempDir('scalpai-dek-');
  const ss = makeSafeStorageMock(true);

  dek._resetForTests();
  let res = dek.initDek(ss, dir);
  assert.strictEqual(res.status, 'active');
  const first = dek.getDek();
  assert.ok(first && first.length === 32, 'DEK must be 32 bytes');
  ok('DEK generated (32B) and stored wrapped');

  // راه‌اندازی دوباره → همان کلید از روی فایل unwrap شود
  dek._resetForTests();
  res = dek.initDek(ss, dir);
  assert.ok(dek.getDek().equals(first), 'unwrap must return the same DEK');
  ok('DEK unwrap round-trip stable');

  const img1 = dek.getPurposeKey('image-aes');
  const img2 = dek.getPurposeKey('image-aes');
  assert.ok(img1.equals(img2), 'purpose key cached/stable');
  ok('purpose key derivation stable');

  // safeStorage غایب → unavailable و بدون کلید
  dek._resetForTests();
  res = dek.initDek(makeSafeStorageMock(false), tempDir('scalpai-dek-off-'));
  assert.strictEqual(res.status, 'unavailable');
  assert.strictEqual(dek.getDek(), null);
  assert.strictEqual(dek.getPurposeKey('image-aes'), null);
  ok('safeStorage unavailable → disabled layer (documented fail-open)');

  // کلید از «دستگاه دیگر» (mock متفاوت) → unwrapped-error، نه سکوت
  dek._resetForTests();
  const otherMock = makeSafeStorageMock(true);
  otherMock.decryptString = () => { throw new Error('mock: foreign'); };
  res = dek.initDek(otherMock, dir);
  assert.strictEqual(res.status, 'unwrapped-error');
  assert.strictEqual(dek.getDek(), null);
  ok('foreign key file → explicit unwrapped-error');

  dek._resetForTests();
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- 4..7) SQLite + handlers
function testSqliteEncryption() {
  console.log('sqlite encryption (SQLCipher):');
  const driver = loadSqliteDriver();
  if (!driver.cipherCapable) {
    console.warn('  ⚠ SQLCipher driver not available — skipping sqlite/image/backup sections (allowed on machines without native build)');
    return;
  }
  const Database = driver.Database;
  const { createDbHandlers } = require('../electron/db-handlers.cjs');
  const { createJsonDbHandlers } = require('../electron/db-handlers-json.cjs');
  const { createBaseTables, runMigrations } = require('../electron/schema-migrations.cjs');

  const userData = tempDir('scalpai-enc-userdata-');
  const dbPath = path.join(userData, 'scalpai.db');
  const ss = makeSafeStorageMock(true);

  dek._resetForTests();
  dek.initDek(ss, userData);
  const hexKey = dek.getDek().toString('hex');

  // --- ساخت DB واقعی plaintext با دادهٔ fake ---
  let db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createBaseTables(db);
  runMigrations(db);

  // توجه: هندلرها کلید تصاویر را از dek می‌خوانند — یعنی تصویری که همین حالا
  // ذخیره می‌کنیم از قبل رمزشده است؛ همان سناریوی «تصاویر جدید رمزشده» DoD.
  let handlers = createDbHandlers(db, userData, ss);

  const run = (method, params = {}) => handlers.handleDbQuery(method, params);

  return (async () => {
    const client = await run('createClient', {
      firstName: 'فاطمه', lastName: 'تستی', phone: '0912', email: 'f@test.local',
      gender: 'female', birthDate: '1990-01-01', notes: '',
    });
    assert.ok(client.id, 'client created');

    // یک پیکسل JPEG واقعی (1x1) به‌عنوان تصویر fake
    const jpeg1px = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/Aaf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/Aaf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IX//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z',
      'base64',
    );
    const dataUrl = 'data:image/jpeg;base64,' + jpeg1px.toString('base64');
    const item = await run('addGalleryItem', {
      clientId: client.id, type: 'photo', url: dataUrl, thumbnail: null, filename: 'probe.jpg', metadata: {},
    });
    assert.ok(item.filePath, 'gallery item stored to file');

    // DoD: تصویر روی دیسک به‌صورت رمزشده است (magic) و JPEG خام نیست
    const diskBytes = fs.readFileSync(item.filePath);
    assert.ok(isEncryptedBuffer(diskBytes), 'image on disk must be encrypted (magic header)');
    assert.ok(!(diskBytes[0] === 0xff && diskBytes[1] === 0xd8), 'image on disk must NOT be a raw JPEG');
    ok('new image stored encrypted on disk (not readable as JPEG)');

    // خواندن شفاف از طریق هندلر → همان بایت‌ها
    const back = await run('getGalleryItemDataUrl', { id: item.id });
    const backBytes = Buffer.from(back.split('base64,')[1], 'base64');
    assert.deepStrictEqual(backBytes, jpeg1px, 'transparent decrypt read must be byte-exact');
    ok('encrypted image transparently readable via handler (byte-exact)');

    // checkpoint + بستن برای مهاجرت
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();

    // --- مهاجرت ---
    const report = migratePlaintextToEncrypted({
      Database, dbPath, hexKey, backupDir: path.join(userData, 'backups'), log: console,
    });
    assert.ok(fs.existsSync(report.backupPath), 'pre-migration file backup must exist');
    assert.ok(fs.existsSync(report.plainOldPath), 'plain old must be kept');
    assert.ok(report.tablesCopied.length >= 8, 'all tables copied');
    ok(`migration: ${report.tablesCopied.length} tables / ${report.rowsCopied} rows + file backup`);

    // DoD: باز کردن با ابزار خارجی (بدون کلید) شکست می‌خورد
    assert.throws(() => {
      const ext = new Database(dbPath);
      try { ext.prepare('SELECT count(*) FROM sqlite_master').get(); } finally { try { ext.close(); } catch { /* ignore */ } }
    }, /not a database/i);
    ok('scalpai.db NOT openable without key (external tool fails)');

    // با کلید غلط هم باز نشود
    assert.throws(() => {
      const wrong = tryOpenKeyed(Database, dbPath, '0'.repeat(64));
      wrong.db.close();
    });
    ok('wrong key rejected');

    // با کلید درست باز شود و داده یک‌به‌یک بماند
    db = tryOpenKeyed(Database, dbPath, hexKey).db;
    db.pragma('foreign_keys = ON');
    handlers = createDbHandlers(db, userData, ss);
    const clients = await handlers.handleDbQuery('getClients', {});
    assert.strictEqual(clients.length, 1);
    assert.strictEqual(clients[0].firstName, 'فاطمه');
    const migratedBack = await handlers.handleDbQuery('getGalleryItemDataUrl', { id: item.id });
    assert.deepStrictEqual(Buffer.from(migratedBack.split('base64,')[1], 'base64'), jpeg1px);
    ok('data + images intact after migration (1:1)');

    // جدول audit_log (schema v10) موجود است
    const auditRows = await handlers.handleDbQuery('getAuditLog', {});
    assert.ok(Array.isArray(auditRows));
    ok('audit_log table exists (schema v10)');

    // سیاست plain.old: بوت اول marker، بوت دوم حذف
    const markerPath = dbPath + PLAIN_OLD_SUFFIX + '.booted';
    cleanupPlainOldAfterSuccessfulBoot(dbPath, console);
    assert.ok(fs.existsSync(dbPath + PLAIN_OLD_SUFFIX), 'first boot keeps plain.old');
    assert.ok(fs.existsSync(markerPath), 'first boot writes marker');
    cleanupPlainOldAfterSuccessfulBoot(dbPath, console);
    assert.ok(!fs.existsSync(dbPath + PLAIN_OLD_SUFFIX), 'second successful boot removes plain.old');
    ok('plain.old kept for one session then removed');

    db.close();

    // --- بکاپ v3: تصاویر رمزشده + کلید envelope → دستگاه «دیگر» ---
    db = tryOpenKeyed(Database, dbPath, hexKey).db;
    handlers = createDbHandlers(db, userData, ss);
    const backup = await handlers.handleDbQuery('exportData', {});
    assert.ok(backup.startsWith('scalpai-backup:v3:base64:'), 'v3 backup produced');
    db.close();

    // دستگاه دوم: userData تازه + DEK دیگر
    const userData2 = tempDir('scalpai-enc-userdata2-');
    const dbPath2 = path.join(userData2, 'scalpai.db');
    dek._resetForTests();
    dek.initDek(makeSafeStorageMock(true), userData2);
    const hexKey2 = dek.getDek().toString('hex');
    assert.notStrictEqual(hexKey2, hexKey, 'second device has a different DEK');

    let db2 = tryOpenKeyed(Database, dbPath2, hexKey2).db; // رمزشده از بدو تولد
    db2.pragma('foreign_keys = ON');
    createBaseTables(db2);
    runMigrations(db2);
    const handlers2 = createDbHandlers(db2, userData2, makeSafeStorageMock(true));
    await handlers2.handleDbQuery('importData', { jsonData: backup });
    const clients2 = await handlers2.handleDbQuery('getClients', {});
    assert.strictEqual(clients2.length, 1, 'client restored on device 2');
    const list2 = await handlers2.handleDbQuery('getGalleryByClient', { clientId: clients2[0].id });
    assert.strictEqual(list2.length, 1, 'gallery item restored on device 2');
    const pic2 = await handlers2.handleDbQuery('getGalleryItemDataUrl', { id: list2[0].id });
    assert.deepStrictEqual(Buffer.from(pic2.split('base64,')[1], 'base64'), jpeg1px, 'image readable on device 2 after re-wrap');
    const disk2 = fs.readFileSync(list2[0].filePath);
    assert.ok(isEncryptedBuffer(disk2), 'image on device 2 disk stays encrypted');
    assert.throws(
      () => decryptBuffer(disk2, derivePurposeKey(Buffer.from(hexKey, 'hex'), 'image-aes')),
      /decryption failed/,
      'device-2 file must NOT decrypt with device-1 key',
    );
    ok('cross-device backup: images re-wrapped with destination key, readable, still encrypted');

    // DoD (C2.4): بکاپ رمزدار v4
    const encBackup = await handlers2.handleDbQuery('exportData', { backupPassword: 'test-pass-1234' });
    assert.ok(encBackup.startsWith('scalpai-backup:v4:enc:base64:'), 'v4 password backup produced');
    // توجه: handleDbQuery خطا را در پاسخ برمی‌گرداند ({error}) نه throw
    const wrongPassResult = await handlers2.handleDbQuery('importData', { jsonData: encBackup, backupPassword: 'wrong-pass-0000' });
    assert.ok(
      wrongPassResult && typeof wrongPassResult.error === 'string' && /decrypt|password/i.test(wrongPassResult.error),
      'wrong password must fail, got: ' + JSON.stringify(wrongPassResult),
    );
    db2.close();
    dek._resetForTests();

    const userData3 = tempDir('scalpai-enc-userdata3-');
    dek.initDek(makeSafeStorageMock(true), userData3);
    const dbPath3 = path.join(userData3, 'scalpai.db');
    const db3 = openPlainForImport(Database, dbPath3);
    createBaseTables(db3); runMigrations(db3);
    const handlers3 = createDbHandlers(db3, userData3, makeSafeStorageMock(true));
    await handlers3.handleDbQuery('importData', { jsonData: encBackup, backupPassword: 'test-pass-1234' });
    const clients3 = await handlers3.handleDbQuery('getClients', {});
    assert.strictEqual(clients3.length, 1, 'v4 restore works with correct password');
    db3.close();
    ok('v4 password backup: wrong password rejected, correct password restores');

    // --- بک‌اند JSON رمزشده (C1.4) ---
    const jsonDir = tempDir('scalpai-json-enc-');
    dek._resetForTests();
    dek.initDek(makeSafeStorageMock(true), jsonDir);
    const j1 = createJsonDbHandlers(jsonDir, makeSafeStorageMock(true));
    await j1.handleDbQuery('createClient', {
      firstName: 'زهرا', lastName: 'جیسون', phone: '0', email: '', gender: 'female', birthDate: '', notes: '',
    });
    const jsonFile = path.join(jsonDir, 'scalpai-data.json');
    const rawJson = fs.readFileSync(jsonFile);
    assert.ok(isEncryptedBuffer(rawJson), 'json store file must be encrypted');
    assert.ok(!rawJson.toString('utf-8', 0, 20).includes('{'), 'json store must not be human-readable');
    ok('JSON fallback store is encrypted at rest');

    const j2 = createJsonDbHandlers(jsonDir, makeSafeStorageMock(true));
    const jc = await j2.handleDbQuery('getClients', {});
    assert.strictEqual(jc.length, 1, 'encrypted json store re-loads');
    assert.strictEqual(jc[0].firstName, 'زهرا');
    ok('encrypted JSON store round-trips');

    // کلید گمشده → فایل هرگز بازنویسی نمی‌شود
    const before = fs.readFileSync(jsonFile);
    dek._resetForTests(); // بدون init → کلیدی در دسترس نیست
    const j3 = createJsonDbHandlers(jsonDir, makeSafeStorageMock(false));
    assert.strictEqual(j3.getStorageState().persistenceBlocked, true, 'persistence must be blocked');
    await j3.handleDbQuery('createClient', {
      firstName: 'X', lastName: 'Y', phone: '0', email: '', gender: 'male', birthDate: '', notes: '',
    });
    assert.deepStrictEqual(fs.readFileSync(jsonFile), before, 'encrypted store must never be overwritten without its key');
    ok('lost key → JSON store protected from overwrite (no silent data loss)');

    dek._resetForTests();
    fs.rmSync(userData, { recursive: true, force: true });
    fs.rmSync(userData2, { recursive: true, force: true });
    fs.rmSync(userData3, { recursive: true, force: true });
    fs.rmSync(jsonDir, { recursive: true, force: true });
  })();

  function openPlainForImport(Database_, dbPath_) {
    const d = new Database_(dbPath_);
    d.pragma('foreign_keys = ON');
    return d;
  }
}

// ---------------------------------------------------------------- 8) crash recovery
async function testRecovery() {
  console.log('migration crash recovery:');
  const driver = loadSqliteDriver();
  if (!driver.cipherCapable) {
    console.warn('  ⚠ SQLCipher driver not available — skipping recovery section');
    return;
  }
  const Database = driver.Database;
  const { createBaseTables, runMigrations } = require('../electron/schema-migrations.cjs');

  const userData = tempDir('scalpai-recovery-');
  const dbPath = path.join(userData, 'scalpai.db');
  const hexKey = crypto.randomBytes(32).toString('hex');

  // DB plaintext با یک ردیف
  let db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  createBaseTables(db);
  runMigrations(db);
  db.prepare("INSERT INTO clients (id, firstName, lastName, createdAt, updatedAt) VALUES ('c1', 'N', 'T', '2026-01-01', '2026-01-01')").run();
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();

  const silentLog = { log() {}, warn() {}, error() {} };
  const report = migratePlaintextToEncrypted({ Database, dbPath, hexKey, backupDir: path.join(userData, 'backups'), log: silentLog });
  const encryptedCopy = path.join(userData, 'encrypted-snapshot.db');
  fs.copyFileSync(dbPath, encryptedCopy); // نسخهٔ رمزشدهٔ سالم برای سناریوی B

  // idempotent: dbPath موجود → هیچ کاری نکن
  let r = recoverIncompleteMigration(dbPath, { Database, hexKey }, silentLog);
  assert.deepStrictEqual(r, { recovered: false });
  ok('no-op when main db exists');

  // حالت A: dbPath گم + plainOld موجود → بازگشت به plaintext (بدون از دست رفتن داده)
  fs.rmSync(dbPath, { force: true });
  fs.rmSync(dbPath + PLAIN_OLD_SUFFIX + '.booted', { force: true });
  r = recoverIncompleteMigration(dbPath, { Database, hexKey }, silentLog);
  assert.deepStrictEqual(r, { recovered: true, mode: 'plain' });
  db = openPlain(Database, dbPath);
  assert.strictEqual(db.prepare("SELECT firstName FROM clients WHERE id='c1'").get().firstName, 'N');
  db.close();
  ok('crash mid-swap (only .plain.old) → plaintext restored, no data loss');

  // حالت B: فقط .enc سالم موجود → با راستی‌آزمایی جایگزین شود
  fs.rmSync(report.plainOldPath, { force: true });
  fs.rmSync(dbPath, { force: true });
  fs.copyFileSync(encryptedCopy, dbPath + '.enc');
  r = recoverIncompleteMigration(dbPath, { Database, hexKey }, silentLog);
  assert.deepStrictEqual(r, { recovered: true, mode: 'encrypted' });
  db = tryOpenKeyed(Database, dbPath, hexKey).db;
  assert.strictEqual(db.prepare("SELECT firstName FROM clients WHERE id='c1'").get().firstName, 'N');
  db.close();
  ok('crash (only valid .enc) → verified promotion, no data loss');

  // حالت C: .enc خراب → هرگز جایگزین نشود
  fs.rmSync(dbPath, { force: true });
  fs.writeFileSync(dbPath + '.enc', Buffer.from('GARBAGE-NOT-A-DB'));
  r = recoverIncompleteMigration(dbPath, { Database, hexKey }, silentLog);
  assert.deepStrictEqual(r, { recovered: false });
  assert.ok(fs.existsSync(dbPath + '.enc'), 'corrupt .enc kept for manual inspection');
  assert.ok(!fs.existsSync(dbPath), 'corrupt candidate must NOT be promoted');
  fs.rmSync(dbPath + '.enc', { force: true });
  ok('corrupt .enc never promoted');

  fs.rmSync(encryptedCopy, { force: true });
  fs.rmSync(userData, { recursive: true, force: true });
}

async function main() {
  testFileCrypto();
  testPasswordCodec();
  testDek();
  await testSqliteEncryption();
  await testRecovery();
  // فاز ۳ (AUD-10): شمارندهٔ `passed` شمرده می‌شد ولی هرگز گزارش نمی‌شد —
  // لینت آن را به‌عنوان متغیر بی‌مصرف پیدا کرد. بقیهٔ اسکریپت‌های گیت (مثل
  // test-build-assets) عدد بررسی‌ها را چاپ می‌کنند؛ این یکی هم باید بکند تا
  // «سبز شد» قابل‌شمارش باشد و کم شدن بی‌صدای یک بررسی دیده شود.
  console.log(`\n✅ ${passed} بررسی رمزنگاری موفق.`);
  console.log(`ALL_ENCRYPTION_TESTS_PASSED`);
}

main().catch((error) => {
  console.error('\nENCRYPTION TEST FAILED:', error);
  process.exit(1);
});
