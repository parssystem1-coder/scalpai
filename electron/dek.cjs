/**
 * dek.cjs — مدیریت کلید اصلی رمزنگاری دادهٔ در سکون (موج ۲ / تکمیل C1 و C2)
 * -----------------------------------------------------------------------
 * مدل کلید (دو لایه — همان توصیهٔ نقشه‌راه):
 *   ۱) DEK کلید اصلی تصادفی ۳۲بایتی است که در اولین اجرای رمزنگاری ساخته می‌شود.
 *   ۲) DEK هرگز plaintext روی دیسک نمی‌ماند؛ با safeStorage سیستم‌عامل
 *      (DPAPI روی ویندوز، Keychain روی مک) رمز و در userData/scalpai.key
 *      نگه داشته می‌شود. ربودن کل پوشهٔ userData بدون نشست کاربرِ سیستم‌عامل
 *      برای باز کردن دیتابیس/تصاویر کافی نیست.
 *
 * چرا safeStorage و نه پسورد اپ: پسورد فعلی فقط احراز هویت است و در جریان
 * بوت اپ در دسترس نیست؛ تبدیلش به کلید رمزنگاری بدون بازطراحی جریان ورود
 * خطرناک است (نقشه‌راه، تصمیم UX کلیدی C1).
 *
 * وقتی safeStorage در دسترس نباشد (مثلاً لینوکس بدون keyring): وضعیت
 * 'unavailable' گزارش و اپ همان‌طور که امروز کار می‌کند ادامه می‌دهد
 * (fail-open آگاهانه با لاگ) — کرش یا قفل شدن دیتای کلینیک بدترین حالت است.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { derivePurposeKey } = require('./file-crypto.cjs');

const KEY_FILENAME = 'scalpai.key';
const WRAP_PREFIX = 'safestorage-b64:';

/** @type {{ status: 'uninitialized'|'active'|'unavailable'|'unwrapped-error', dek: Buffer|null, purposes: Map<string, Buffer> }} */
const state = {
  status: 'uninitialized',
  dek: null,
  purposes: new Map(),
};

/**
 * راه‌اندازی مدل کلید. idempotent — فراخوانی مجدد state را از نو می‌سازد.
 * @param {object} safeStorage — ماژول safeStorage الکترون (یا mock سازگار در تست)
 * @param {string} userDataPath
 * @returns {{ status: string }}
 */
function initDek(safeStorage, userDataPath) {
  state.status = 'uninitialized';
  state.dek = null;
  state.purposes = new Map();

  if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()) {
    state.status = 'unavailable';
    return { status: state.status };
  }

  const keyPath = path.join(userDataPath, KEY_FILENAME);
  try {
    if (fs.existsSync(keyPath)) {
      const stored = fs.readFileSync(keyPath, 'utf-8');
      if (!stored.startsWith(WRAP_PREFIX)) throw new Error('unknown key wrapper format');
      const wrapped = Buffer.from(stored.slice(WRAP_PREFIX.length), 'base64');
      const hexDek = safeStorage.decryptString(wrapped);
      const dek = Buffer.from(hexDek, 'hex');
      if (dek.length !== 32) throw new Error('invalid DEK length after unwrap');
      state.dek = dek;
      state.status = 'active';
    } else {
      const dek = crypto.randomBytes(32);
      const wrapped = safeStorage.encryptString(dek.toString('hex'));
      fs.writeFileSync(keyPath, WRAP_PREFIX + wrapped.toString('base64'), { encoding: 'utf-8', mode: 0o600 });
      try { fs.chmodSync(keyPath, 0o600); } catch { /* ویندوز مجوز پوسیکس ندارد */ }
      state.dek = dek;
      state.status = 'active';
    }
  } catch (error) {
    // کلید موجود ولی قابل باز شدن نیست (مثلاً کاربر سیستم‌عامل عوض شده یا
    // فایل از دستگاه دیگری کپی شده). دادهٔ رمزشده بدون همین کلید باز نمی‌شود؛
    // اپ بالا می‌آید ولی لایهٔ رمز غیرفعال گزارش می‌شود تا کاربر متوجه شود.
    console.error('[dek] key unwrap failed:', error.message);
    state.dek = null;
    state.status = 'unwrapped-error';
  }
  return { status: state.status };
}

/** @returns {Buffer|null} DEK خام — فقط داخل main-process نگه داشته/مصرف شود */
function getDek() {
  return state.dek;
}

/**
 * کلید مشتق برای یک کاربرد (با کش) — جزئیات در file-crypto.derivePurposeKey
 * @param {string} purpose
 * @returns {Buffer|null}
 */
function getPurposeKey(purpose) {
  if (!state.dek) return null;
  let key = state.purposes.get(purpose);
  if (!key) {
    key = derivePurposeKey(state.dek, purpose);
    state.purposes.set(purpose, key);
  }
  return key;
}

/**
 * وضعیت لایهٔ رمز برای نمایش به کاربر (تنظیمات) و لاگ.
 * @returns {{ status: string, dbEncryptionPossible: boolean }}
 */
function getEncryptionStatus() {
  return {
    status: state.status,
    dbEncryptionPossible: state.status === 'active',
  };
}

/** فقط برای تست‌ها — state را به وضعیت اولیه برمی‌گرداند */
function _resetForTests() {
  state.status = 'uninitialized';
  state.dek = null;
  state.purposes = new Map();
}

module.exports = {
  initDek,
  getDek,
  getPurposeKey,
  getEncryptionStatus,
  _resetForTests,
  KEY_FILENAME,
};
