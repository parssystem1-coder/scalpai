#!/usr/bin/env node
/**
 * check-shared-constants.cjs
 * -----------------------------------------------------------------------
 * سه فایل باید دربارهٔ ضرایب heuristic یک حرف بزنند:
 *
 *   shared/scalp-constants.json   ← منبع واحد حقیقت
 *   src/lib/heuristicConstants.ts ← موتور مرورگر (import می‌کند)
 *   python/analyze.py             ← موتور Python (در زمان اجرا می‌خواند)
 *
 * چرا این تست لازم است: انتخاب موتور (Python یا مرورگر) خودکار و بی‌صداست.
 * اگر ضرایب دو موتور از هم فاصله بگیرند، همان تصویر دو نتیجهٔ متفاوت می‌دهد
 * و کاربر هرگز متوجه نمی‌شود — که برای یک ابزار پزشکی خطرناک است.
 *
 * این اسکریپت بررسی می‌کند:
 *   ۱) analyze.py هیچ ضریبی را هاردکد نکرده باشد (باید از SCALE[...] بخواند)
 *   ۲) کلیدهای fallback داخل analyze.py با فایل مشترک یکی باشند
 *   ۳) heuristicConstants.ts واقعاً از فایل مشترک import کند نه مقدار ثابت
 *   ۴) فایل مشترک در extraResources باشد تا در نسخهٔ نصب‌شده هم برسد
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
// BOM: electron-builder.json با BOM ذخیره شده و JSON.parse را می‌شکند
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/^\uFEFF/, '');

let failures = 0;
function check(label, fn) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL ${label}\n     ${err.message}`);
  }
}

const shared = JSON.parse(read('shared/scalp-constants.json'));
const pySrc = read('python/analyze.py');
const tsSrc = read('src/lib/heuristicConstants.ts');

// ── ۱) فایل مشترک سالم است ──────────────────────────────────────────────
check('shared/scalp-constants.json ساختار درست دارد', () => {
  assert.ok(Number.isFinite(shared.GRID_SIZE), 'GRID_SIZE عدد نیست');
  assert.ok(shared.FEATURE_SCALE && typeof shared.FEATURE_SCALE === 'object', 'FEATURE_SCALE نیست');
  for (const [k, v] of Object.entries(shared.FEATURE_SCALE)) {
    assert.ok(Number.isFinite(v), `FEATURE_SCALE.${k} عدد نیست`);
  }
});

// ── ۲) TypeScript از فایل مشترک می‌خواند، نه مقدار هاردکد ───────────────
check('heuristicConstants.ts از فایل مشترک import می‌کند', () => {
  assert.ok(
    /from ['"]@shared\/scalp-constants\.json['"]/.test(tsSrc),
    'import از @shared/scalp-constants.json پیدا نشد',
  );
  assert.ok(
    /HEURISTIC_FEATURE_SCALE\s*=\s*sharedConstants\.FEATURE_SCALE/.test(tsSrc),
    'HEURISTIC_FEATURE_SCALE باید مستقیماً از فایل مشترک بیاید',
  );
  assert.ok(
    /GRID_SIZE[^=]*=\s*sharedConstants\.GRID_SIZE/.test(tsSrc),
    'GRID_SIZE باید از فایل مشترک بیاید',
  );
});

// ── ۳) Python ضرایب را هاردکد نکرده باشد ────────────────────────────────
check('analyze.py ضرایب را از SCALE می‌خواند (نه عدد ثابت)', () => {
  const body = pySrc.slice(pySrc.indexOf('def analyze('));
  const hardcoded = [];
  // الگوی clamp_score(x, <عدد>) با عدد ثابت به‌جای SCALE[...]
  for (const m of body.matchAll(/clamp_score\([^,)]+,\s*([0-9][0-9.]*)\s*\)/g)) {
    if (m[1] !== '100') hardcoded.push(m[0]);
  }
  assert.strictEqual(
    hardcoded.length,
    0,
    `ضریب هاردکد در analyze.py: ${hardcoded.join(', ')} — به‌جایش SCALE['...'] بگذارید`,
  );
  assert.ok(
    /GRID_SIZE = _CONSTANTS\['GRID_SIZE'\]/.test(pySrc),
    'GRID_SIZE باید از فایل مشترک خوانده شود',
  );
  assert.ok(
    /SCALE = _CONSTANTS\['FEATURE_SCALE'\]/.test(pySrc),
    'SCALE باید از فایل مشترک خوانده شود',
  );
});

// ── ۴) کلیدهای fallback پایتون با فایل مشترک یکی است ────────────────────
check('کلیدهای fallback در analyze.py با فایل مشترک یکی است', () => {
  const start = pySrc.indexOf("'FEATURE_SCALE': {");
  assert.ok(start > -1, "بلوک fallback 'FEATURE_SCALE' پیدا نشد");
  const block = pySrc.slice(start, pySrc.indexOf('}', pySrc.indexOf('minHairArea', start)));
  const fallbackKeys = [...block.matchAll(/'([A-Za-z]+)':/g)]
    .map((m) => m[1])
    .filter((k) => k !== 'FEATURE_SCALE');
  const sharedKeys = Object.keys(shared.FEATURE_SCALE);

  const missing = sharedKeys.filter((k) => !fallbackKeys.includes(k));
  const extra = fallbackKeys.filter((k) => !sharedKeys.includes(k));
  assert.strictEqual(missing.length, 0, `در fallback پایتون نیست: ${missing.join(', ')}`);
  assert.strictEqual(extra.length, 0, `در fallback پایتون اضافه است: ${extra.join(', ')}`);

  // مقادیر fallback هم باید با فایل مشترک یکی باشند
  const mismatched = [];
  for (const key of sharedKeys) {
    const m = block.match(new RegExp(`'${key}':\\s*([0-9.]+)`));
    if (m && Number(m[1]) !== shared.FEATURE_SCALE[key]) {
      mismatched.push(`${key} (py=${m[1]} vs shared=${shared.FEATURE_SCALE[key]})`);
    }
  }
  assert.strictEqual(mismatched.length, 0, `مقدار fallback ناهمگام: ${mismatched.join(', ')}`);
});

// ── ۵) فایل مشترک به نسخهٔ نصب‌شده هم می‌رسد ────────────────────────────
check('shared در extraResources هست (نسخهٔ بسته‌بندی‌شده)', () => {
  const builder = JSON.parse(read('electron-builder.json'));
  const resources = builder.extraResources || [];
  const hasShared = resources.some((r) => {
    const from = typeof r === 'string' ? r : r.from;
    return from === 'shared' || String(from).startsWith('shared');
  });
  assert.ok(
    hasShared,
    'shared/ در extraResources نیست — analyze.py در نسخهٔ نصب‌شده fallback می‌شود',
  );
});

if (failures > 0) {
  console.error(`\n${failures} بررسی ناموفق بود.`);
  process.exit(1);
}
console.log('\nALL_SHARED_CONSTANT_CHECKS_PASSED');
