/**
 * sqlite-driver.cjs — بارگذاری متمرکز درایور SQLite (موج ۲ / C1)
 * -----------------------------------------------------------------------
 * اولویت با better-sqlite3-multiple-ciphers است (همان API پایدار
 * better-sqlite3 + پشتیبانی SQLCipher برای PRAGMA key). اگر به هر دلیلی
 * (مثلاً عدم rebuild برای ABI الکترون) لود نشد، better-sqlite3 ساده به‌عنوان
 * fallback استفاده می‌شود تا اپ بالا بیاید — در این حالت رمزنگاری دیتابیس
 * غیرفعال گزارش می‌شود (cipherCapable=false) و رفتار مثل قبل از موج ۲ است.
 *
 * این جداسازی باعث می‌شود main.cjs و اسکریپت‌های تست هر دو از یک نقطهٔ
 * تصمیم‌گیری درایور استفاده کنند.
 */

/**
 * @returns {{ Database: any, driverName: string, cipherCapable: boolean, loadError?: Error }}
 */
function loadSqliteDriver() {
  try {
    const Database = require('better-sqlite3-multiple-ciphers');
    return { Database, driverName: 'better-sqlite3-multiple-ciphers', cipherCapable: true };
  } catch (multiCipherError) {
    try {
      const Database = require('better-sqlite3');
      return {
        Database,
        driverName: 'better-sqlite3',
        cipherCapable: false,
        loadError: multiCipherError,
      };
    } catch (plainError) {
      return {
        Database: null,
        driverName: 'none',
        cipherCapable: false,
        loadError: plainError,
      };
    }
  }
}

module.exports = { loadSqliteDriver };
