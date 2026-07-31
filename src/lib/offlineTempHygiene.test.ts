import { describe, expect, it, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
// @ts-expect-error offline-handlers has no type declaration file
import * as offlineHandlers from '../../electron/offline-handlers.cjs';

/**
 * فاز ۱ / AUD-8 — بهداشت فایل موقت تحلیل آفلاین
 * -----------------------------------------------------------------------
 * چرا این تست وجود دارد: برای تحلیل آفلاین، تصویر بالینی باید به‌صورت فایل روی
 * دیسک به پروسهٔ پایتون داده شود. پیش از این اصلاح، آن فایل در %TEMP% عمومی
 * سیستم‌عامل نوشته می‌شد و حذفش فقط در بلوک `finally` بود — یعنی هر کرش یا
 * kill شدن پروسه، عکس پوست سر بیمار را برای همیشه روی دیسک جا می‌گذاشت.
 *
 * این تست‌ها هر سه لایهٔ دفاعی را می‌سنجند و مهم‌تر از آن، **آزمون منفی** دارند:
 * ثابت می‌کنند مسیر واقعاً دیگر `os.tmpdir()` نیست.
 */

const {
  setAnalyzeTempRoot,
  getAnalyzeTmpDir,
  cleanupStaleAnalyzeTemp,
  cleanupLiveTempFiles,
  writeTempImage,
  removeTempImage,
  TEMP_DIR_NAME,
  TEMP_FILE_PREFIX,
} = offlineHandlers as {
  setAnalyzeTempRoot: (p: string | null) => void;
  getAnalyzeTmpDir: () => string;
  cleanupStaleAnalyzeTemp: (p?: string) => { removed: number; failed: number };
  cleanupLiveTempFiles: () => void;
  writeTempImage: (b64: string) => string;
  removeTempImage: (p: string) => void;
  TEMP_DIR_NAME: string;
  TEMP_FILE_PREFIX: string;
};

/** یک ریشهٔ userData ساختگی و ایزوله برای هر تست */
function makeFakeUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-userdata-test-'));
}

/** data URL کوچک ولی معتبر (۱ پیکسل) */
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const createdRoots: string[] = [];

afterEach(() => {
  cleanupLiveTempFiles();
  setAnalyzeTempRoot(null);
  for (const root of createdRoots.splice(0)) {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('فاز ۱ / AUD-8 — تصویر موقت تحلیل آفلاین از %TEMP% عمومی خارج شد', () => {
  it('فایل موقت داخل userData/analyze-tmp نوشته می‌شود، نه در os.tmpdir()', () => {
    const root = makeFakeUserData();
    createdRoots.push(root);
    setAnalyzeTempRoot(root);

    const tempPath = writeTempImage(TINY_PNG);

    // آزمون مثبت: مسیر دقیقاً زیر پوشهٔ اختصاصی داخل userData است
    const expectedDir = path.join(root, TEMP_DIR_NAME);
    expect(path.dirname(tempPath)).toBe(expectedDir);
    expect(path.basename(tempPath).startsWith(TEMP_FILE_PREFIX)).toBe(true);
    expect(fs.existsSync(tempPath)).toBe(true);

    // آزمون منفی (حیاتی): مسیر نباید مستقیماً در پوشهٔ موقت عمومی سیستم باشد.
    // اگر کسی روزی این را به os.tmpdir() برگرداند، همین‌جا قرمز می‌شود.
    expect(path.dirname(tempPath)).not.toBe(os.tmpdir());

    removeTempImage(tempPath);
    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('محتوای نوشته‌شده همان بایت‌های تصویر ورودی است (رمزنگاری نمایشی نشده)', () => {
    const root = makeFakeUserData();
    createdRoots.push(root);
    setAnalyzeTempRoot(root);

    const tempPath = writeTempImage(TINY_PNG);
    const written = fs.readFileSync(tempPath);
    const expected = Buffer.from(TINY_PNG.split('base64,')[1], 'base64');

    // تصمیم مهندسی عمدی: فایل رمز نمی‌شود چون پروسهٔ پایتون باید بخواندش؛
    // محافظت از «عمر کوتاه + پاک‌سازی تضمینی» می‌آید نه از رمزی که کلیدش کنارش است.
    expect(written.equals(expected)).toBe(true);

    removeTempImage(tempPath);
  });

  it('لایهٔ دوم: پاک‌سازی استارت‌آپ بقایای جلسهٔ کرش‌کردهٔ قبلی را حذف می‌کند', () => {
    const root = makeFakeUserData();
    createdRoots.push(root);
    setAnalyzeTempRoot(root);

    // شبیه‌سازی کرش: دو فایل جامانده + یک فایل نامرتبط که نباید لمس شود
    const dir = getAnalyzeTmpDir();
    const stale1 = path.join(dir, `${TEMP_FILE_PREFIX}stale-one.jpg`);
    const stale2 = path.join(dir, `${TEMP_FILE_PREFIX}stale-two.png`);
    const unrelated = path.join(dir, 'keep-me.txt');
    fs.writeFileSync(stale1, 'x');
    fs.writeFileSync(stale2, 'y');
    fs.writeFileSync(unrelated, 'z');

    const report = cleanupStaleAnalyzeTemp(root);

    expect(report.removed).toBe(2);
    expect(fs.existsSync(stale1)).toBe(false);
    expect(fs.existsSync(stale2)).toBe(false);
    // فایل نامرتبط نباید قربانی پاک‌سازی شود
    expect(fs.existsSync(unrelated)).toBe(true);
  });

  it('لایهٔ سوم: پاک‌سازی هنگام خروج، فایل بازماندهٔ در حال استفاده را حذف می‌کند', () => {
    const root = makeFakeUserData();
    createdRoots.push(root);
    setAnalyzeTempRoot(root);

    // فایل ساخته می‌شود ولی عمداً removeTempImage صدا زده نمی‌شود —
    // یعنی سناریوی «پروسه وسط تحلیل خاتمه یافت».
    const tempPath = writeTempImage(TINY_PNG);
    expect(fs.existsSync(tempPath)).toBe(true);

    cleanupLiveTempFiles();

    expect(fs.existsSync(tempPath)).toBe(false);
  });

  it('پاک‌سازی روی پوشهٔ ناموجود امن است و خطا نمی‌دهد', () => {
    const root = makeFakeUserData();
    createdRoots.push(root);
    // پوشهٔ analyze-tmp هنوز ساخته نشده است
    const report = cleanupStaleAnalyzeTemp(root);
    expect(report).toEqual({ removed: 0, failed: 0 });
  });
});
