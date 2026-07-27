/**
 * rebuild-native.cjs — تلاش برای rebuild ماژول‌های native برای Electron.
 * اگر Visual Studio / ابزار بیلد نباشد، با هشدار رد می‌شود تا
 * `pnpm install` کل پروژه را خراب نکند (prebuild نود معمولاً کافی است
 * وقتی نسخهٔ Node سیستم با Electron یکی است، مثل Node 24 / Electron 42).
 */
const { spawnSync } = require('child_process');
const path = require('path');

const rebuildBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron',
  'rebuild',
  'lib',
  'cli.js'
);

console.log('Trying @electron/rebuild for better-sqlite3...');
const result = spawnSync(
  process.execPath,
  [rebuildBin, '-f', '-w', 'better-sqlite3'],
  { stdio: 'inherit', shell: false }
);

if (result.status !== 0) {
  console.warn(
    '[scalpai] electron-rebuild failed (often missing Visual Studio Build Tools). ' +
      'Continuing — if Electron and Node share the same ABI, the Node prebuild may work. ' +
      'If SQLite fails in Electron, install VS Build Tools and re-run: npx @electron/rebuild -f -w better-sqlite3'
  );
  process.exit(0);
}
