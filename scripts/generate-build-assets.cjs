#!/usr/bin/env node
/**
 * generate-build-assets.cjs — ساخت دارایی‌های بستهٔ نصبی از روی `public/icon.png`
 * -----------------------------------------------------------------------
 * مشکلی که این اسکریپت حل می‌کند (فاز A):
 *   `electron-builder.json` به شش دارایی در پوشهٔ `build/` ارجاع می‌داد که هیچ‌کدام
 *   در مخزن نبودند. چهار موردشان (installerIcon، دو بیت‌مپ، و installer.nsh)
 *   در electron-builder v26 خطای قطعی `InvalidConfigurationError` می‌دهند و
 *   بیلد را متوقف می‌کنند. یعنی روی هر کلون تازه، ساخت نسخهٔ نصبی ویندوز
 *   **غیرممکن** بود.
 *
 * چرا تولید به‌جای کامیت کردن باینری‌ها؟
 *   - تک‌منبع بودن: آیکون فقط در `public/icon.png` نگهداری می‌شود؛ تغییر برند
 *     یعنی عوض کردن یک فایل، نه شش فایل هم‌زمان که می‌توانند از هم واگرا شوند.
 *   - باینری‌ها diff قابل‌بازبینی ندارند و مخزن را سنگین می‌کنند.
 *   - در `prebuild` و در CI خودکار اجرا می‌شود، پس هرگز «یادمان نمی‌رود».
 *
 * بدون هیچ وابستگی خارجی: رمزگذاری PNG/ICO/ICNS/BMP دست‌ساز است تا نه به
 * ImageMagick (که روی همهٔ ماشین‌ها نیست) و نه به sharp (باینری native) نیاز باشد.
 *
 * اجرا: `node scripts/generate-build-assets.cjs [--force]`
 */

const fs = require('fs');
const path = require('path');
const { decodePng } = require('./lib/png.cjs');
const { buildIco, buildIcns, buildBmp24 } = require('./lib/icon-formats.cjs');
const { encodePng, resize } = require('./lib/png.cjs');

const ROOT = path.join(__dirname, '..');
const SOURCE_ICON = path.join(ROOT, 'public', 'icon.png');
const BUILD_DIR = path.join(ROOT, 'build');
const ICONS_DIR = path.join(BUILD_DIR, 'icons');

/** اندازه‌های استاندارد ویندوز؛ ۲۵۶ اجباری است (الزام electron-builder) */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** اندازه‌های آیکون لینوکس — electron-builder نام `<size>x<size>.png` می‌خواهد */
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

/** ابعاد تثبیت‌شدهٔ NSIS — تغییرشان باعث کشیدگی یا خرابی نمایش می‌شود */
const NSIS_HEADER = { width: 150, height: 57 };
const NSIS_SIDEBAR = { width: 164, height: 314 };
/** هم‌رنگ با `backgroundColor` پنجرهٔ اصلی در electron/main.cjs */
const BRAND_BACKGROUND = [10, 10, 10];

const force = process.argv.includes('--force');

function log(message) {
  console.log(`[build-assets] ${message}`);
}

/**
 * نوشتن فایل فقط در صورت نیاز.
 * اگر خروجی از منبع تازه‌تر باشد و `--force` داده نشده باشد، کار تکراری انجام نمی‌شود
 * (این اسکریپت در هر `prebuild` اجرا می‌شود و نباید بیلد را کند کند).
 */
function writeIfNeeded(filePath, buffer, sourceMtime) {
  if (!force && fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs >= sourceMtime && stat.size === buffer.length) {
      return false;
    }
  }
  fs.writeFileSync(filePath, buffer);
  return true;
}

function main() {
  if (!fs.existsSync(SOURCE_ICON)) {
    console.error(`[build-assets] خطا: فایل منبع پیدا نشد: ${SOURCE_ICON}`);
    console.error('[build-assets] یک PNG مربعی (ترجیحاً ۱۰۲۴×۱۰۲۴) در آن مسیر قرار دهید.');
    process.exit(1);
  }

  const sourceMtime = fs.statSync(SOURCE_ICON).mtimeMs;
  const image = decodePng(fs.readFileSync(SOURCE_ICON));
  log(`منبع: public/icon.png (${image.width}×${image.height})`);

  if (image.width !== image.height) {
    log(`⚠️  هشدار: تصویر منبع مربعی نیست (${image.width}×${image.height}) — آیکون‌ها ممکن است کشیده شوند.`);
  }
  if (image.width < 256) {
    log(`⚠️  هشدار: عرض منبع کمتر از ۲۵۶ است؛ electron-builder برای ویندوز حداقل ۲۵۶ می‌خواهد.`);
  }

  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(ICONS_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;
  const tally = (changed) => { if (changed) written++; else skipped++; };

  // ---- ویندوز: icon.ico چندسایزی ----
  tally(writeIfNeeded(path.join(BUILD_DIR, 'icon.ico'), buildIco(image, ICO_SIZES), sourceMtime));

  // ---- مک: icon.icns (کانتینر واقعی، نه PNG با پسوند عوض‌شده) ----
  tally(writeIfNeeded(path.join(BUILD_DIR, 'icon.icns'), buildIcns(image), sourceMtime));

  // ---- لینوکس: پوشهٔ آیکون‌ها ----
  for (const size of LINUX_SIZES) {
    const png = encodePng(resize(image, size, size));
    tally(writeIfNeeded(path.join(ICONS_DIR, `${size}x${size}.png`), png, sourceMtime));
  }

  // ---- بیت‌مپ‌های نصب‌کنندهٔ NSIS ----
  tally(writeIfNeeded(
    path.join(BUILD_DIR, 'installerHeader.bmp'),
    buildBmp24(image, NSIS_HEADER.width, NSIS_HEADER.height, BRAND_BACKGROUND),
    sourceMtime,
  ));
  tally(writeIfNeeded(
    path.join(BUILD_DIR, 'installerSidebar.bmp'),
    buildBmp24(image, NSIS_SIDEBAR.width, NSIS_SIDEBAR.height, BRAND_BACKGROUND),
    sourceMtime,
  ));

  // ---- اسکریپت سفارشی NSIS ----
  // این فایل تولیدشده نیست بلکه محتوای ثابت دارد؛ فقط اگر غایب باشد ساخته می‌شود
  // تا ویرایش‌های دستی کاربر بازنویسی نشوند.
  const nshPath = path.join(BUILD_DIR, 'installer.nsh');
  if (!fs.existsSync(nshPath)) {
    fs.writeFileSync(nshPath, NSIS_SCRIPT, 'utf8');
    written++;
  } else {
    skipped++;
  }

  log(`${written} فایل نوشته شد، ${skipped} فایل بدون تغییر بود.`);
  verify();
}

/** بررسی نهایی: آیا همهٔ چیزهایی که electron-builder.json می‌خواهد واقعاً هست؟ */
function verify() {
  const required = [
    'build/icon.ico',
    'build/icon.icns',
    'build/icons',
    'build/installerHeader.bmp',
    'build/installerSidebar.bmp',
    'build/installer.nsh',
  ];

  const missing = required.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  if (missing.length > 0) {
    console.error(`[build-assets] خطا: این دارایی‌ها ساخته نشدند: ${missing.join(', ')}`);
    process.exit(1);
  }

  // بررسی سلامت ساختاری، نه صرفاً وجود فایل — یک فایل صفربایتی هم «وجود دارد»
  const ico = fs.readFileSync(path.join(ROOT, 'build/icon.ico'));
  if (ico.readUInt16LE(2) !== 1) {
    console.error('[build-assets] خطا: build/icon.ico یک فایل ICO معتبر نیست.');
    process.exit(1);
  }

  const icns = fs.readFileSync(path.join(ROOT, 'build/icon.icns'));
  if (icns.toString('ascii', 0, 4) !== 'icns') {
    console.error('[build-assets] خطا: build/icon.icns کانتینر ICNS معتبر نیست.');
    process.exit(1);
  }

  for (const [rel, w, h] of [
    ['build/installerHeader.bmp', NSIS_HEADER.width, NSIS_HEADER.height],
    ['build/installerSidebar.bmp', NSIS_SIDEBAR.width, NSIS_SIDEBAR.height],
  ]) {
    const bmp = fs.readFileSync(path.join(ROOT, rel));
    if (bmp.toString('ascii', 0, 2) !== 'BM') {
      console.error(`[build-assets] خطا: ${rel} یک BMP معتبر نیست.`);
      process.exit(1);
    }
    const bw = bmp.readInt32LE(18);
    const bh = bmp.readInt32LE(22);
    const bpp = bmp.readUInt16LE(28);
    if (bw !== w || bh !== h || bpp !== 24) {
      console.error(`[build-assets] خطا: ابعاد ${rel} باید ${w}×${h} با ۲۴ بیت باشد (فعلی: ${bw}×${bh} با ${bpp} بیت).`);
      process.exit(1);
    }
  }

  log('✅ همهٔ دارایی‌های موردنیاز electron-builder موجود و معتبرند.');
}

const NSIS_SCRIPT = `; installer.nsh — سفارشی‌سازی نصب‌کنندهٔ ScalpAI
; -----------------------------------------------------------------------
; این فایل توسط scripts/generate-build-assets.cjs ساخته شد، ولی اگر از قبل
; وجود داشته باشد هرگز بازنویسی نمی‌شود — می‌توانید آزادانه ویرایشش کنید.
;
; نکتهٔ مهم دربارهٔ داده‌های کاربر: پوشهٔ %APPDATA%\\ScalpAI شامل دیتابیس
; بیماران و تصاویر است و هنگام حذف برنامه **عمداً پاک نمی‌شود**
; (deleteAppDataOnUninstall = false در electron-builder.json).
; حذف خودکار دادهٔ بالینی بدون تأیید صریح، غیرقابل‌قبول است.

!macro customInstall
  DetailPrint "در حال نصب ScalpAI..."
!macroend

!macro customUnInstall
  DetailPrint "در حال حذف ScalpAI..."
  DetailPrint "توجه: داده‌های شما در %APPDATA%\\ScalpAI حفظ می‌شود."
!macroend
`;

main();
