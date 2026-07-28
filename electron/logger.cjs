/**
 * logger.cjs — لاگ فایل‌محور سبُک و بدون وابستگی خارجی (فاز ۰.۴)
 * ---------------------------------------------------------------------------
 * چرا electron-log نه: این پروژه در electron-builder.json فهرست فایل‌های
 * node_modules را صراحتاً whitelist کرده (فقط better-sqlite3). هر وابستگی
 * runtime جدید برای main یعنی مدیریت دستی کل closure ترانزیتیو آن در فهرست —
 * پرریسک‌تر از فایدهٔ آن.
 *
 * این ماژول دقیقاً همان نیاز واقعی را پوشش می‌دهد:
 *  - فایل لاگ چرخشی در <userData>/logs (فایل اصلی ۲MB + ۵ آرشیو)
 *  - فرمت زمان‌دار سازگار با console (util.format)
 *  - در محیط Node ساده (اسکریپت‌های تست مثل test-db-contract) هم بدون
 *    تغییر رفتار کار می‌کند: تا وقتی setLogDir نشده، فقط console می‌نویسد.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const MAX_BYTES = 2 * 1024 * 1024; // ۲ مگابایت برای هر فایل
const MAX_ARCHIVES = 5; // main.1.log ... main.5.log

let logDir = null;
let logFile = null;

/**
 * پوشهٔ لاگ را تنظیم می‌کند — معمولاً <userData>/logs.
 * تا وقتی صدا زده نشود، خروجی فقط روی console می‌رود (امن برای تست‌ها).
 * @param {string} dir
 */
function setLogDir(dir) {
  if (!dir || typeof dir !== 'string') return;
  logDir = dir;
  logFile = path.join(dir, 'main.log');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* پوشه ساخته نشد — بعداً هنگام نوشتن دوباره تلاش می‌شود */ }
}

/** چرخش آرشیو: main.5 حذف، بقیه یک‌پله جابه‌جا، main.log → main.1.log */
function rotateIfNeeded() {
  try {
    if (!logFile || !fs.existsSync(logFile)) return;
    const { size } = fs.statSync(logFile);
    if (size < MAX_BYTES) return;

    const oldest = path.join(logDir, `main.${MAX_ARCHIVES}.log`);
    if (fs.existsSync(oldest)) fs.rmSync(oldest, { force: true });
    for (let i = MAX_ARCHIVES - 1; i >= 1; i--) {
      const src = path.join(logDir, `main.${i}.log`);
      if (fs.existsSync(src)) {
        fs.renameSync(src, path.join(logDir, `main.${i + 1}.log`));
      }
    }
    fs.renameSync(logFile, path.join(logDir, 'main.1.log'));
  } catch { /* چرخش ناموفق نباید لاگ‌گیری را متوقف کند */ }
}

function write(level, args) {
  const line = `${new Date().toISOString()} [${level}] ${util.format(...args)}\n`;
  // همیشه روی console هم می‌نویسیم تا رفتار dev و خروجی ترمینال تست‌ها حفظ شود
  switch (level) {
    case 'ERROR': console.error(...args); break;
    case 'WARN': console.warn(...args); break;
    default: console.log(...args); break;
  }
  if (!logFile) return;
  try {
    rotateIfNeeded();
    fs.appendFileSync(logFile, line);
  } catch { /* نوشتن لاگ هرگز نباید برنامه را بشکند */ }
}

const logger = {
  debug: (...args) => write('DEBUG', args),
  info: (...args) => write('INFO', args),
  warn: (...args) => write('WARN', args),
  error: (...args) => write('ERROR', args),
  setLogDir,
};

module.exports = { logger };
