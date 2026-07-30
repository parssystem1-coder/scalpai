#!/usr/bin/env node
/**
 * قفل نسخه (موج ۳ / O1): سه چیز باید هم‌راستا باشند تا ریلیز قابل‌اتکا باشد —
 *   ۱) فیلد version در package.json
 *   ۲) مدخل `## [x.y.z]` در CHANGELOG.md
 *   ۳) (اختیاری، در CI ریلیز) نام تگ: vx.y.z
 *
 * چرا؟ electron-updater با مقایسهٔ version نصب‌شده و latest.yml تصمیم می‌گیرد؛
 * اگر نسخه بی‌دقت جلو برود/عقب بماند، کاربر یا آپدیت بی‌دلیل می‌گیرد یا هرگز
 * آپدیت نمی‌گیرد — و هیچ‌کدام را CHANGELOG دروغ نمی‌گوید.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));

let failed = 0;
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1; };
const pass = (msg) => console.log(`✓ ${msg}`);

// ۱) CHANGELOG موجود و مدخل نسخهٔ جاری دارد
const changelogPath = path.join(root, 'CHANGELOG.md');
if (!fs.existsSync(changelogPath)) {
  fail('CHANGELOG.md یافت نشد — برای هر نسخه مدخل لازم است');
} else {
  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const heading = new RegExp(`^## \\[${pkg.version.replace(/\./g, '\\.')}\\]`, 'm');
  if (heading.test(changelog)) {
    pass(`CHANGELOG.md مدخل [${pkg.version}] دارد`);
  } else {
    fail(`CHANGELOG.md مدخلی برای [${pkg.version}] ندارد (فرمت: ## [${pkg.version}] - YYYY-MM-DD)`);
  }
}

// ۲) اگر نام تگ پاس شد، باید دقیقاً با version جور باشد
const tag = process.argv[2];
if (tag) {
  const expected = `v${pkg.version}`;
  if (tag === expected) {
    pass(`تگ ${tag} با package.json (${pkg.version}) هم‌خوان است`);
  } else {
    fail(`تگ ${tag} با version در package.json (${expected}) جور نیست — تگ درست را بزنید یا نسخه را به‌روز کنید`);
  }
}

if (failed) {
  console.error(`\n${failed} قفل نسخه شکست خورد.`);
  process.exit(1);
}
console.log('\nقفل نسخه سبز است.');
