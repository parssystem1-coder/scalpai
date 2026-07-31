/**
 * rebuild-native.cjs — تلاش برای rebuild ماژول‌های native برای Electron.
 * اگر Visual Studio / ابزار بیلد نباشد، با هشدار رد می‌شود تا
 * `pnpm install` کل پروژه را خراب نکند (prebuild نود معمولاً کافی است
 * وقتی نسخهٔ Node سیستم با Electron یکی است، مثل Node 24 / Electron 42).
 *
 * موج ۲ (C1): better-sqlite3-multiple-ciphers (درایور SQLCipher رسمی) در
 * اولویت اول است؛ better-sqlite3 ساده فقط fallback است ولی برای سازگاری
 * باز هم rebuild می‌شود.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rebuildBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron',
  'rebuild',
  'lib',
  'cli.js'
);

/** به‌ترتیب اولویت — فقط ماژول‌هایی که واقعاً نصب‌اند */
const NATIVE_MODULES = ['better-sqlite3-multiple-ciphers', 'better-sqlite3'].filter((name) =>
  fs.existsSync(path.join(__dirname, '..', 'node_modules', name)),
);

if (!fs.existsSync(rebuildBin)) {
  console.warn('[scalpai] @electron/rebuild not installed — skipping native rebuild.');
  process.exit(0);
}

let anyFailed = false;
for (const name of NATIVE_MODULES) {
  console.log(`Trying @electron/rebuild for ${name}...`);
  const result = spawnSync(
    process.execPath,
    [rebuildBin, '-f', '-w', name],
    { stdio: 'inherit', shell: false }
  );
  if (result.status !== 0) {
    anyFailed = true;
    console.warn(
      `[scalpai] electron-rebuild failed for ${name} (often missing Visual Studio Build Tools). `
    );
  }
}

if (anyFailed) {
  console.warn(
    'Continuing — if Electron and Node share the same ABI, the Node prebuild may work. ' +
      'If SQLite fails in Electron, install VS Build Tools and re-run: npx @electron/rebuild -f -w better-sqlite3-multiple-ciphers'
  );
  process.exit(0);
}
