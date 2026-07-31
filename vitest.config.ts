/**
 * vitest.config.ts — پیکربندی تست (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * چرا فایل جداست و داخل `vite.config.ts` نیست: نسخهٔ vitest این پروژه (۲)
 * تایپ‌های vite 5 را همراه می‌آورد، در حالی که خود پروژه روی vite 6 است.
 * گذاشتن بخش `test` داخل پیکربندی اصلی باعث تداخل نوع در `tsc` می‌شد.
 * فایل جدا، مسیر استاندارد و بدون تداخل است و vitest خودش
 * `vite.config.ts` را برای alias و پلاگین‌ها ادغام می‌کند.
 *
 * دو محیط اجرا:
 *   - پیش‌فرض `node` — تست‌های منطق خالص (`src/lib/*.test.ts`) که مستقیم
 *     ماژول‌های Node مثل `fs` و حتی `better-sqlite3` را صدا می‌زنند و در
 *     jsdom می‌شکنند.
 *   - `jsdom` فقط برای `*.test.tsx` — تست‌های دود رابط کاربری که به DOM
 *     نیاز دارند.
 *
 * این تفکیک عمدی است: به‌جای عوض کردن محیط همه (که ۲۷۳ تست موجود را به خطر
 * می‌انداخت)، فقط فایل‌های جدید به محیط جدید می‌روند.
 */
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // alias ها باید این‌جا تکرار شوند: چون این فایل مستقل است، vitest دیگر
  // `resolve` فایل اصلی را برنمی‌دارد و import هایی مثل `@shared/...` می‌شکنند.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
  },
});
