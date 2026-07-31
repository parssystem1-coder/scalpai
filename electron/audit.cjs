/**
 * audit.cjs — ردپای حسابرسی سبک (موج ۲ / C3.3)
 * -----------------------------------------------------------------------
 * «چه کسی چه زمانی داده را بیرون برد» — پیش‌نیاز بحث انطباق در کلینیک واقعی.
 * رویدادها در همان بک‌اند داده (جدول audit_log در SQLite / آرایهٔ auditLog
 * در فایل JSON) ذخیره می‌شوند تا با دیتابیس بکاپ/مهاجرت هم همراه شوند.
 *
 * نکتهٔ عمدی: detail هرگز نباید دادهٔ بالینی/کلید/پسورد داشته باشد — فقط
 * شناسه‌های فنی و پرچم‌ها (مثل provider سرویس AI، نه تصویر یا نام بیمار).
 */

const crypto = require('crypto');

/** فهرست بستهٔ رویدادها — هر رویداد جدید باید اینجا ثبت شود تا vocabulary پایدار بماند */
const AUDIT_EVENTS = {
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  DATA_EXPORT: 'data.export',
  DATA_IMPORT: 'data.import',
  CLIENT_DELETE: 'client.delete',
  AI_CLOUD_REQUEST: 'ai.cloud.request',
  DB_MIGRATION_ENCRYPTED: 'db.encryption.migrated',
  IMAGES_LEGACY_ENCRYPTED: 'images.legacy.encrypted',
};

/**
 * فاز ۲ / AUD-12 — سیاست نگهداری ردپای حسابرسی (منبع واحد حقیقت)
 * -----------------------------------------------------------------------
 * مشکلی که این بخش حل می‌کند: مسیر JSON از قبل سقف ۲۰۰۰ ردیف داشت، ولی جدول
 * SQLite هیچ محدودیتی نداشت و در کلینیک با چند سال استفاده بی‌نهایت رشد
 * می‌کرد. علاوه بر مسئلهٔ اندازه، «تا ابد نگه‌داشتن» خودش با اصل پایانگاری
 * دادهٔ GDPR ناسازگار است: لاگ باید به اندازهٔ نیاز پاسخ‌گویی بماند، نه بیشتر.
 *
 * سیاست دوگانه (هر دو باید رعایت شوند):
 *   ۱) سقف زمانی — رویدادهای قدیمی‌تر از ۲۴ ماه حذف می‌شوند.
 *   ۲) سقف تعدادی — حتی اگر همه در بازهٔ ۲۴ ماه باشند، فقط تازه‌ترین
 *      ۵۰٬۰۰۰ رویداد می‌ماند (سپر در برابر انفجار ناگهانی رویداد).
 *
 * چرا ۲۴ ماه: پوشش دو دورهٔ کامل ممیزی سالانه. اگر کلینیکی الزام قانونی
 * طولانی‌تری دارد، همین دو ثابت تنها نقطه‌ای است که باید عوض شود.
 */
const AUDIT_RETENTION_MONTHS = 24;
const AUDIT_MAX_ROWS = 50000;

/**
 * مرز زمانی حذف را برمی‌گرداند: هر رویداد قدیمی‌تر از این ISO timestamp باید برود.
 * @param {Date} [now] — برای تست‌پذیری قابل تزریق است
 * @returns {string} ISO 8601
 */
function auditRetentionCutoff(now = new Date()) {
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - AUDIT_RETENTION_MONTHS);
  return cutoff.toISOString();
}

/**
 * اعمال سیاست نگهداری روی یک آرایهٔ رویداد (مسیر JSON و نیز تست‌ها).
 * تابع خالص است: ورودی را تغییر نمی‌دهد و آرایهٔ جدید مرتب‌شده (نو → کهنه)
 * برمی‌گرداند.
 * @param {Array<{createdAt: string}>} entries
 * @param {Date} [now]
 * @returns {Array<{createdAt: string}>}
 */
function applyAuditRetention(entries, now = new Date()) {
  if (!Array.isArray(entries)) return [];
  const cutoff = auditRetentionCutoff(now);
  return entries
    .filter((e) => e && typeof e.createdAt === 'string' && e.createdAt >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, AUDIT_MAX_ROWS);
}

const noop = () => {};

/**
 * ساخت مقصود ثبت رویداد — هر entry را می‌سازد و به sink می‌سپارد. خرابی sink
 * عملیات اصلی را از کار نمی‌اندازد.
 * @param {(entry: {id:string,event:string,actor:string,detail:string|null,createdAt:string}) => void} sinkFn
 */
function createAuditRecorder(sinkFn) {
  const sink = typeof sinkFn === 'function' ? sinkFn : noop;
  return function record(event, actor = 'local-user', detail = null) {
    try {
      let detailText = null;
      if (detail != null) {
        detailText = typeof detail === 'string' ? detail : JSON.stringify(detail);
        if (detailText.length > 500) detailText = detailText.slice(0, 500) + '…';
      }
      sink({
        id: crypto.randomUUID(),
        event: String(event),
        actor: actor || 'local-user',
        detail: detailText,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.warn('[audit] failed to record event:', event, error && error.message);
    }
  };
}

// --- سطح سراسری برای رویدادهای main-process (ورود/خروج/AI ابری) ---
// در محصول فقط یک بک‌اند فعال است و sink سراسری همان را دنبال می‌کند. داخل
// هندلرها (که ممکن است در تست چند نمونه هم‌زمان داشته باشند) عمداً از
// recorder محلی استفاده می‌شود تا sink جهانی بالقوهٔ اشتراکی cross-talk نسازد.
let globalSink = noop;

/** @param {(entry: object) => void} fn */
function setAuditSink(fn) {
  globalSink = typeof fn === 'function' ? fn : noop;
}

function recordAudit(event, actor = 'local-user', detail = null) {
  createAuditRecorder(globalSink)(event, actor, detail);
}

module.exports = {
  AUDIT_EVENTS,
  setAuditSink,
  recordAudit,
  createAuditRecorder,
  // فاز ۲ / AUD-12 — سیاست نگهداری
  AUDIT_RETENTION_MONTHS,
  AUDIT_MAX_ROWS,
  auditRetentionCutoff,
  applyAuditRetention,
};
