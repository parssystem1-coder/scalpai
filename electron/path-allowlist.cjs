/**
 * path-allowlist.cjs — محدود کردن دسترسی IPC فایل‌سیستم
 * -----------------------------------------------------------------------
 * فقط مسیرهایی که از دیالوگ‌های خودِ اپ برگشته‌اند (یا زیرمجموعهٔ
 * پوشه‌های انتخاب‌شده) مجاز به خواندن/نوشتن از طریق fs:* هستند.
 */

const path = require('path');
const fs = require('fs');

/** @type {Set<string>} فایل‌های تکی مجاز (مثلاً نتیجهٔ Save Dialog) */
const allowedFiles = new Set();
/** @type {Set<string>} پوشه‌های مجاز (مثلاً نتیجهٔ Select Directory) */
const allowedDirs = new Set();

function normalizePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid path');
  }
  if (filePath.includes('\0')) {
    throw new Error('Invalid path');
  }
  const resolved = path.resolve(filePath);
  // رد مسیرهای نسبی که به بیرون از ریشه می‌روند — resolve قبلاً انجام شده
  return resolved;
}

function allowFile(filePath) {
  allowedFiles.add(normalizePath(filePath));
}

function allowDirectory(dirPath) {
  allowedDirs.add(normalizePath(dirPath));
}

/**
 * آیا مسیر مجاز است؟
 * - دقیقاً در لیست فایل‌های مجاز باشد، یا
 * - زیر یک پوشهٔ مجاز باشد (برای بکاپ‌های تکراری در همان پوشه)
 */
function isPathAllowed(filePath) {
  const resolved = normalizePath(filePath);
  if (allowedFiles.has(resolved)) return true;
  for (const dir of allowedDirs) {
    const rel = path.relative(dir, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return true;
    }
    // خودِ پوشه
    if (rel === '') return true;
  }
  return false;
}

function assertPathAllowed(filePath) {
  const resolved = normalizePath(filePath);
  if (!isPathAllowed(resolved)) {
    throw new Error('Path not allowed. Select a folder or file through the app dialogs first.');
  }
  return resolved;
}

/**
 * اطمینان از اینکه مسیر نهایی داخل همان پوشهٔ والدِ مورد انتظار می‌ماند
 * (مثلاً نام فایل از renderer نتواند با ../ بیرون بزند).
 */
function joinUnderAllowedDir(dirPath, fileName) {
  const dir = normalizePath(dirPath);
  if (!allowedDirs.has(dir) && !isPathAllowed(dir)) {
    throw new Error('Directory not allowed');
  }
  const base = path.basename(fileName || 'backup.json');
  const full = path.join(dir, base);
  return assertPathAllowed(full);
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  allowFile,
  allowDirectory,
  isPathAllowed,
  assertPathAllowed,
  joinUnderAllowedDir,
  ensureParentDir,
  normalizePath,
};
