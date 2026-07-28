/**
 * backup-package.cjs — بستهٔ پشتیبان پوشه‌ای (نسخهٔ ۳، فاز ۰.۵)
 * ---------------------------------------------------------------------------
 * چرا این فرمت جایگزین «یک فایل JSON غول‌پیکر» شد:
 * بکاپ قدیمی همهٔ عکس‌ها و ویدیوها را base64 می‌کرد، همه را در یک رشتهٔ JSON
 * یک‌باره در حافظهٔ main می‌ساخت و `JSON.stringify` می‌زد. با چند صد عکس
 * واقعی کلینیک (هرکدام چند مگابایت) رشتهٔ چندگیگابایتی → کرش قطعی بود.
 *
 * فرمت جدید (v3):
 *   scalpai-backup-<YYYY-MM-DD-HHMM>/
 *     data.json      فرادادهٔ سبک (کلاینت‌ها، جلسات، تحلیل‌ها …) — بدون رسانه
 *     media/         فایل‌های خام رسانه (کپی استریمی از دیسک به دیسک)
 *
 * مزایا: حافظهٔ ثابت در حین export/import، قابل باز شدن با هر ابزار فایل،
 * و برای واحد IT کلینیک قابل فهم. ویدیوها هم از همان مسیر استریم می‌شوند.
 *
 * سازگاری عقب‌رو: فایل‌های JSON تک‌تکهٔ قدیمی (v2) همچنان از همان مسیر
 * importData خوانده می‌شوند؛ این ماژول فقط v3 می‌خواند/می‌نویسد.
 *
 * این فایل عمداً به Electron وابستگی ندارد تا در Node ساده تست شود.
 */

const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const BACKUP_FORMAT = 'scalpai-backup';
const BACKUP_PACKAGE_VERSION = 3;
const MEDIA_DIR_NAME = 'media';

/** نام پوشهٔ بکاپ با برچسب زمانی محلی (قابل مرتب‌سازی متنی) */
function packageDirName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `scalpai-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * کپی استریمی فایل — مصرف حافظهٔ O(1) مستقل از اندازهٔ فایل (ویدیوهای بزرگ).
 * @param {string} srcPath
 * @param {string} destPath
 */
async function copyFileStreaming(srcPath, destPath) {
  await pipeline(
    fs.createReadStream(srcPath),
    fs.createWriteStream(destPath),
  );
}

/** آیا مسیر نسبی یک ارجاع امن داخل پوشهٔ media است؟ (بدون ../ یا مسیر مطلق) */
function isSafeMediaRef(rel) {
  if (!rel || typeof rel !== 'string') return false;
  if (rel.includes('\0')) return false;
  const normalized = path.normalize(rel);
  if (normalized.startsWith('..') || path.isAbsolute(normalized)) return false;
  return normalized.startsWith(MEDIA_DIR_NAME + path.sep);
}

/**
 * خواندن و اعتبارسنجی data.json یک بستهٔ پوشه‌ای (v3).
 * @param {string} dataJsonPath — مسیر کامل فایل data.json داخل بسته
 * @returns {{ data: object, packageDir: string, resolveMedia: (rel: string) => string }}
 */
function parseBackupPackage(dataJsonPath) {
  const packageDir = path.dirname(dataJsonPath);
  const parsed = JSON.parse(fs.readFileSync(dataJsonPath, 'utf-8'));

  if (
    !parsed || parsed.format !== BACKUP_FORMAT
    || parsed.version !== BACKUP_PACKAGE_VERSION
    || !parsed.data || typeof parsed.data !== 'object'
  ) {
    throw new Error(
      'فایل انتخاب‌شده بستهٔ پشتیبان نسخهٔ ۳ نیست. یا data.json داخل پوشهٔ بکاپ را انتخاب کنید، یا از فایل JSON قدیمی استفاده کنید.',
    );
  }

  const data = parsed.data;
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

  /**
   * تبدیل ارجاع media/… به مسیر مطلق داخل بسته — با دفاع در برابر خروج از بسته
   * (traversal در فایل بکاپ دستکاری‌شده).
   */
  function resolveMedia(rel) {
    if (!isSafeMediaRef(rel)) {
      throw new Error(`ارجاع رسانهٔ نامعتبر در بکاپ: ${rel}`);
    }
    const full = path.join(packageDir, path.normalize(rel));
    if (!fs.existsSync(full)) {
      throw new Error(`فایل رسانه‌ای که در بکاپ به آن ارجاع شده پیدا نشد: ${rel}`);
    }
    return full;
  }

  return { data, packageDir, resolveMedia };
}

/** ساخت پاکت v3 روی data آماده (برای data.json) */
function createPackageEnvelope(data) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_PACKAGE_VERSION,
    createdAt: new Date().toISOString(),
    data,
  };
}

/** پسوند واقعی یک data URL تصویری (پیش‌فرض png — خروجی canvas برنامه) */
function imageExtensionFromDataUrl(dataUrl) {
  const match = /^data:image\/([\w.+-]+);base64,/.exec(dataUrl || '');
  if (!match) return 'png';
  const subtype = match[1].toLowerCase();
  if (subtype === 'jpeg') return 'jpg';
  return /^\w+$/.test(subtype) ? subtype : 'png';
}

/**
 * استخراج تصویر annotate‌شده از aiResults/offlineResults به فایل جدا در media.
 * اگر چیزی برای استخراج نبود، همان ورودی برمی‌گردد.
 * @param {object|null} result
 * @param {string} fileBase — نام فایل بدون پسوند (بدون کاراکتر نامجاز)
 * @returns {{ result: object|null, mediaFileName: string|null, buffer: Buffer|null }}
 *   توجه: نوشتن buffer روی دیسک (در پوشهٔ media) بر عهدهٔ فراخواننده است تا
 *   این تابع sync و بدون اثر جانبی بماند و در Node ساده تست شود.
 */
function extractAnnotatedImage(result, fileBase) {
  if (!result || typeof result !== 'object') {
    return { result, mediaFileName: null, buffer: null };
  }
  const b64 = result.annotatedImageBase64;
  if (typeof b64 !== 'string' || !b64.includes('base64,')) {
    return { result, mediaFileName: null, buffer: null };
  }
  const [, dataPart] = b64.split('base64,');
  const buffer = Buffer.from(dataPart, 'base64');
  const fileName = `${fileBase}.${imageExtensionFromDataUrl(b64)}`;
  const { annotatedImageBase64, ...rest } = result;
  return {
    result: { ...rest, annotatedImageRef: `${MEDIA_DIR_NAME}/${fileName}` },
    mediaFileName: fileName,
    buffer,
  };
}

/** بازسازی data URL از فایل (برای بازیابی thumbnail/annotated به ستون TEXT) */
function readAsBase64DataUrl(filePath, mimeType = 'image/png') {
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

module.exports = {
  BACKUP_PACKAGE_VERSION,
  MEDIA_DIR_NAME,
  packageDirName,
  copyFileStreaming,
  parseBackupPackage,
  createPackageEnvelope,
  extractAnnotatedImage,
  readAsBase64DataUrl,
};
