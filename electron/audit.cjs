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

module.exports = { AUDIT_EVENTS, setAuditSink, recordAudit, createAuditRecorder };
