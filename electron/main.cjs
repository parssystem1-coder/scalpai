/**
 * ScalpAI - Electron Main Process
 * نسخه بهینه شده با پشتیبانی از پروکسی و ماژولار بودن
 */

const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDbHandlers } = require('./db-handlers.cjs');
const { createJsonDbHandlers } = require('./db-handlers-json.cjs');
const {
  createOfflineHandlers,
  setAnalyzeTempRoot,
  cleanupStaleAnalyzeTemp,
  cleanupLiveTempFiles,
} = require('./offline-handlers.cjs');
const { createAiHandlers } = require('./ai-handlers.cjs');
const { createBaseTables, runMigrations } = require('./schema-migrations.cjs');
const { SYSTEM_TRAINING_POOL_CLIENT_ID } = require('./db-common.cjs');
const {
  allowFile,
  allowDirectory,
  assertPathAllowed,
  ensureParentDir,
} = require('./path-allowlist.cjs');
const {
  createSession,
  validateSession,
  destroySession,
  updateSessionUsername,
} = require('./auth-session.cjs');

// موج ۲ (C1) — درایور SQLite ترجیحاً better-sqlite3-multiple-ciphers (SQLCipher)
// است؛ fallback به better-sqlite3 ساده با رمزنگاریِ غیرفعال (جزئیات در sqlite-driver.cjs)
const { loadSqliteDriver } = require('./sqlite-driver.cjs');
const { initDek, getDek, getPurposeKey, getEncryptionStatus } = require('./dek.cjs');
const {
  tryOpenKeyed,
  openPlain,
  migratePlaintextToEncrypted,
  cleanupPlainOldAfterSuccessfulBoot,
  recoverIncompleteMigration,
} = require('./db-encryption.cjs');
const { encryptBuffer, decryptBuffer, isEncryptedBuffer, FILE_MAGIC } = require('./file-crypto.cjs');
const { AUDIT_EVENTS, recordAudit, setAuditSink } = require('./audit.cjs');

// Database setup
const sqliteDriver = loadSqliteDriver();
const Database = sqliteDriver.Database;
const dbLoadError = sqliteDriver.loadError || null;
if (!Database) {
  console.error('Failed to load a SQLite driver (tried better-sqlite3-multiple-ciphers, then better-sqlite3). The native module is likely missing or was built for the wrong Node/Electron ABI. Run "pnpm install" (which rebuilds it via scripts/rebuild-native.cjs) or "npx @electron/rebuild -f -w better-sqlite3-multiple-ciphers".', dbLoadError);
} else if (!sqliteDriver.cipherCapable) {
  console.warn('[encryption] better-sqlite3-multiple-ciphers unavailable — database encryption is DISABLED for this run (using plain better-sqlite3).');
}

let mainWindow;
let db;
let dbHandlers;
let offlineHandlers;
// موج ۳ (O2): آخرین مسیر فایل بازیابی انتخاب‌شده توسط دیالوگ main — برای
// تلاش مجدد با پسورد بدون باز کردن دوبارهٔ دیالوگ (ببین backup:importFromPath).
let lastImportFromPath = null;
// موج ۲ (C1) — وضعیت لایهٔ رمزنگاری برای IPC تنظیمات و لاگ
const encryptionState = {
  driver: 'none',
  keyStatus: 'uninitialized',
  dbEncrypted: false,
  imageEncryption: false,
  migrationReport: null,
};
const aiHandlers = createAiHandlers(net);

// نام اپ را صریح ثابت می‌کنیم: بدون این، Electron در حالت توسعه از `name` در
// package.json («scalpai») و در نسخهٔ نصب‌شده از `productName` («ScalpAI»)
// استفاده می‌کرد. نتیجه دو پوشهٔ داده مجزا بود
// (%APPDATA%/scalpai و %APPDATA%/ScalpAI) و کاربر فکر می‌کرد داده‌هایش
// پاک شده‌اند. ویندوز و مک به بزرگی/کوچکی حروف حساس نیستند ولی لینوکس هست.
// باید *قبل از* requestSingleInstanceLock باشد چون قفل به مسیر userData گره خورده.
app.setName('ScalpAI');

// قفل تک‌نمونه: دو نسخهٔ هم‌زمان یعنی دو اتصال به یک دیتابیس و دو تنظیم پروکسی
// متضاد. در حالت جایگزین (JSON) بدتر است — قفل نوشتن فقط داخل یک پراسس کار
// می‌کند، پس دو پراسس می‌توانند داده‌های هم را پاک کنند.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // کاربر دوباره روی آیکون زد — به‌جای باز کردن نسخهٔ دوم، همین را جلو بیاور
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// مسیرهای کاربر (app.setName بالاتر اجرا شده تا این مسیر ثابت بماند)
const userDataPath = app.getPath('userData');
const { initLogger } = require('./logger.cjs');
initLogger(userDataPath);
const dbPath = path.join(userDataPath, 'scalpai.db');

// فاز ۱ (AUD-8) — تصاویر موقت تحلیل آفلاین باید داخل userData بنشینند، نه در
// پوشهٔ عمومی %TEMP% سیستم‌عامل. این تزریق باید پیش از هر تحلیلی انجام شود.
setAnalyzeTempRoot(userDataPath);
// لایهٔ سوم دفاع: اگر پروسه هنگام باز بودن یک فایل موقت خاتمه یافت، همان‌جا
// پاک شود. (لایهٔ اول: finally در offline-handlers؛ لایهٔ دوم: پاک‌سازی استارت‌آپ)
process.on('exit', cleanupLiveTempFiles);

/**
 * موج ۱ (W1-6) — پوشهٔ اختصاصی فایل‌های موقت چاپ داخل userData.
 * قبلاً گزارش HTML (حاوی دادهٔ بالینی بیمار) در %TEMP% سیستم‌عامل نوشته می‌شد
 * و فقط هنگام بستنِ مرتب پنجره پاک می‌شد؛ کرش یا kill یعنی بقایای دائمی
 * دادهٔ بیمار روی دیسک. حالا فایل‌ها کنار بقیهٔ داده‌های اپ نگه داشته می‌شوند
 * و بقایای جلسات خراب در استارت‌آپ بعدی پاک می‌شوند.
 */
function getPrintTmpDir() {
  const dir = path.join(userDataPath, 'print-tmp');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** پاک‌سازی فایل‌های موقت چاپ باقی‌مانده از جلسات قبلی (کرش/خروج ناگهانی) */
function cleanupStalePrintTemp() {
  try {
    const dir = path.join(userDataPath, 'print-tmp');
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('scalpai-print-') && name.endsWith('.html')) {
        try {
          fs.unlinkSync(path.join(dir, name));
          console.log('Removed stale print temp file:', name);
        } catch { /* فایل قفل/حذف‌شده — نادیده بگیر */ }
      }
    }
  } catch (err) {
    console.warn('Could not clean stale print temp files:', err);
  }
}

/**
 * تنظیم پروکسی برای session
 * @param {string} proxyUrl - آدرس پروکسی (مثلاً http://127.0.0.1:10808)
 */
async function setProxy(proxyUrl) {
  if (!proxyUrl || proxyUrl.trim() === '') {
    // غیرفعال کردن پروکسی
    await session.defaultSession.setProxy({ mode: 'direct' });
    console.log('Proxy disabled - using direct connection');
    return { success: true, mode: 'direct' };
  }

  try {
    // پارس کردن URL پروکسی
    const proxyConfig = {
      mode: 'fixed_servers',
      proxyRules: proxyUrl.trim(),
      proxyBypassRules: 'localhost,127.0.0.1,<local>'
    };

    await session.defaultSession.setProxy(proxyConfig);
    console.log('Proxy configured:', proxyUrl);
    return { success: true, mode: 'proxy', url: proxyUrl };
  } catch (error) {
    console.error('Failed to set proxy:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ایجاد پنجره اصلی
 */
/**
 * بررسی تازگی خروجی build نسبت به کد منبع.
 *
 * چرا لازم است؟ پوشهٔ dist/ عمداً در .gitignore است (تا نسخهٔ کهنه کامیت
 * نشود). نتیجه این است که پس از `git pull`، کد منبع به‌روز می‌شود ولی dist
 * دست‌نخورده می‌ماند؛ آنگاه `pnpm run electron` بی‌سروصدا نسخهٔ قدیمی را
 * اجرا می‌کند و کاربر تصور می‌کند تغییرات اعمال نشده‌اند.
 *
 * @returns {null | { reason: 'missing' | 'stale', logFa: string, newestSrc?: string }}
 */
function checkDistFreshness(distIndexPath) {
  try {
    if (!fs.existsSync(distIndexPath)) {
      return { reason: 'missing', logFa: 'پوشهٔ dist وجود ندارد. ابتدا `pnpm run build` را اجرا کنید.' };
    }
    const distMtime = fs.statSync(distIndexPath).mtimeMs;

    // جدیدترین زمان تغییر در src/ و shared/ را پیدا کن
    let newestSrcMtime = 0;
    let newestSrcFile = '';
    const roots = ['../src', '../shared'].map(r => path.join(__dirname, r));
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|jsx|css|json)$/.test(e.name)) continue;
        try {
          const m = fs.statSync(full).mtimeMs;
          if (m > newestSrcMtime) { newestSrcMtime = m; newestSrcFile = full; }
        } catch { /* فایل ناخوانا — نادیده */ }
      }
    };
    roots.forEach(walk);

    // حاشیهٔ ۵ ثانیه‌ای برای اختلاف ناچیز زمان‌بندی فایل‌سیستم
    if (newestSrcMtime > distMtime + 5000) {
      return {
        reason: 'stale',
        newestSrc: path.basename(newestSrcFile),
        logFa: `خروجی build کهنه است (${path.basename(newestSrcFile)} جدیدتر از dist است). «pnpm run build» را دوباره اجرا کنید.`,
      };
    }
    return null;
  } catch (err) {
    // اگر خود بررسی خطا داد، مانع اجرای برنامه نشو
    console.warn('[ScalpAI] بررسی تازگی dist ناموفق بود:', err && err.message);
    return null;
  }
}

/** صفحهٔ راهنمای داخلی وقتی dist کهنه/غایب است (بدون وابستگی به فایل خارجی) */
function buildStaleDistPage(info) {
  const isMissing = info.reason === 'missing';
  const title = isMissing ? 'نسخهٔ ساخته‌شده پیدا نشد' : 'نسخهٔ ساخته‌شده قدیمی است';
  const detail = isMissing
    ? 'پوشهٔ <code>dist</code> وجود ندارد، بنابراین چیزی برای نمایش نیست.'
    : `کد منبع پس از آخرین build تغییر کرده است${info.newestSrc ? ` (جدیدترین تغییر: <code>${info.newestSrc}</code>)` : ''}. اگر برنامه اجرا می‌شد، نسخهٔ <b>قدیمی</b> را می‌دیدید و تغییرات جدید غایب بودند.`;
  const html = `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${title}</title><style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0a0a0a;color:#e5e5e5;font-family:Tahoma,Segoe UI,sans-serif;padding:24px}
.card{max-width:620px;background:#171717;border:1px solid #f59e0b55;border-radius:16px;padding:32px}
h1{margin:0 0 12px;font-size:20px;color:#fbbf24}
p{line-height:2;opacity:.9;font-size:14px;margin:0 0 16px}
pre{background:#000;border:1px solid #333;border-radius:10px;padding:14px;
direction:ltr;text-align:left;overflow-x:auto;font-size:13px;color:#4ade80;margin:0}
code{background:#000;padding:2px 6px;border-radius:4px;color:#fbbf24;direction:ltr;display:inline-block}
</style></head><body><div class="card">
<h1>⚠️ ${title}</h1>
<p>${detail}</p>
<p>برای رفع، این دستور را در پوشهٔ پروژه اجرا کنید و سپس برنامه را دوباره باز کنید:</p>
<pre>pnpm run build</pre>
<p style="margin-top:16px;opacity:.65;font-size:13px">یا برای ساخت و اجرا با هم: <code>pnpm run electron:prod</code></p>
</div></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, '../public/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0a0a0a',
  });

  mainWindow.setMenu(null);
  // شروع به‌صورت فول‌اسکرین (خروج با Esc / F11)
  mainWindow.setFullScreen(true);
  mainWindow.show();

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const distIndex = path.join(__dirname, '../dist/index.html');
    const staleness = checkDistFreshness(distIndex);
    if (staleness) {
      // dist نبود یا از کد منبع کهنه‌تر است → اجرای خاموشِ نسخهٔ قدیمی
      // باعث می‌شود کاربر تغییرات جدید را نبیند و تصور کند کد خراب است.
      // (این دقیقاً همان تله‌ای است که باعث شد پنل «بلوغ داده» در نسخهٔ
      // دسکتاپ دیده نشود در حالی که در مرورگر کار می‌کرد.)
      console.warn(`[ScalpAI] ${staleness.logFa}`);
      mainWindow.loadURL(buildStaleDistPage(staleness));
      return;
    }
    mainWindow.loadFile(distIndex);
    // غیرفعال کردن DevTools در محیط production
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' ||
          (input.control && input.shift && input.key === 'I') ||
          (input.control && input.shift && input.key === 'J') ||
          (input.control && input.key === 'U')) {
        event.preventDefault();
      }
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // فقط لینک‌های http/https در مرورگر خارجی باز می‌شوند؛ schemeهای دیگر
  // (file:, smb:, ...) می‌توانند خطرناک باشند و کلاً رد می‌شوند.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // صفحهٔ اپ نباید بتواند به آدرس دیگری navigate کند (فقط HMR در حالت dev)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedInDev = isDev && (url.startsWith('http://localhost:5173') || url.startsWith('http://127.0.0.1:5173'));
    if (!allowedInDev) {
      event.preventDefault();
    }
  });
}

/**
 * اگر فایل دیتابیس SQLite از قبل وجود دارد، هنگام fallback به JSON باید صریحاً
 * به کاربر گفته شود که داده‌هایش پاک نشده ولی در این حالت دیده نمی‌شود —
 * وگرنه fallback مثل «از دست رفتن همهٔ داده‌ها» به نظر می‌رسد.
 */
function existingSqliteDataNote() {
  try {
    if (fs.existsSync(dbPath)) {
      return (
        '\n\nتوجه مهم: فایل دیتابیس قبلی شما (scalpai.db) سر جای خود محفوظ است و پاک نشده، ' +
        'اما در حالت جایگزین نمایش داده نمی‌شود. پس از رفع مشکل و اجرای دوباره برنامه، ' +
        'همهٔ داده‌ها دوباره در دسترس خواهند بود.'
      );
    }
  } catch { /* ignore */ }
  return '';
}

/**
 * خواندن فایل ذخیره‌سازی جایگزین (JSON) اگر داده‌ای در آن باشد.
 * @returns {object|null}
 */
function readJsonFallbackData(jsonPath) {
  try {
    if (!fs.existsSync(jsonPath)) return null;
    const rawBytes = fs.readFileSync(jsonPath);
    let jsonText;
    if (isEncryptedBuffer(rawBytes)) {
      // موج ۲ (C1.4): فایل fallback ممکن است رمزشده باشد — با کلید این دستگاه باز کن
      const jsonKey = getPurposeKey('json-store');
      if (!jsonKey) {
        console.warn('JSON fallback file is encrypted but the key is unavailable; skipping migration into SQLite.');
        return null;
      }
      jsonText = decryptBuffer(rawBytes, jsonKey).toString('utf-8');
    } else {
      jsonText = rawBytes.toString('utf-8');
    }
    const parsed = JSON.parse(jsonText);
    // ردیف مشتری سیستمی (استخر آموزشی) در این شمارش لحاظ نمی‌شود، وگرنه
    // فایل JSON که فقط همان ردیف را دارد به‌اشتباه «دادهٔ واقعی» تلقی می‌شود.
    const realClientsCount = Array.isArray(parsed?.clients)
      ? parsed.clients.filter((c) => c?.id !== SYSTEM_TRAINING_POOL_CLIENT_ID && !c?.isSystemRecord).length
      : 0;
    const hasData =
      realClientsCount > 0 ||
      ['gallery', 'sessions', 'analyses', 'trichologists', 'trainingSamples'].some(
        (key) => Array.isArray(parsed?.[key]) && parsed[key].length > 0,
      ) || !!parsed?.settings?.username;
    return hasData ? parsed : null;
  } catch (error) {
    console.warn('Could not read JSON fallback file:', error);
    return null;
  }
}

/** آیا دیتابیس SQLite هنوز هیچ دادهٔ کاربری ندارد؟ */
function isSqliteDataEmpty() {
  // ردیف مشتری سیستمی (استخر آموزشی) به‌عنوان «دادهٔ کاربری» به حساب نمی‌آید —
  // بدون این استثنا، isSqliteDataEmpty همیشه false برمی‌گشت و migrateJsonFallbackIntoSqlite
  // هرگز اجرا نمی‌شد.
  const clientsCount = db.prepare(
    "SELECT COUNT(*) AS c FROM clients WHERE id != ? AND (isSystemRecord IS NULL OR isSystemRecord = 0)",
  ).get(SYSTEM_TRAINING_POOL_CLIENT_ID).c;
  if (clientsCount > 0) return false;
  for (const table of ['gallery', 'sessions', 'analyses', 'training_samples']) {
    if (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c > 0) return false;
  }
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
  if (row) {
    try {
      if (JSON.parse(row.value).username) return false;
    } catch { /* ignore */ }
  }
  return true;
}

function upsertSettingsRow(value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES ('settings', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify(value));
}

/**
 * مهاجرت یک‌بارهٔ داده‌های حالت جایگزین (scalpai-data.json) به SQLite.
 * سناریو: یک مدت better-sqlite3 خراب بوده و کاربر در حالت JSON داده ثبت کرده؛
 * حالا که SQLite دوباره کار می‌کند، آن داده‌ها نباید بی‌صدا نادیده گرفته شوند.
 */
async function migrateJsonFallbackIntoSqlite() {
  const jsonPath = path.join(userDataPath, 'scalpai-data.json');
  const jsonData = readJsonFallbackData(jsonPath);
  if (!jsonData) return;

  if (!isSqliteDataEmpty()) {
    // هر دو منبع داده دارند — ادغام خودکار امن نیست؛ فقط یک‌بار هشدار می‌دهیم.
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
      const settings = row ? JSON.parse(row.value) : {};
      if (!settings.jsonFallbackConflictNoticeShown) {
        settings.jsonFallbackConflictNoticeShown = true;
        upsertSettingsRow(settings);
        dialog.showMessageBox(null, {
          type: 'warning',
          title: 'دو منبع داده یافت شد / Two data stores found',
          message:
            'هم دیتابیس اصلی (scalpai.db) و هم فایل حالت جایگزین (scalpai-data.json) حاوی داده هستند.\n' +
            'برنامه از دیتابیس اصلی استفاده می‌کند و داده‌های فایل جایگزین نمایش داده نمی‌شوند (ولی پاک هم نشده‌اند).\n\n' +
            'اگر داده‌های حالت جایگزین را لازم دارید، از پشتیبان‌گیری/بازیابی در تنظیمات استفاده کنید.',
        });
      }
    } catch (error) {
      console.warn('Could not show fallback conflict notice:', error);
    }
    return;
  }

  try {
    const result = await dbHandlers.handleDbQuery('importData', { jsonData: JSON.stringify(jsonData) });
    if (result && result.error) throw new Error(result.error);

    // importData عمداً پسورد/کلید API واردشده را کنار می‌گذارد (برای بکاپ‌های خارجی
    // درست است)، اما اینجا منبع همین دستگاه است؛ منتقل می‌کنیم تا کاربر مجبور به
    // ساخت دوبارهٔ حساب نشود. رمزنگاری safeStorage هم مخصوص همین دستگاه است.
    const importedSettings = jsonData.settings || {};
    if (importedSettings.passwordHash || importedSettings.password || importedSettings.aiApiKey) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
      const current = row ? JSON.parse(row.value) : {};
      if (importedSettings.passwordHash) current.passwordHash = importedSettings.passwordHash;
      else if (importedSettings.password) current.password = importedSettings.password;
      if (importedSettings.aiApiKey) current.aiApiKey = importedSettings.aiApiKey;
      upsertSettingsRow(current);
    }

    // فایل JSON بازنشسته می‌شود تا مهاجرت دوباره تکرار نشود؛ حذف نمی‌کنیم که
    // در صورت نیاز قابل بازگردانی باشد.
    fs.renameSync(jsonPath, `${jsonPath}.migrated-${Date.now()}`);
    console.log('JSON fallback data migrated into SQLite');
    dialog.showMessageBox(null, {
      type: 'info',
      title: 'انتقال داده / Data migrated',
      message:
        'داده‌هایی که در حالت ذخیره‌سازی جایگزین (JSON) ثبت شده بودند، با موفقیت به دیتابیس اصلی (SQLite) منتقل شدند.',
    });
  } catch (error) {
    console.error('JSON fallback migration failed:', error);
    dialog.showMessageBox(null, {
      type: 'warning',
      title: 'انتقال داده ناموفق / Migration failed',
      message:
        'انتقال خودکار داده‌های حالت جایگزین (scalpai-data.json) به دیتابیس اصلی ناموفق بود. ' +
        'فایل داده دست‌نخورده باقی مانده است.\n\nDetails: ' + error.message,
    });
  }
}

/**
 * راه‌اندازی دیتابیس — موج ۲ (C1): باز کردن رمزشده/مهاجرت plaintext→SQLCipher
 */
async function initDatabase() {
  // مقداردهی کلید رمزنگاری دادهٔ در سکون *قبل* از هر باز کردن فایل دیتابیس
  const dekInit = initDek(safeStorage, userDataPath);
  const dek = getDek();
  const hexKey = dek ? dek.toString('hex') : null;
  encryptionState.driver = sqliteDriver.driverName;
  encryptionState.keyStatus = dekInit.status;
  encryptionState.imageEncryption = Boolean(getPurposeKey('image-aes'));

  if (!Database) {
    console.warn('SQLite driver unavailable, falling back to JSON file storage:', dbLoadError && dbLoadError.message);
    dbHandlers = createJsonDbHandlers(userDataPath, safeStorage);
    offlineHandlers = createOfflineHandlers();
    dialog.showMessageBox(null, {
      type: 'warning',
      title: 'حالت ذخیره‌سازی جایگزین / Fallback Storage',
      message:
        'درایور SQLite (better-sqlite3-multiple-ciphers / better-sqlite3) بارگذاری نشد، بنابراین برنامه از یک فایل ذخیره‌سازی ساده (JSON) به‌جای SQLite استفاده می‌کند.\n' +
        'اطلاعات شما ذخیره خواهند شد، اما برای عملکرد کامل‌تر (SQLite) توصیه می‌شود دستور زیر را یک‌بار در پوشه برنامه اجرا کنید:\n\n' +
        'pnpm install\n\n' +
        'Details: ' + (dbLoadError ? dbLoadError.message : 'unknown') +
        existingSqliteDataNote(),
    });
    return null;
  }

  try {
    const canEncrypt = Boolean(hexKey) && sqliteDriver.cipherCapable;
    let migratedNow = false;

    // ترمیم کرش احتمالی وسط جایگزینیِ مهاجرت قبلی (قبل از هر باز کردن فایل)
    recoverIncompleteMigration(dbPath, {
      Database: canEncrypt ? Database : undefined,
      hexKey: canEncrypt ? hexKey : undefined,
    });

    if (canEncrypt) {
      if (fs.existsSync(dbPath)) {
        try {
          // دیتابیس از قبل رمزشده است
          db = tryOpenKeyed(Database, dbPath, hexKey).db;
          encryptionState.dbEncrypted = true;
          cleanupPlainOldAfterSuccessfulBoot(dbPath);
        } catch (keyedError) {
          // فایل با کلید باز نشد → plaintext legacy (یا خراب؛ تلاش بعدی مشخص می‌کند)
          db = openPlain(Database, dbPath);
          encryptionState.dbEncrypted = false;
        }
      } else {
        // نصب تازه — دیتابیس از همان ابتدا رمزشده ساخته می‌شود
        db = tryOpenKeyed(Database, dbPath, hexKey).db;
        encryptionState.dbEncrypted = true;
      }
    } else {
      if (sqliteDriver.cipherCapable && dekInit.status !== 'active') {
        console.warn('[encryption] SQLCipher driver present but key unavailable (status: %s) — running WITHOUT database encryption.', dekInit.status);
      }
      db = openPlain(Database, dbPath);
      encryptionState.dbEncrypted = false;
    }

    // مهاجرت دیتابیس plaintext موجود به SQLCipher — «کپی → راستی‌آزمایی → جایگزینی»
    if (canEncrypt && !encryptionState.dbEncrypted) {
      console.info('[encryption] starting plaintext → SQLCipher migration...');
      // اسکیمای مبدأ به نسخهٔ جاری برسد تا کپی ستونی دقیق بماند، سپس WAL بسته شود
      db.pragma('journal_mode = WAL');
      createBaseTables(db);
      runMigrations(db);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      encryptionState.migrationReport = migratePlaintextToEncrypted({
        Database,
        dbPath,
        hexKey,
        backupDir: path.join(userDataPath, 'backups'),
        log: console,
      });
      db = tryOpenKeyed(Database, dbPath, hexKey).db;
      encryptionState.dbEncrypted = true;
      migratedNow = true;
      console.info('[encryption] migration complete — database is now encrypted at rest');
    }

    // WAL: نوشتن هم‌زمان با خواندن، مقاوم‌تر در برابر بسته‌شدن ناگهانی برنامه.
    // foreign_keys: بدون این pragma، تعریف FOREIGN KEY در SQLite عملاً بی‌اثر است.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    createBaseTables(db);
    runMigrations(db);

    // موج ۲ (C3.3) — sink جهانی برای رویدادهای main-process (ورود/خروج/AI ابری)
    // به همان دیتابیس فعال؛ رویدادهای درون هندلرها recorder محلی خود را دارند.
    setAuditSink((entry) => {
      try {
        db.prepare(
          'INSERT INTO audit_log (id, event, actor, detail, createdAt) VALUES (?, ?, ?, ?, ?)',
        ).run(entry.id, entry.event, entry.actor, entry.detail, entry.createdAt);
      } catch (auditError) {
        console.warn('[audit] sqlite sink failed:', auditError.message);
      }
    });

    // بررسی سلامت دیتابیس (فاز B2)
    runDbIntegrityCheck(db);

    // تنظیمات پیش‌فرض
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
    if (!existing) {
      const defaultSettings = {
        language: 'fa',
        theme: 'mint',
        aiConfidenceThreshold: 0.7,
      };
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('settings', JSON.stringify(defaultSettings));
    }

    // ایجاد هندلرهای دیتابیس
    dbHandlers = createDbHandlers(db, userDataPath, safeStorage);
    offlineHandlers = createOfflineHandlers();

    // رویداد مهاجرت رمزنگاری باید *بعد* از اتصال sink حسابرسی ثبت شود
    if (migratedNow) {
      recordAudit(AUDIT_EVENTS.DB_MIGRATION_ENCRYPTED, 'system', {
        tables: encryptionState.migrationReport.tablesCopied.length,
        rows: encryptionState.migrationReport.rowsCopied,
        backupPath: path.basename(encryptionState.migrationReport.backupPath),
      });
    }

    // اگر قبلاً در حالت جایگزین (JSON) داده ثبت شده، به SQLite منتقل می‌شود
    await migrateJsonFallbackIntoSqlite();

    console.log('Database initialized at:', dbPath, encryptionState.dbEncrypted ? '(encrypted)' : '(plaintext)');
    return db;
  } catch (error) {
    console.error('Database initialization error, falling back to JSON file storage:', error);
    dbHandlers = createJsonDbHandlers(userDataPath, safeStorage);
    offlineHandlers = createOfflineHandlers();
    dialog.showMessageBox(null, {
      type: 'warning',
      title: 'حالت ذخیره‌سازی جایگزین / Fallback Storage',
      message:
        'راه‌اندازی پایگاه‌داده SQLite ناموفق بود، برنامه از ذخیره‌سازی جایگزین (JSON) استفاده می‌کند.\n\n' +
        'Details: ' + error.message +
        existingSqliteDataNote(),
    });
    return null;
  }
}

/**
 * خواندن تنظیمات از طریق dbHandlers (نه مستقیم از نمونهٔ SQLite).
 * مهم: قبلاً هندلرهای پروکسی مستقیماً به متغیر `db` وابسته بودند، پس در
 * حالت جایگزین (JSON — وقتی better-sqlite3 لود نمی‌شود) پروکسی نه ذخیره
 * می‌شد و نه در استارت اعمال. دقیقاً همان کاربری که به fallback افتاده،
 * بیشترین احتمال را دارد که به پروکسی نیاز داشته باشد.
 * @returns {Promise<object>}
 */
async function readSettingsViaHandlers() {
  if (!dbHandlers) return {};
  try {
    const result = await dbHandlers.handleDbQuery('getSettings', {});
    if (result && typeof result === 'object' && !result.error) return result;
  } catch (error) {
    console.error('Error reading settings:', error);
  }
  return {};
}

/**
 * بارگذاری و اعمال تنظیمات پروکسی — روی هر دو بک‌اند (SQLite و JSON) کار می‌کند
 */
async function loadProxySettings() {
  const settings = await readSettingsViaHandlers();
  if (settings.proxyUrl) {
    await setProxy(settings.proxyUrl);
  }
}

/**
 * راه‌اندازی هندلرهای IPC
 */
function setupIpcHandlers() {
  // هندلر اصلی دیتابیس
  ipcMain.handle('db:query', async (event, { method, params }) => {
    if (!dbHandlers) return { error: 'Database not initialized' };
    return await dbHandlers.handleDbQuery(method, params);
  });

  // =============== Proxy Handlers ===============
  ipcMain.handle('proxy:set', async (event, proxyUrl) => {
    const result = await setProxy(proxyUrl);

    // ذخیره از طریق dbHandlers تا در حالت جایگزین (JSON) هم کار کند
    if (result.success && dbHandlers) {
      try {
        const saved = await dbHandlers.handleDbQuery('updateSettings', {
          proxyUrl: proxyUrl || '',
        });
        if (saved && saved.error) throw new Error(saved.error);
      } catch (e) {
        console.error('Error saving proxy settings:', e);
        return { ...result, persisted: false, error: e.message };
      }
    }

    return result;
  });

  ipcMain.handle('proxy:get', async () => {
    const settings = await readSettingsViaHandlers();
    return settings.proxyUrl || null;
  });

  ipcMain.handle('proxy:test', async (event, testUrl) => {
    try {
      const net = require('electron').net;
      const request = net.request(testUrl || 'https://www.google.com');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          request.abort();
          resolve({ success: false, error: 'Timeout' });
        }, 10000);

        request.on('response', (response) => {
          clearTimeout(timeout);
          resolve({ success: response.statusCode < 400, statusCode: response.statusCode });
        });

        request.on('error', (error) => {
          clearTimeout(timeout);
          resolve({ success: false, error: error.message });
        });

        request.end();
      });
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // =============== Dialog Handlers ===============
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    // پوشهٔ انتخاب‌شده را برای ذخیرهٔ بکاپ‌های بعدی مجاز می‌کنیم
    for (const dir of result.filePaths) allowDirectory(dir);
    return result.filePaths;
  });

  // اگر options.data باشد، فایل همین‌جا نوشته می‌شود (بدون نیاز به fs:saveFile جداگانه)
  ipcMain.handle('dialog:saveFile', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'Backup Files', extensions: ['json', 'zip'] }],
    });
    if (result.canceled || !result.filePath) return null;
    allowFile(result.filePath);
    if (options?.data !== undefined && options?.data !== null) {
      try {
        ensureParentDir(result.filePath);
        if (typeof options.data === 'string' && options.data.startsWith('scalpai-backup:v3:base64:')) {
          const base64Content = options.data.split('scalpai-backup:v3:base64:')[1];
          fs.writeFileSync(result.filePath, Buffer.from(base64Content, 'base64'));
        } else {
          fs.writeFileSync(result.filePath, options.data);
        }
        return { success: true, filePath: result.filePath };
      } catch (error) {
        return { success: false, error: error.message, filePath: result.filePath };
      }
    }
    return result.filePath;
  });

  // اگر options.readContent باشد، محتوا همین‌جا خوانده و برگردانده می‌شود
  ipcMain.handle('dialog:openFile', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      defaultPath: options?.defaultPath,
      filters: options?.filters || [{ name: 'Backup Files', extensions: ['json', 'zip'] }],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    for (const filePath of result.filePaths) allowFile(filePath);
    if (options?.readContent) {
      try {
        const filePath = result.filePaths[0];
        let content;
        if (filePath.toLowerCase().endsWith('.zip')) {
          const buffer = fs.readFileSync(filePath);
          content = 'scalpai-backup:v3:base64:' + buffer.toString('base64');
        } else {
          content = fs.readFileSync(filePath, 'utf-8');
        }
        return { filePaths: result.filePaths, content };
      } catch (error) {
        return { filePaths: result.filePaths, error: error.message };
      }
    }
    return result.filePaths;
  });

  // =============== File System Handlers (فقط مسیرهای مجاز) ===============
  ipcMain.handle('fs:saveFile', async (event, { filePath, data }) => {
    try {
      const safePath = assertPathAllowed(filePath);
      ensureParentDir(safePath);
      if (typeof data === 'string' && data.startsWith('scalpai-backup:v3:base64:')) {
        const base64Content = data.split('scalpai-backup:v3:base64:')[1];
        fs.writeFileSync(safePath, Buffer.from(base64Content, 'base64'));
      } else {
        fs.writeFileSync(safePath, data);
      }
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      const safePath = assertPathAllowed(filePath);
      const content = fs.readFileSync(safePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      return { error: error.message };
    }
  });

  // =============== Auth Session ===============
  // محدودیت ساده برای brute force محلی: بعد از ۵ تلاش ناموفق، ۳۰ ثانیه قفل.
  const loginThrottle = { failures: 0, lockedUntil: 0 };
  const LOGIN_MAX_FAILURES = 5;
  const LOGIN_LOCKOUT_MS = 30 * 1000;

  ipcMain.handle('auth:createSession', async (event, { username, password }) => {
    if (!dbHandlers) return { success: false, error: 'Database not initialized' };

    if (Date.now() < loginThrottle.lockedUntil) {
      const waitSec = Math.ceil((loginThrottle.lockedUntil - Date.now()) / 1000);
      return {
        success: false,
        error: `تلاش‌های ناموفق زیاد بود؛ ${waitSec} ثانیه صبر کنید / Too many failed attempts, wait ${waitSec}s`,
      };
    }

    const valid = await dbHandlers.handleDbQuery('verifyCredentials', { username, password });
    if (valid !== true) {
      loginThrottle.failures += 1;
      if (loginThrottle.failures >= LOGIN_MAX_FAILURES) {
        loginThrottle.failures = 0;
        loginThrottle.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
      }
      return { success: false, error: 'Invalid credentials' };
    }

    loginThrottle.failures = 0;
    loginThrottle.lockedUntil = 0;
    const token = createSession(username);
    recordAudit(AUDIT_EVENTS.AUTH_LOGIN, username);
    return { success: true, token, username };
  });

  ipcMain.handle('auth:validateSession', async (event, { token }) => {
    return validateSession(token);
  });

  ipcMain.handle('auth:destroySession', async (event, { token }) => {
    const existing = validateSession(token);
    const result = destroySession(token);
    if (existing.valid) recordAudit(AUDIT_EVENTS.AUTH_LOGOUT, existing.username);
    return result;
  });

  ipcMain.handle('auth:updateUsername', async (event, { token, username }) => {
    return { success: updateSessionUsername(token, username) };
  });

  // =============== App Handlers ===============
  ipcMain.handle('app:getPath', async (event, name) => {
    return app.getPath(name);
  });

  ipcMain.handle('app:quit', async () => {
    app.quit();
  });

  // =============== Print (پیش‌نمایش + رنگی + PDF) ===============
  let previewWindow = null;
  let previewTmpPath = null;

  function sanitizePdfFileName(name) {
    const raw = String(name || 'report.pdf').trim();
    const base = path.basename(raw)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .slice(0, 100) || 'report';
    return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  }

  function resolvePdfDefaultPath(fileName) {
    return path.join(app.getPath('documents'), sanitizePdfFileName(fileName));
  }

  async function createPrintWindow(html, { show = false, withPreviewPreload = false } = {}) {
    // موج ۱ (W1-6) — فایل موقت داخل userData (نه %TEMP% سیستم‌عامل)
    const tmpPath = path.join(getPrintTmpDir(), `scalpai-print-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, 'utf8');

    const printWin = new BrowserWindow({
      width: 960,
      height: 1100,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        ...(withPreviewPreload
          ? { preload: path.join(__dirname, 'print-preload.cjs') }
          : {}),
      },
    });

    await printWin.loadFile(tmpPath);

    // صبر برای لود تصاویر نمودار
    await new Promise((resolve) => setTimeout(resolve, 350));

    if (withPreviewPreload) {
      await printWin.webContents.executeJavaScript(`
        (() => {
          const printBtn = document.getElementById('btn-print');
          const pdfBtn = document.getElementById('btn-pdf');
          const closeBtn = document.getElementById('btn-close');
          if (printBtn) printBtn.addEventListener('click', () => window.printPreview && window.printPreview.print());
          if (pdfBtn) pdfBtn.addEventListener('click', () => {
            const name = pdfBtn.getAttribute('data-name') || 'report.pdf';
            window.printPreview && window.printPreview.savePdf(name);
          });
          if (closeBtn) closeBtn.addEventListener('click', () => window.printPreview && window.printPreview.close());
        })();
      `);
    }

    if (show) {
      printWin.show();
      printWin.focus();
    }

    const cleanup = () => {
      try {
        if (!printWin.isDestroyed()) printWin.destroy();
      } catch { /* ignore */ }
      try {
        fs.unlinkSync(tmpPath);
      } catch { /* ignore */ }
    };

    return { printWin, cleanup, tmpPath };
  }

  async function printWindowColor(win) {
    return await new Promise((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          color: true,
          margins: { marginType: 'default' },
        },
        (success, failureReason) => {
          resolve({
            success: Boolean(success),
            error: success ? undefined : (failureReason || 'Print cancelled'),
          });
        },
      );
    });
  }

  async function saveWindowPdf(win, defaultPath) {
    const pdfData = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
      preferCSSPageSize: true,
    });

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow || win, {
      title: 'Save PDF',
      defaultPath: resolvePdfDefaultPath(defaultPath),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, pdfData);
    return { success: true, filePath };
  }

  ipcMain.handle('print:preview', async (_event, { html }) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { success: false, error: 'Empty HTML' };
    }

    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }

    const { printWin, cleanup, tmpPath } = await createPrintWindow(html, {
      show: true,
      withPreviewPreload: true,
    });

    previewWindow = printWin;
    previewTmpPath = tmpPath;

    printWin.on('closed', () => {
      previewWindow = null;
      try {
        if (previewTmpPath) fs.unlinkSync(previewTmpPath);
      } catch { /* ignore */ }
      previewTmpPath = null;
    });

    // cleanup عمداً بعد از بسته شدن؛ اینجا فقط ارجاع نگه می‌داریم
    printWin.__scalpaiCleanup = cleanup;
    return { success: true };
  });

  ipcMain.handle('print-preview:print', async () => {
    if (!previewWindow || previewWindow.isDestroyed()) {
      return { success: false, error: 'Preview closed' };
    }
    return printWindowColor(previewWindow);
  });

  ipcMain.handle('print-preview:save-pdf', async (_event, { defaultPath } = {}) => {
    if (!previewWindow || previewWindow.isDestroyed()) {
      return { success: false, error: 'Preview closed' };
    }
    const result = await saveWindowPdf(previewWindow, defaultPath);
    if (result.success && result.filePath) {
      dialog.showMessageBox(previewWindow, {
        type: 'info',
        title: 'PDF',
        message: result.filePath,
      });
    }
    return result;
  });

  ipcMain.handle('print-preview:close', async () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      const cleanup = previewWindow.__scalpaiCleanup;
      previewWindow.close();
      if (typeof cleanup === 'function') cleanup();
    }
    return { success: true };
  });

  ipcMain.handle('print:html', async (_event, { html }) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { success: false, error: 'Empty HTML' };
    }

    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.close();
    }

    const { printWin, cleanup, tmpPath } = await createPrintWindow(html, {
      show: true,
      withPreviewPreload: true,
    });

    previewWindow = printWin;
    previewTmpPath = tmpPath;
    printWin.__scalpaiCleanup = cleanup;
    printWin.on('closed', () => {
      previewWindow = null;
      try {
        if (previewTmpPath) fs.unlinkSync(previewTmpPath);
      } catch { /* ignore */ }
      previewTmpPath = null;
    });

    return { success: true };
  });

  ipcMain.handle('print:toPdf', async (_event, { html, defaultPath }) => {
    if (typeof html !== 'string' || !html.trim()) {
      return { success: false, error: 'Empty HTML' };
    }

    const { printWin, cleanup } = await createPrintWindow(html, { show: false });

    try {
      const result = await saveWindowPdf(printWin, defaultPath);
      cleanup();
      return result;
    } catch (err) {
      cleanup();
      return { success: false, error: err.message || String(err) };
    }
  });

  // =============== Safe Storage Handlers ===============
  // فقط وضعیت — encrypt/decrypt عمومی برای renderer حذف شد تا سطح حمله کاهش یابد
  ipcMain.handle('safeStorage:isAvailable', () => {
    return safeStorage.isEncryptionAvailable();
  });

  // =============== Encryption (موج ۲ / C1-C2) ===============
  ipcMain.handle('encryption:getStatus', () => ({
    driver: encryptionState.driver,
    keyStatus: encryptionState.keyStatus,
    dbEncrypted: encryptionState.dbEncrypted,
    imageEncryption: encryptionState.imageEncryption,
    migrationReport: encryptionState.migrationReport
      ? {
        tables: encryptionState.migrationReport.tablesCopied.length,
        rows: encryptionState.migrationReport.rowsCopied,
      }
      : null,
  }));

  // ابزار یک‌بارهٔ «رمزنگاری تصاویر موجود» (C2.3): فایل‌های بدون magic header
  // پیدا و رمز می‌شوند؛ فایل‌های رمزشده دست‌نخورده می‌مانند (idempotent).
  ipcMain.handle('encryption:encryptLegacyImages', async (event) => {
    const imageKey = getPurposeKey('image-aes');
    if (!imageKey) return { success: false, error: 'encryption-unavailable' };

    const imagesRoot = path.join(userDataPath, 'images');
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) files.push(full);
      }
    };
    if (fs.existsSync(imagesRoot)) walk(imagesRoot);

    // فقط ۴ بایت اول برای تشخیص legacy — خواندن کل ویدیوها فقط برای هدر هزینه‌بر است
    const legacy = [];
    for (const filePath of files) {
      try {
        const fd = fs.openSync(filePath, 'r');
        const head = Buffer.alloc(FILE_MAGIC.length);
        fs.readSync(fd, head, 0, FILE_MAGIC.length, 0);
        fs.closeSync(fd);
        if (!head.equals(FILE_MAGIC)) legacy.push(filePath);
      } catch { /* فایل قفل/ناموجود — رد می‌شود */ }
    }

    let encrypted = 0;
    const failures = [];
    for (let i = 0; i < legacy.length; i += 1) {
      const filePath = legacy[i];
      try {
        fs.writeFileSync(filePath, encryptBuffer(fs.readFileSync(filePath), imageKey));
        encrypted += 1;
      } catch (error) {
        failures.push({ file: path.basename(filePath), error: error.message });
      }
      if (i % 5 === 0 || i === legacy.length - 1) {
        try { event.sender.send('encryption:progress', { done: i + 1, total: legacy.length }); } catch { /* پنجره بسته شده */ }
      }
    }
    if (encrypted > 0 || failures.length > 0) {
      recordAudit(AUDIT_EVENTS.IMAGES_LEGACY_ENCRYPTED, 'local-user', { encrypted, failed: failures.length });
    }
    return {
      success: true,
      scanned: files.length,
      alreadyEncrypted: files.length - legacy.length,
      encrypted,
      failed: failures.length,
      failures: failures.slice(0, 20),
    };
  });

  // «کلید بازیابی» (کاهش ریسک گم شدن DEK — نقشه‌راه C1): hex کلید اصلی فقط
  // پس از احراز مجدد پسورد اپ فاش می‌شود تا کاربر آن را یک‌بار یادداشت و امن
  // نگه دارد. هر نمایش در لاگ حسابرسی ثبت می‌شود.
  ipcMain.handle('encryption:revealRecoveryKey', async (_event, { username, password } = {}) => {
    if (!dbHandlers) return { success: false, error: 'db-unavailable' };
    const dekBuffer = getDek();
    if (!dekBuffer) return { success: false, error: 'encryption-unavailable' };
    try {
      const valid = await dbHandlers.handleDbQuery('verifyCredentials', { username, password });
      if (valid !== true) return { success: false, error: 'invalid-credentials' };
    } catch (error) {
      return { success: false, error: error.message };
    }
    recordAudit(AUDIT_EVENTS.DATA_EXPORT, username || 'local-user', { purpose: 'recovery-key-reveal' });
    return { success: true, recoveryKey: dekBuffer.toString('hex') };
  });

  // =============== Backup فایل‌محور (موج ۳ / O2) ===============
  // خروجی کاملاً فایل‌محور: دیالوگ ذخیره → ساخت ZIP در main → rename اتمیک در
  // main. payload باینری دیگر مثل مسیر قدیمی (exportData → base64 → dialog:saveFile)
  // سه‌بار روی IPC رفت‌وبرگشت نمی‌کند.
  ipcMain.handle('backup:exportToPath', async (event, { backupPassword, modelBundle, defaultPath } = {}) => {
    if (!dbHandlers) return { success: false, error: 'db-unavailable' };
    const dateStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
    const fileExt = backupPassword ? 'zip.enc' : 'zip';
    // defaultPath صرفاً نقطهٔ شروع دیالوگ سیستم است (مثل پوشهٔ بکاپ انتخابی قدیمی)؛
    // مسیر نهایی همیشه تأیید خودِ کاربر در دیالوگ OS است، پس ورودی renderer فقط
    // راحتی UX است نه تصمیم امنیتی.
    const suggested = typeof defaultPath === 'string' && defaultPath.trim()
      ? defaultPath
      : `scalpai-backup-${dateStr}-${timeStr}.${fileExt}`;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: suggested,
      filters: [{ name: 'ScalpAI Backup', extensions: [backupPassword ? 'enc' : 'zip'] }],
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    allowFile(result.filePath);
    ensureParentDir(result.filePath);
    return await dbHandlers.handleDbQuery('exportDataToFile', { targetPath: result.filePath, backupPassword, modelBundle });
  });

  // بازیابی نیز متقارن فایل‌محور شد: فایل مستقیم در main خوانده می‌شود و به
  // importData می‌رسد — بدون اینکه کل آرشیو یک‌بار به renderer بیاید و برگردد.
  ipcMain.handle('backup:importFromPath', async (event, { backupPassword, retryLast } = {}) => {
    if (!dbHandlers) return { success: false, error: 'db-unavailable' };
    // retryLast: وقتی فایل رمزدار v4 انتخاب شد و renderer پسورد گرفت، دیالوگ
    // انتخاب فایل دوباره باز نمی‌شود — همان مسیر قبلی (که خود main از دیالوگ
    // سیستم گرفته و allowFile کرده) دوباره خوانده می‌شود.
    let srcPath;
    if (retryLast && lastImportFromPath) {
      srcPath = lastImportFromPath;
    } else {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'ScalpAI Backup', extensions: ['zip', 'enc', 'json'] }],
      });
      if (result.canceled || !result.filePaths?.length) return { success: false, canceled: true };
      srcPath = result.filePaths[0];
      allowFile(srcPath);
    }
    try {
      const raw = fs.readFileSync(srcPath);
      const head = raw.toString('utf-8', 0, 64);
      let payload;
      if (head.startsWith('scalpai-backup:v4:enc:base64:')) {
        if (!backupPassword) {
          // مسیر را برای تلاش بعدی (retryLast) نگه می‌داریم تا کاربر فایل را
          // دوباره انتخاب نکند — مسیر از دیالوگ خود main آمده و allowFile شده است.
          lastImportFromPath = srcPath;
          return { success: false, passwordRequired: true };
        }
        payload = raw.toString('utf-8');
      } else if (head.startsWith('{')) {
        payload = raw.toString('utf-8');
      } else {
        payload = 'scalpai-backup:v3:base64:' + raw.toString('base64');
      }
      return await dbHandlers.handleDbQuery('importData', { jsonData: payload, backupPassword });
    } catch (error) {
      // پیام خطای رمزگشایی v4 عمداً عبارت password را دارد تا renderer بدون
      // string-matching روی متن کامل، خطای پسورد را تشخیص دهد.
      const message = error && error.message ? error.message : String(error);
      const passwordError = /password|decryption failed/i.test(message);
      return { success: false, error: message, ...(passwordError ? { passwordError: true } : {}) };
    }
  });

  // =============== Auto-Updater (موج ۳ / O1) ===============
  // renderer فقط وضعیت می‌خواند/چک دستی/نصب می‌کند؛ هیچ URL یا کانفیگی از
  // renderer پذیرفته نمی‌شود (منبع آپدیت فقط publish config بیلد است).
  ipcMain.handle('updater:getState', () => {
    if (updateController) return updateController.getState();
    return { enabled: false, checking: false, updateAvailable: false, updateDownloaded: false, version: null, error: null };
  });
  ipcMain.handle('updater:checkNow', async () => {
    if (!updateController) return { ok: false, error: 'updater-unavailable' };
    return await updateController.checkNow();
  });
  ipcMain.handle('updater:quitAndInstall', async () => {
    if (!updateController || !updateController.installNow()) {
      return { ok: false, error: 'no-downloaded-update' };
    }
    return { ok: true };
  });

  // =============== Offline Analysis ===============
  ipcMain.handle('offline:analyze', async (event, { base64Image, lang }) => {
    if (!offlineHandlers) return { success: false, error: 'Offline handlers not initialized', fallback: true };
    return offlineHandlers.analyzeImage({ base64Image, lang });
  });

  ipcMain.handle('offline:checkPython', async () => {
    if (!offlineHandlers) return { scriptExists: false };
    return offlineHandlers.checkPythonAvailable();
  });

  // =============== AI Provider (هوش مصنوعی آنلاین) ===============
  // کل پیکربندی (کلید، provider، baseUrl و model) همیشه از دیتابیس در main
  // خوانده می‌شود و ورودی renderer به‌جز تصویر/prompt نادیده گرفته می‌شود.
  // دلیل: اگر baseUrl از renderer پذیرفته می‌شد، یک renderer آلوده می‌توانست
  // آدرس سرور خودش را بدهد و main کلید API را برای همان آدرس ارسال کند —
  // یعنی تضمین «کلید فقط در main» عملاً دورزدنی بود.
  async function resolveAiApiKey() {
    if (!dbHandlers?.getDecryptedAiApiKey) return null;
    return dbHandlers.getDecryptedAiApiKey();
  }

  async function resolveAiConfig() {
    const apiKey = await resolveAiApiKey();
    let settings = {};
    try {
      const result = await dbHandlers.handleDbQuery('getSettings', {});
      if (result && typeof result === 'object' && !result.error) settings = result;
    } catch (e) {
      console.warn('Could not read AI settings:', e);
    }
    return {
      apiKey,
      provider: settings.aiProvider || 'gemini',
      baseUrl: settings.aiBaseUrl || '',
      model: settings.aiModelName || '',
    };
  }

  ipcMain.handle('ai:analyze', async (event, params) => {
    const config = await resolveAiConfig();
    if (!config.apiKey) {
      return { success: false, error: 'API key not configured' };
    }
    // از renderer فقط دادهٔ تحلیل + requestId (برای لغو) پذیرفته می‌شود
    const { base64Image, mimeType, prompt, requestId } = params || {};
    // موج ۲ (C3.3) — تنها نقطهٔ خروج دادهٔ بالینی از دستگاه؛ باید رد داشته باشد.
    // detail عمداً فقط provider/model است (نه تصویر، نه prompt، نه شناسهٔ بیمار).
    recordAudit(AUDIT_EVENTS.AI_CLOUD_REQUEST, 'local-user', { provider: config.provider, model: config.model || null });
    return await aiHandlers.analyze({ ...config, base64Image, mimeType, prompt, requestId });
  });

  ipcMain.handle('ai:testConnection', async () => {
    const config = await resolveAiConfig();
    if (!config.apiKey) {
      return { success: false, error: 'API key not configured' };
    }
    return await aiHandlers.testConnection(config);
  });

  // لغو واقعی درخواست شبکه در main (نه فقط دور ریختن پاسخ در renderer)
  ipcMain.handle('ai:cancel', async (_event, { requestId } = {}) => {
    return aiHandlers.cancel(requestId);
  });
}

// =============== App Lifecycle ===============
app.whenReady().then(async () => {
  // نمونهٔ دوم: app.quit() صدا زده شده ولی whenReady هنوز اجرا می‌شود —
  // نباید دیتابیس را باز کند یا پروکسی را عوض کند.
  if (!gotSingleInstanceLock) return;

  // CSP: در production سخت‌گیرانه؛ در development برای Vite HMR / React Refresh
  // و فونت Vazirmatn از Google Fonts کمی بازتر.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    const connectSrc = isDev
      ? "connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*"
      : "connect-src 'self' https:";
    // Vite React Refresh یک inline script تزریق می‌کند؛ بدون unsafe-inline در dev می‌شکند.
    // wasm-unsafe-eval برای TensorFlow.js (مدل محلی) لازم است.
    const scriptSrc = isDev
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
      : "script-src 'self' 'wasm-unsafe-eval'";
    const csp = [
      "default-src 'self'",
      scriptSrc,
      // فونت حالا محلی است (src/assets/fonts) — دیگر نیازی به دامنه‌های Google نیست
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      connectSrc,
    ].join('; ');
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  await initDatabase();
  setupIpcHandlers();
  // موج ۱ (W1-6) — پاک‌سازی بقایای فایل‌های موقت چاپ از جلسات خراب قبلی
  cleanupStalePrintTemp();
  // فاز ۱ (AUD-8) — همان کار برای تصاویر موقت تحلیل آفلاین: هر عکس بالینی که
  // از یک جلسهٔ کرش‌کرده روی دیسک جا مانده، همین‌جا پاک می‌شود.
  cleanupStaleAnalyzeTemp();
  // فاز ۲ (AUD-12) — اعمال سیاست نگهداری ردپای حسابرسی (۲۴ ماه + سقف ۵۰٬۰۰۰).
  // یک‌بار در استارت‌آپ کافی است؛ ایندکس idx_audit_log_createdAt این را ارزان
  // می‌کند و خرابی‌اش نباید بالا آمدن اپ را متوقف کند.
  try {
    const pruned = await dbHandlers.handleDbQuery('pruneAuditLog', {});
    if (pruned && !pruned.error) {
      const removed = (pruned.removedByAge || 0) + (pruned.removedByCount || 0) + (pruned.removed || 0);
      if (removed > 0) console.log(`Audit retention: removed ${removed} expired audit entries`);
    }
  } catch (e) {
    console.warn('Audit retention pass failed (non-fatal):', e && e.message);
  }
  // پس از ری‌استارت، پوشهٔ بکاپ ذخیره‌شده را دوباره به allowlist اضافه کن
  try {
    const settings = await dbHandlers.handleDbQuery('getSettings', {});
    if (settings && typeof settings === 'object' && settings.backupPath) {
      allowDirectory(settings.backupPath);
    }
  } catch (e) {
    console.warn('Could not restore backup path allowlist:', e);
  }
  await loadProxySettings();
  createWindow();

  // راه‌اندازی آپدیت خودکار برنامه (فاز ۶)
  setupAutoUpdater();

  // اجرای زمان‌بندی بکاپ خودکار هوشمند (فاز ۶)
  runAutoBackupScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

async function runAutoBackupScheduler() {
  if (!dbHandlers) return;
  try {
    const settings = await dbHandlers.handleDbQuery('getSettings', {});
    if (!settings) return;

    const now = Date.now();
    const lastAutoBackup = parseInt(settings.lastAutoBackupTime, 10) || 0;
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - lastAutoBackup > oneDay) {
      console.log('Starting automated scheduled backup...');
      // موج ۳ (O2.3): بکاپ خودکار هم مثل بکاپ دستی مستقیم روی دیسک نوشته
      // می‌شود — مسیر قدیمی کل ZIP را یک‌بار به رشتهٔ base64 تبدیل و دوباره
      // decode می‌کرد (۲ نسخهٔ اضافه در حافظه + رفت‌وبرگشت handler).
      const autoBackupDir = path.join(userDataPath, 'auto-backups');
      if (!fs.existsSync(autoBackupDir)) {
        fs.mkdirSync(autoBackupDir, { recursive: true });
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
      const backupFileName = `scalpai-auto-backup-${dateStr}-${timeStr}.zip`;
      const backupFilePath = path.join(autoBackupDir, backupFileName);

      const exportResult = await dbHandlers.handleDbQuery('exportDataToFile', { targetPath: backupFilePath });
      if (exportResult && exportResult.success) {
        console.log('Automated scheduled backup saved to:', backupFilePath);

        // بروزرسانی زمان اجرای آخرین بکاپ خودکار
        await dbHandlers.handleDbQuery('updateSettings', { lastAutoBackupTime: String(now) });

        // پاک‌سازی: نگه داشتن حداکثر ۵ نسخه بکاپ خودکار آخر
        const files = fs.readdirSync(autoBackupDir)
          .filter(f => f.startsWith('scalpai-auto-backup-') && f.endsWith('.zip'))
          .map(f => ({ name: f, time: fs.statSync(path.join(autoBackupDir, f)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);

        if (files.length > 5) {
          for (let i = 5; i < files.length; i++) {
            fs.unlinkSync(path.join(autoBackupDir, files[i].name));
            console.log('Deleted old automated backup:', files[i].name);
          }
        }
      }
    }
  } catch (err) {
    console.error('Error during automated scheduled backup:', err);
  }
}

// =============== Auto-Updater (موج ۳ / O1) ===============
// قرارداد با renderer در electron/updater.cjs است؛ این‌جا فقط wiring واقعی است.
// نکتهٔ مهم: فقط وقتی app.isPackaged است چک می‌کنیم — چک کردن در dev ارزشی ندارد
// (هیچ latest.yml منتشرشده‌ای نسبت به نسخهٔ dev وجود ندارد) و لاگ خطای گمراه‌کننده
// می‌ساخت.
const { createAutoUpdateController } = require('./updater.cjs');
let updateController = null;

function setupAutoUpdater() {
  let autoUpdater = null;
  if (app.isPackaged) {
    try {
      ({ autoUpdater } = require('electron-updater'));
    } catch (err) {
      // اگر ماژول در بستهٔ نصبی نبود (خرابی نصب/پرت) نصب شود، اپ نباید بمیرد —
      // کنترلر خودش به حالت stub می‌افتد.
      console.warn('AutoUpdater module unavailable in packaged build:', err.message);
    }
  }
  updateController = createAutoUpdateController({
    isPackaged: app.isPackaged,
    autoUpdater,
    log: console,
    notify: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:status', status);
      }
    },
  });
  updateController.start();
  return updateController;
}

function runDbIntegrityCheck(dbInstance) {
  try {
    let lastCheckTime = 0;
    const settingRow = dbInstance.prepare("SELECT value FROM settings WHERE key = ?").get('last_integrity_check');
    if (settingRow) {
      lastCheckTime = parseInt(settingRow.value, 10) || 0;
    }

    const now = Date.now();
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    let checkResult = [];

    if (now - lastCheckTime > oneWeek) {
      console.log('Running full SQLite integrity_check...');
      checkResult = dbInstance.pragma('integrity_check');
      dbInstance.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run('last_integrity_check', String(now));
    } else {
      console.log('Running quick SQLite quick_check...');
      checkResult = dbInstance.pragma('quick_check');
    }

    const firstRowValue = checkResult && checkResult[0] ? Object.values(checkResult[0])[0] : '';
    if (firstRowValue !== 'ok') {
      const errorMsg = `پایگاه داده خراب شده است (SQLite Database Corruption).\nجزئیات: ${JSON.stringify(checkResult)}\n\nتوصیه می‌شود آخرین فایل پشتیبان (بکاپ) خود را بازیابی کنید تا از دست رفتن اطلاعات مراجعین جلوگیری شود.`;
      console.error('Database integrity check failed:', checkResult);
      dialog.showErrorBox('خطای یکپارچگی پایگاه داده', errorMsg);
    } else {
      console.log('Database integrity check passed successfully.');
    }
  } catch (error) {
    console.error('Error during database integrity check:', error);
  }
}

function closeDb() {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      console.log('WAL checkpoint (TRUNCATE) completed successfully.');
    } catch (e) {
      console.error('Error during WAL checkpoint:', e);
    }
    try {
      db.close();
      console.log('Database closed successfully.');
    } catch (e) {
      console.error('Error closing database:', e);
    }
    db = null;
  }
}

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDb();
  // فاز ۱ (AUD-8) — خروج مرتب: هیچ تصویر بالینی موقتی نباید جا بماند
  cleanupLiveTempFiles();
});
