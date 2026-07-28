#!/usr/bin/env node
/**
 * test-build-assets.cjs — نگهبان دارایی‌های بستهٔ نصبی
 * -----------------------------------------------------------------------
 * چرا این تست وجود دارد؟
 *   ریشهٔ مشکل فاز A این نبود که کسی فایل‌ها را نساخت — ساخته شده بودند، ولی
 *   روی ماشین شخصی و بدون اینکه چیزی همگامی `electron-builder.json` با
 *   واقعیتِ روی دیسک را بررسی کند. هر ارجاع جدید در آن فایل (مثلاً افزودن
 *   `uninstallerSidebar` یا آیکون یک پلتفرم تازه) دوباره همان تله را می‌سازد.
 *
 * این تست **از روی خودِ `electron-builder.json` می‌خواند** — نه از یک فهرست
 * ثابت. پس اگر فردا ارجاع تازه‌ای اضافه شود و دارایی‌اش تولید نشود، همین‌جا
 * قرمز می‌شود، نه در لحظهٔ انتشار.
 *
 * علاوه بر وجود فایل، **سلامت ساختاری** هم بررسی می‌شود: یک فایل صفربایتی یا
 * یک PNG که پسوندش را به .icns عوض کرده‌اند هم «وجود دارد» ولی بیلد را
 * می‌شکند یا بدتر، بی‌سروصدا آیکون پیش‌فرض Electron را جا می‌گذارد.
 *
 * اجرا: `node scripts/test-build-assets.cjs` (بخشی از `pnpm verify`)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'electron-builder.json');

let failures = 0;
let checks = 0;

function fail(message) {
  failures++;
  console.error(`  ✗ ${message}`);
}

function pass(message) {
  checks++;
  console.log(`  ✓ ${message}`);
}

/** استخراج همهٔ مسیرهای ارجاع‌شده به پوشهٔ build/ از پیکربندی، به‌صورت بازگشتی */
function collectBuildReferences(node, out = new Map(), keyPath = '') {
  if (typeof node === 'string') {
    if (node.startsWith('build/')) {
      if (!out.has(node)) out.set(node, []);
      out.get(node).push(keyPath);
    }
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectBuildReferences(v, out, `${keyPath}[${i}]`));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      collectBuildReferences(v, out, keyPath ? `${keyPath}.${k}` : k);
    }
  }
  return out;
}

function checkIco(filePath, rel) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 6 || buf.readUInt16LE(2) !== 1) {
    fail(`${rel}: فایل ICO معتبر نیست`);
    return;
  }
  const count = buf.readUInt16LE(4);
  let has256 = false;
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const w = buf[o] === 0 ? 256 : buf[o];
    const len = buf.readUInt32LE(o + 8);
    const off = buf.readUInt32LE(o + 12);
    if (off + len > buf.length) {
      fail(`${rel}: ورودی ${i} خارج از محدودهٔ فایل است (فایل ناقص)`);
      return;
    }
    if (w === 256) has256 = true;
  }
  // الزام صریح electron-builder برای هدف ویندوز
  if (!has256) {
    fail(`${rel}: تصویر ۲۵۶×۲۵۶ ندارد — electron-builder بیلد ویندوز را رد می‌کند`);
    return;
  }
  pass(`${rel}: ICO معتبر با ${count} اندازه، شامل ۲۵۶×۲۵۶`);
}

function checkIcns(filePath, rel) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'icns') {
    // تلهٔ کلاسیک: ImageMagick در برخی نسخه‌ها بی‌صدا PNG می‌سازد
    const looksPng = buf.subarray(1, 4).toString('ascii') === 'PNG';
    fail(`${rel}: کانتینر ICNS معتبر نیست${looksPng ? ' (این یک PNG با پسوند .icns است)' : ''}`);
    return;
  }
  if (buf.readUInt32BE(4) !== buf.length) {
    fail(`${rel}: طول اعلام‌شده در هدر با اندازهٔ واقعی فایل نمی‌خواند`);
    return;
  }
  let offset = 8;
  let chunks = 0;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset + 4);
    if (len < 8 || offset + len > buf.length) {
      fail(`${rel}: چانک خراب در offset ${offset}`);
      return;
    }
    offset += len;
    chunks++;
  }
  pass(`${rel}: کانتینر ICNS معتبر با ${chunks} چانک`);
}

function checkBmp(filePath, rel, expected) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('ascii', 0, 2) !== 'BM') {
    fail(`${rel}: فایل BMP معتبر نیست`);
    return;
  }
  const width = buf.readInt32LE(18);
  const height = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  const headerSize = buf.readUInt32LE(14);

  // NSIS فقط BMP3 بدون فشرده‌سازی و بدون آلفا را درست نمایش می‌دهد
  if (headerSize !== 40) return fail(`${rel}: باید BITMAPINFOHEADER (۴۰ بایت) باشد، دریافت شد ${headerSize}`);
  if (bpp !== 24) return fail(`${rel}: NSIS به ۲۴ بیت نیاز دارد، دریافت شد ${bpp}`);
  if (compression !== 0) return fail(`${rel}: نباید فشرده‌سازی داشته باشد`);
  if (expected && (width !== expected.width || height !== expected.height)) {
    return fail(`${rel}: ابعاد باید دقیقاً ${expected.width}×${expected.height} باشد، دریافت شد ${width}×${height}`);
  }
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  if (buf.length !== 54 + rowSize * height) {
    return fail(`${rel}: اندازهٔ دادهٔ پیکسل با ابعاد اعلام‌شده نمی‌خواند`);
  }
  pass(`${rel}: BMP3 معتبر ${width}×${height} با ۲۴ بیت`);
}

function checkPngDir(dirPath, rel) {
  const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.png'));
  if (files.length === 0) {
    fail(`${rel}: پوشهٔ آیکون خالی است`);
    return;
  }
  for (const file of files) {
    const buf = fs.readFileSync(path.join(dirPath, file));
    if (buf.subarray(1, 4).toString('ascii') !== 'PNG') {
      fail(`${rel}/${file}: PNG معتبر نیست`);
      return;
    }
    // نام فایل برای لینوکس معنادار است: electron-builder اندازه را از آن می‌خواند
    const match = /^(\d+)x(\d+)\.png$/.exec(file);
    if (!match) {
      fail(`${rel}/${file}: نام فایل باید الگوی <size>x<size>.png داشته باشد`);
      return;
    }
    const declared = parseInt(match[1], 10);
    const actual = buf.readUInt32BE(16);
    if (declared !== actual) {
      fail(`${rel}/${file}: نام فایل ${declared} می‌گوید ولی تصویر ${actual} پیکسل است`);
      return;
    }
  }
  pass(`${rel}: ${files.length} آیکون PNG معتبر با نام‌گذاری درست`);
}

function main() {
  console.log('بررسی دارایی‌های بستهٔ نصبی (build/)\n');

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const references = collectBuildReferences(config);

  // مرحلهٔ ۱ — دارایی‌ها باید قابل بازتولید باشند (نه فقط روی ماشین یک نفر)
  console.log('۱) بازتولید از روی public/icon.png:');
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'generate-build-assets.cjs')], {
      stdio: 'pipe',
      cwd: ROOT,
    });
    pass('اسکریپت تولید بدون خطا اجرا شد');
  } catch (error) {
    fail(`اسکریپت تولید شکست خورد: ${error.message}`);
    console.error(`\n❌ ${failures} خطا. دارایی‌ها قابل بازتولید نیستند.`);
    process.exit(1);
  }

  // مرحلهٔ ۲ — هر ارجاع در پیکربندی باید روی دیسک وجود داشته باشد
  console.log('\n۲) همگامی electron-builder.json با فایل‌های موجود:');
  if (references.size === 0) {
    fail('هیچ ارجاعی به build/ در پیکربندی پیدا نشد — آیا مسیرها عوض شده‌اند؟');
  }
  for (const [rel, keys] of references) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      fail(`${rel} وجود ندارد (ارجاع‌شده از: ${keys.join('، ')})`);
      continue;
    }
    pass(`${rel} موجود است (${keys.length} ارجاع)`);
  }

  // مرحلهٔ ۳ — سلامت ساختاری، نه صرفاً وجود فایل
  console.log('\n۳) اعتبارسنجی ساختار فایل‌ها:');
  const NSIS_SIZES = {
    'build/installerHeader.bmp': { width: 150, height: 57 },
    'build/installerSidebar.bmp': { width: 164, height: 314 },
  };

  for (const rel of references.keys()) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;

    if (fs.statSync(full).isDirectory()) {
      checkPngDir(full, rel);
    } else if (rel.endsWith('.ico')) {
      checkIco(full, rel);
    } else if (rel.endsWith('.icns')) {
      checkIcns(full, rel);
    } else if (rel.endsWith('.bmp')) {
      checkBmp(full, rel, NSIS_SIZES[rel]);
    } else if (rel.endsWith('.nsh')) {
      const content = fs.readFileSync(full, 'utf8');
      if (!content.includes('!macro customInstall') || !content.includes('!macro customUnInstall')) {
        fail(`${rel}: ماکروهای customInstall/customUnInstall را ندارد`);
      } else {
        pass(`${rel}: ماکروهای NSIS موجودند`);
      }
    }
  }

  // مرحلهٔ ۴ — دام مخصوص این پروژه: دارایی تولیدشده نباید کامیت شده باشد
  // (وگرنه نسخهٔ کهنه در مخزن با نسخهٔ تولیدشده واگرا می‌شود)
  console.log('\n۴) بررسی .gitignore:');
  const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
  const generated = ['build/icon.ico', 'build/icon.icns', 'build/icons/'];
  for (const item of generated) {
    if (gitignore.includes(item)) {
      pass(`${item} در .gitignore هست (تولیدشده، نباید کامیت شود)`);
    } else {
      fail(`${item} در .gitignore نیست — خطر واگرایی نسخهٔ کامیت‌شده و تولیدشده`);
    }
  }

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks} بررسی موفق، ${failures} خطا.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
