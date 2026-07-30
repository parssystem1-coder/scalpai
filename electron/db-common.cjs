/**
 * db-common.cjs — منطق مشترک بین db-handlers.cjs (SQLite) و db-handlers-json.cjs (fallback)
 * -----------------------------------------------------------------------
 * قبلاً هش پسورد، sanitize کردن تنظیمات، ساختار بکاپ و رمزنگاری safeStorage
 * در هر دو فایل کپی شده بود و باید دستی همگام می‌ماندند. این ماژول تنها منبع
 * حقیقت برای آن منطق است.
 */

const crypto = require('crypto');

const BACKUP_FORMAT = 'scalpai-backup';
const BACKUP_VERSION = 2;

// =============== System Training-Pool Client ===============
// یک ردیف ثابت و همیشگی در جدول/فایل clients که صرفاً برای عبور از قید
// FOREIGN KEY(clientId) REFERENCES clients(id) روی جدول gallery ساخته شده —
// عکس‌های «استخر تصاویر آموزشی» (بدون تعلق به مشتری واقعی) به این شناسه
// وصل می‌شوند. isSystemRecord=1 باعث می‌شود از فهرست/شمارش مشتریان واقعی
// و از گالری/شمارش عمومی حذف شود (نگاه کنید به فیلترهای getClients*/getAllGallery/getGalleryCount).

const SYSTEM_TRAINING_POOL_CLIENT_ID = 'system-training-pool';

/**
 * شیء کامل ردیف مشتری سیستمی — هم برای درج در JSON fallback و هم به‌عنوان
 * مرجع فیلدها هنگام درج در SQLite استفاده می‌شود.
 * @param {string} [nowIso]
 */
function buildSystemTrainingPoolClientRecord(nowIso) {
  const now = nowIso || new Date().toISOString();
  return {
    id: SYSTEM_TRAINING_POOL_CLIENT_ID,
    firstName: 'استخر آموزشی',
    lastName: '(سیستمی)',
    phone: '000',
    email: 'system@scalpai.local',
    gender: 'male',
    birthDate: '',
    notes: 'System-managed pool for shared ML training photos. Do not delete.',
    isSystemRecord: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * درج idempotent ردیف مشتری سیستمی در SQLite — اگر از قبل وجود داشته باشد کاری نمی‌کند.
 * فرض می‌شود ستون isSystemRecord از قبل روی جدول clients وجود دارد (migration نسخهٔ ۷).
 * @param {import('better-sqlite3').Database} db
 */
function ensureSystemTrainingPoolClientSqlite(db) {
  const record = buildSystemTrainingPoolClientRecord();
  db.prepare(`
    INSERT OR IGNORE INTO clients
      (id, firstName, lastName, phone, email, gender, birthDate, notes, isSystemRecord, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    record.id, record.firstName, record.lastName, record.phone, record.email,
    record.gender, record.birthDate, record.notes, record.createdAt, record.updatedAt,
  );
}

// =============== Password Hashing ===============
// فرمت ذخیره‌سازی با src/lib/passwordAuth.ts یکی است (pbkdf2) تا پسورد بین
// Electron و وب قابل تأیید باشد. scrypt فقط برای پسوردهای قدیمی Electron
// همچنان verify می‌شود.

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

/** هش جدید — pbkdf2 سازگار با وب */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
  return `pbkdf2:${PBKDF2_ITERATIONS}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

/** @deprecated نام قدیمی — همان hashPassword (دیگر scrypt نمی‌نویسد) */
function hashPasswordScrypt(password) {
  return hashPassword(password);
}

/**
 * تأیید پسورد در برابر مقدار ذخیره‌شده.
 * فقط scrypt و pbkdf2 پذیرفته می‌شوند — متن سادهٔ legacy دیگر مجاز نیست
 * (مهاجرت یک‌باره در verifyCredentials انجام می‌شود).
 */
function verifyPassword(password, stored) {
  if (!stored) return false;

  if (stored.startsWith('scrypt:')) {
    const [, saltB64, hashB64] = stored.split(':');
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(derived, expected);
  }

  if (stored.startsWith('pbkdf2:')) {
    // فرمت: pbkdf2:<iterations>:<saltB64>:<hashB64> (سازگار با src/lib/passwordAuth.ts)
    const [, iterStr, saltB64, hashB64] = stored.split(':');
    const iterations = parseInt(iterStr, 10);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const derived = crypto.pbkdf2Sync(password, salt, iterations, expected.length, 'sha256');
    return crypto.timingSafeEqual(derived, expected);
  }

  return false;
}

/** آیا مقدار ذخیره‌شده هنوز پسورد متن‌سادهٔ legacy است؟ */
function isLegacyPlaintextPassword(stored) {
  return !!(stored && !stored.startsWith('scrypt:') && !stored.startsWith('pbkdf2:'));
}

/**
 * مقایسهٔ زمان‌ثابت برای مهاجرت یک‌بارهٔ پسوردهای متن‌ساده.
 * فقط برای مهاجرت استفاده شود — نه به‌عنوان مسیر پایدار احراز هویت.
 */
function verifyLegacyPlaintextPassword(password, stored) {
  if (!isLegacyPlaintextPassword(stored)) return false;
  const a = crypto.createHash('sha256').update(password).digest();
  const b = crypto.createHash('sha256').update(stored).digest();
  return crypto.timingSafeEqual(a, b);
}

const MIN_PASSWORD_LENGTH = 8;

// =============== Settings Sanitization ===============

function sanitizeSettings(settings) {
  const result = { ...settings };
  // هش پسورد و کلید API هرگز نباید به renderer برسند
  delete result.password;
  delete result.passwordHash;
  delete result.aiApiKey;
  result.hasPassword = !!(settings.passwordHash || settings.password);
  result.hasApiKey = !!(settings.aiApiKey);
  return result;
}

function sanitizeSettingsForBackup(settings) {
  const result = { ...settings };
  delete result.password;
  delete result.passwordHash;
  delete result.hasPassword;
  delete result.hasApiKey;
  delete result.aiApiKey;
  return result;
}

// =============== Backup Envelope ===============

function createBackupEnvelope(data) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    data,
  };
}

function parseBackupPayload(jsonData) {
  const parsed = JSON.parse(jsonData);
  const data = parsed && parsed.format === BACKUP_FORMAT ? parsed.data : parsed;
  if (!data || typeof data !== 'object') throw new Error('Invalid backup data');

  for (const key of ['clients', 'gallery', 'sessions', 'trichologists', 'analyses']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`Invalid backup field: ${key}`);
    }
  }
  if (data.trainingSamples !== undefined && !Array.isArray(data.trainingSamples)) {
    throw new Error('Invalid backup field: trainingSamples');
  }
  if (data.questionnaireRevisions !== undefined && !Array.isArray(data.questionnaireRevisions)) {
    throw new Error('Invalid backup field: questionnaireRevisions');
  }
  // موج ۲: ردپای حسابرسی و بلوک کلید تصاویر (در صورت وجود) باید ساختاریاعتبار داشته باشند
  if (data.auditLog !== undefined && !Array.isArray(data.auditLog)) {
    throw new Error('Invalid backup field: auditLog');
  }
  if (data.mediaEncryption !== undefined) {
    const m = data.mediaEncryption;
    if (m === null || typeof m !== 'object' || typeof m.key !== 'string') {
      throw new Error('Invalid backup field: mediaEncryption');
    }
  }
  return data;
}

function parseStoredJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

// =============== Data URL / Media ===============

// پسوندهایی که mime آن‌ها با نامشان فرق دارد
const SUBTYPE_TO_EXT = { jpeg: 'jpg', quicktime: 'mov', 'svg+xml': 'svg', 'x-matroska': 'mkv', 'x-msvideo': 'avi' };
const EXT_TO_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mkv: 'video/x-matroska', avi: 'video/x-msvideo',
};

/**
 * پارس data URL تصویر یا ویدیو.
 * @param {string} dataUrl
 * @returns {{ base64: string, extension: string } | null}
 */
function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = /^data:(image|video)\/([\w.+-]+);base64,(.+)$/.exec(dataUrl);
  if (match) {
    const subtype = match[2].toLowerCase();
    const extension = SUBTYPE_TO_EXT[subtype] || (/^\w+$/.test(subtype) ? subtype : 'bin');
    return { base64: match[3], extension };
  }
  // data URL ناشناخته ولی base64 — بهترین تلاش
  if (dataUrl.includes('base64,')) {
    return { base64: dataUrl.split('base64,')[1], extension: 'bin' };
  }
  return null;
}

/** mime مناسب برای پسوند فایل (پیش‌فرض عکس jpeg) */
function mimeForExtension(ext) {
  return EXT_TO_MIME[(ext || '').toLowerCase()] || 'application/octet-stream';
}

// =============== safeStorage Encryption ===============

/**
 * ساخت زوج encrypt/decrypt بر اساس safeStorage الکترون.
 * مقادیر رمز‌شده با پیشوند 'encrypted:' ذخیره می‌شوند.
 */
function createValueCrypto(safeStorage) {
  return {
    encryptValue(value) {
      if (!value || !safeStorage || !safeStorage.isEncryptionAvailable()) return value;
      try {
        return 'encrypted:' + safeStorage.encryptString(value).toString('base64');
      } catch (error) {
        console.error('Encryption error:', error);
        return value;
      }
    },
    decryptValue(value) {
      if (!value || !value.startsWith('encrypted:') || !safeStorage) return value;
      try {
        return safeStorage.decryptString(Buffer.from(value.slice(10), 'base64'));
      } catch (error) {
        // شکست رمزگشایی (مثلاً انتقال فایل به دستگاه دیگر) نباید ciphertext را
        // به‌عنوان مقدار واقعی برگرداند — null یعنی «کلید در دسترس نیست».
        console.error('Decryption error:', error);
        return null;
      }
    },
  };
}

// =============== Analyses: حذف تصاویر سنگین از پاسخ لیست ===============

/**
 * هر رکورد تحلیل می‌تواند یک تصویر annotate‌شده به‌صورت base64 داخل
 * aiResults/offlineResults داشته باشد (چند صد کیلوبایت تا چند مگابایت).
 * لیست کامل تحلیل‌ها در استور نگه داشته می‌شود، پس با رشد داده‌های کلینیک
 * هر بار fetchAnalyses چند صد مگابایت از دیسک می‌خواند، از IPC رد می‌کند
 * (serialize/deserialize کامل) و در حافظهٔ renderer نگه می‌دارد.
 *
 * راه‌حل همان الگویی است که برای گالری استفاده شده: در لیست فقط یک پرچم
 * بولی می‌فرستیم و خودِ تصویر با getAnalysisAnnotatedImage به‌صورت
 * on-demand خوانده می‌شود.
 *
 * @param {object|null|undefined} result — aiResults یا offlineResults
 * @returns {object|null|undefined}
 */
function stripAnnotatedImage(result) {
  if (!result || typeof result !== 'object') return result;
  if (!result.annotatedImageBase64) return result;
  const { annotatedImageBase64: _omitted, ...rest } = result;
  // پرچم تا UI بداند تصویر وجود دارد بدون اینکه محتوایش را بگیرد
  return { ...rest, hasAnnotatedImage: true };
}

/** نسخهٔ سبک یک ردیف تحلیل برای پاسخ‌های لیستی */
function toListAnalysisRow(analysis) {
  if (!analysis || typeof analysis !== 'object') return analysis;
  return {
    ...analysis,
    aiResults: stripAnnotatedImage(analysis.aiResults),
    offlineResults: stripAnnotatedImage(analysis.offlineResults),
  };
}

module.exports = {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  stripAnnotatedImage,
  toListAnalysisRow,
  MIN_PASSWORD_LENGTH,
  SYSTEM_TRAINING_POOL_CLIENT_ID,
  buildSystemTrainingPoolClientRecord,
  ensureSystemTrainingPoolClientSqlite,
  hashPassword,
  hashPasswordScrypt,
  verifyPassword,
  isLegacyPlaintextPassword,
  verifyLegacyPlaintextPassword,
  sanitizeSettings,
  sanitizeSettingsForBackup,
  createBackupEnvelope,
  parseBackupPayload,
  parseStoredJson,
  parseDataUrl,
  mimeForExtension,
  createValueCrypto,
};
