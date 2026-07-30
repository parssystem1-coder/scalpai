/**
 * file-crypto.cjs — رمزنگاری فایل/بافر در سکون (موج ۲ / آیتم‌های C1 و C2)
 * -----------------------------------------------------------------------
 * مقصود: AES-256-GCM برای تصاویر بالینی روی دیسک، فایل JSON بک‌اند جایگزین،
 * و envelope «پشتیبان رمزدار با پسورد».
 *
 * چرا AES-256-GCM: استاندارد صنعت برای دادهٔ در سکون است؛ علاوه بر محرمانگی،
 * برچسب احراز (tag) دستکاری/خرابی فایل را تشخیص می‌دهد — یعنی «رمزگشایی
 * موفق» و «دست‌نخورده بودن» یکی می‌شوند. (در مقابل CBC که malleable است.)
 *
 * فرمت خودتعریف (بدون نیاز به فرادادهٔ بیرونی):
 *   magic(4B = 'SCPA') | version(1B) | iv(12B) | ciphertext | tag(16B)
 * نبود magic یعنی فایل legacy/رمزنشده است → سازگاری عقب‌رو بدون مهاجرت اجباری.
 *
 * این ماژول هیچ وابستگی به Electron ندارد تا با node خام تست شود.
 */

const crypto = require('crypto');

const FILE_MAGIC = Buffer.from([0x53, 0x43, 0x50, 0x41]); // 'SCPA'
const FILE_VERSION = 0x01;
const IV_LEN = 12; // توصیهٔ NIST برای GCM
const TAG_LEN = 16; // برچسب کامل ۱۲۸بیتی — کوتاه‌سازی عمداً نشده
const KEY_LEN = 32; // AES-256

// envelope پشتیبان رمزدار — magic متفاوت تا با فایل‌های تکی اشتباه نشود
const PASSWORD_MAGIC = Buffer.from([0x53, 0x43, 0x50, 0x42]); // 'SCPB'
const PBKDF2_ITERATIONS = 210000; // توصیهٔ OWASP برای PBKDF2-HMAC-SHA256

function assertKey(key) {
  if (!Buffer.isBuffer(key) || key.length !== KEY_LEN) {
    throw new Error('file-crypto: key must be a 32-byte Buffer');
  }
}

/**
 * رمزنگاری یک بافر با کلید ۳۲بایتی. IV به‌ازای هر فراخوانی تصادفی است —
 * هرگز (key, iv) ثابت تکرار نمی‌شود (شرط حیاتی امنیت GCM).
 * @param {Buffer} plain
 * @param {Buffer} key
 * @returns {Buffer}
 */
function encryptBuffer(plain, key) {
  assertKey(key);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([FILE_MAGIC, Buffer.from([FILE_VERSION]), iv, ct, tag]);
}

/**
 * آیا بافر با فرمت این ماژول رمز شده است؟ (وجود magic header)
 * @param {Buffer} buf
 */
function isEncryptedBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= FILE_MAGIC.length + 1 + IV_LEN + TAG_LEN &&
    buf.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)
  );
}

/**
 * رمزگشایی بافر خروجی encryptBuffer.
 * خطای GCM auth (کلید غلط یا دستکاری) به Error با پیام واضح تبدیل می‌شود.
 * @param {Buffer} blob
 * @param {Buffer} key
 * @returns {Buffer}
 */
function decryptBuffer(blob, key) {
  assertKey(key);
  if (!isEncryptedBuffer(blob)) throw new Error('file-crypto: not an encrypted buffer (missing magic)');
  const version = blob[FILE_MAGIC.length];
  if (version !== FILE_VERSION) throw new Error(`file-crypto: unsupported version ${version}`);
  const ivStart = FILE_MAGIC.length + 1;
  const iv = blob.subarray(ivStart, ivStart + IV_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(ivStart + IV_LEN, blob.length - TAG_LEN);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('file-crypto: decryption failed (wrong key or corrupted data)');
  }
}

/**
 * مشتق‌سازی کلید کاربرد-محور از کلید اصلی (DEK) با HKDF-SHA256.
 * چرا کلید جدا به‌ازای هر کاربرد: لورفتن کلید تصاویر (مثلاً در فایل بکاپ)
 * کلید دیتابیس/JSON را لو نمی‌دهد؛ و چرخش یک کاربرد بقیه را تحت تأثیر نمی‌گذارد.
 * خروجی برای ورودی‌های یکسان قطعی است (همان رفتار مورد انتظار از KDF).
 * @param {Buffer} masterKey — DEK ۳۲ بایتی
 * @param {string} purpose — مثل 'image-aes' یا 'json-store'
 * @returns {Buffer}
 */
function derivePurposeKey(masterKey, purpose) {
  assertKey(masterKey);
  const out = crypto.hkdfSync('sha256', masterKey, 'scalpai-wave2-salt-v1', String(purpose), KEY_LEN);
  return Buffer.from(out);
}

// =============== پشتیبان رمزدار با پسورد (C2.4) ===============
// کل فایل ZIP نهایی با کلید مشتق از پسورد کاربر رمز می‌شود تا بتوان آن را
// امن بین کلینیک‌ها/دستگاه‌ها منتقل کرد (مرز تنها خروجی داده از دستگاه).

/**
 * رمزنگاری بافر با پسورد — header: magic(4) | version(1) | iter(4 BE) | salt(16) | iv(12) | ct | tag(16)
 * @param {Buffer} plain
 * @param {string} password
 * @returns {Buffer}
 */
function encryptWithPassword(plain, password) {
  if (typeof password !== 'string' || password.length < 1) {
    throw new Error('file-crypto: password required');
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(IV_LEN);
  const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  const iterBuf = Buffer.alloc(4);
  iterBuf.writeUInt32BE(PBKDF2_ITERATIONS, 0);
  return Buffer.concat([PASSWORD_MAGIC, Buffer.from([FILE_VERSION]), iterBuf, salt, iv, ct, tag]);
}

/** @param {Buffer} buf */
function isPasswordProtectedBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= PASSWORD_MAGIC.length + 1 + 4 + 16 + IV_LEN + TAG_LEN &&
    buf.subarray(0, PASSWORD_MAGIC.length).equals(PASSWORD_MAGIC)
  );
}

/**
 * رمزگشایی بافر خروجی encryptWithPassword.
 * @param {Buffer} blob
 * @param {string} password
 * @returns {Buffer}
 */
function decryptWithPassword(blob, password) {
  if (!isPasswordProtectedBuffer(blob)) throw new Error('file-crypto: not a password-protected buffer');
  const version = blob[PASSWORD_MAGIC.length];
  if (version !== FILE_VERSION) throw new Error(`file-crypto: unsupported version ${version}`);
  let off = PASSWORD_MAGIC.length + 1;
  const iterations = blob.readUInt32BE(off); off += 4;
  // سقف امنیتی تا یک فایل دستکاری‌شده با iter نجومی DoS نسازد
  if (!Number.isFinite(iterations) || iterations < 1000 || iterations > 2_000_000) {
    throw new Error('file-crypto: invalid KDF parameters');
  }
  const salt = blob.subarray(off, off + 16); off += 16;
  const iv = blob.subarray(off, off + IV_LEN); off += IV_LEN;
  const tag = blob.subarray(blob.length - TAG_LEN);
  const ct = blob.subarray(off, blob.length - TAG_LEN);
  const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LEN, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new Error('file-crypto: decryption failed (wrong password or corrupted data)');
  }
}

/**
 * آماده‌سازی بایت‌های تصویرِ داخل یک بکاپ برای ذخیره روی این دستگاه (C2.4):
 * اگر بایت‌ها با کلید مبدأ رمز شده‌اند با آن رمزگشایی می‌شوند (بدون کلید خطا)،
 * سپس در صورت فعال بودن رمزنگاری محلی با کلید مقصد بازنویسی می‌شوند.
 * @param {Buffer} bytes
 * @param {Buffer|null} sourceKey — کلید تصاویر بکاپ (از envelope) یا null
 * @param {Buffer|null} localKey — کلید تصاویر این دستگاه یا null
 * @returns {Buffer}
 */
function reencryptImportedMedia(bytes, sourceKey, localKey) {
  let plain = bytes;
  if (isEncryptedBuffer(bytes)) {
    if (!sourceKey) {
      throw new Error('Backup images are encrypted but the backup carries no media key');
    }
    plain = decryptBuffer(bytes, sourceKey);
  }
  return localKey ? encryptBuffer(plain, localKey) : plain;
}

module.exports = {
  FILE_MAGIC,
  FILE_VERSION,
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  derivePurposeKey,
  encryptWithPassword,
  decryptWithPassword,
  isPasswordProtectedBuffer,
  reencryptImportedMedia,
  PBKDF2_ITERATIONS,
};
