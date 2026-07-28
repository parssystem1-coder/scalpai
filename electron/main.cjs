/**
 * ScalpAI - Electron Main Process
 * نسخه بهینه شده با پشتیبانی از پروکسی و ماژولار بودن
 */

const { logger } = require('./logger.cjs');

const { app, BrowserWindow, ipcMain, dialog, shell, session, safeStorage, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { createDbHandlers } = require('./db-handlers.cjs');
const { createJsonDbHandlers } = require('./db-handlers-json.cjs');
const { createOfflineHandlers } = require('./offline-handlers.cjs');
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

// Database setup
let Database;
let dbLoadError = null;
try {
  Database = require('better-sqlite3');
} catch (e) {
  dbLoadError = e;
  logger.error('Failed to load better-sqlite3. The native module is likely missing or was built for the wrong Node/Electron ABI. Run "npm install" (which now rebuilds it for Electron automatically) or "npx electron-rebuild -f -w better-sqlite3".', e);
}

let mainWindow;
let db;
let dbHandlers;
let offlineHandlers;
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
const dbPath = path.join(userDataPath, 'scalpai.db');

// فاز ۰.۴ — لاگ فایل‌محور با چرخش (logs/main.log + ۵ آرشیو) تا خرابی در
// کلینیک قابل ردیابی باشد؛ console هم همچنان فعال می‌ماند.
logger.setLogDir(path.join(userDataPath, 'logs'));
process.on('uncaughtException', (error) => {
  logger.error('uncaughtException:', error);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection:', reason);
});

/**
 * تنظیم پروکسی برای session
 * @param {string} proxyUrl - آدرس پروکسی (مثلاً http://127.0.0.1:10808)
 */
async function setProxy(proxyUrl) {
  if (!proxyUrl || proxyUrl.trim() === '') {
    // غیرفعال کردن پروکسی
    await session.defaultSession.setProxy({ mode: 'direct' });
    logger.info('Proxy disabled - using direct connection');
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
    logger.info('Proxy configured:', proxyUrl);
    return { success: true, mode: 'proxy', url: proxyUrl };
  } catch (error) {
    logger.error('Failed to set proxy:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ایجاد پنجره اصلی
 */
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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
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
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
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
    logger.warn('Could not read JSON fallback file:', error);
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
      logger.warn('Could not show fallback conflict notice:', error);
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
    logger.info('JSON fallback data migrated into SQLite');
    dialog.showMessageBox(null, {
      type: 'info',
      title: 'انتقال داده / Data migrated',
      message:
        'داده‌هایی که در حالت ذخیره‌سازی جایگزین (JSON) ثبت شده بودند، با موفقیت به دیتابیس اصلی (SQLite) منتقل شدند.',
    });
  } catch (error) {
    logger.error('JSON fallback migration failed:', error);
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
 * فاز ۰.۳ — سلامت‌سنجی دوره‌ای دیتابیس.
 * `PRAGMA integrity_check` کل پایگاه را می‌خواند؛ با دیتابیس‌های بزرگ
 * چند ثانیه طول می‌کشد، پس فقط هفته‌ای یک‌بار اجرا می‌شود (نشانگر زمانی در
 * فایل کنار دیتابیس). نتیجهٔ ناموفق به‌جای کرش خاموش در آینده، همین‌جا با
 * پیام واضح فارسی گزارش می‌شود تا دادهٔ خراب قبل از بدتر شدن شناسایی شود.
 * @param {import('better-sqlite3').Database} database
 */
function runPeriodicIntegrityCheck(database) {
  const markerPath = path.join(userDataPath, '.last-integrity-check');
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  let lastRun = 0;
  try {
    lastRun = Number(fs.readFileSync(markerPath, 'utf-8')) || 0;
  } catch { /* نشانگر نیست = اولین اجرا */ }
  if (Date.now() - lastRun < WEEK_MS) return;

  try {
    const startedAt = Date.now();
    const rows = database.prepare('PRAGMA integrity_check').all();
    const ok = rows.length === 1
      && String(rows[0]?.integrity_check || '').toLowerCase() === 'ok';
    try {
      fs.writeFileSync(markerPath, String(Date.now()));
    } catch { /* نشانگر نوشته نشد مشکلی نیست */ }
    logger.info(`integrity_check finished in ${Date.now() - startedAt}ms: ${ok ? 'ok' : 'FAILED'}`);
    if (!ok) {
      logger.error('Database integrity_check FAILED:', rows);
      dialog.showMessageBox(null, {
        type: 'error',
        title: 'خطای سلامت دیتابیس / Database integrity error',
        message:
          'دیتابیس برنامه (scalpai.db) در بررسی سلامت سالم تشخیص داده نشد. ' +
          'ممکن است بخشی از داده‌ها آسیب دیده باشد.\n\n' +
          'توصیه: قبل از ادامه، از آخرین نسخهٔ پشتیبان بازیابی کنید یا پشتیبان تازه‌ای بگیرید. ' +
          'جزئیات در فایل لاگ برنامه ثبت شد.',
      });
    }
  } catch (error) {
    logger.warn('Integrity check could not run:', error);
  }
}

/**
 * راه‌اندازی دیتابیس
 */
async function initDatabase() {
  if (!Database) {
    logger.warn('better-sqlite3 unavailable, falling back to JSON file storage:', dbLoadError && dbLoadError.message);
    dbHandlers = createJsonDbHandlers(userDataPath, safeStorage);
    offlineHandlers = createOfflineHandlers();
    dialog.showMessageBox(null, {
      type: 'warning',
      title: 'حالت ذخیره‌سازی جایگزین / Fallback Storage',
      message:
        'ماژول better-sqlite3 بارگذاری نشد، بنابراین برنامه از یک فایل ذخیره‌سازی ساده (JSON) به‌جای SQLite استفاده می‌کند.\n' +
        'اطلاعات شما ذخیره خواهند شد، اما برای عملکرد کامل‌تر (SQLite) توصیه می‌شود دستور زیر را یک‌بار در پوشه برنامه اجرا کنید:\n\n' +
        'npm install\n\n' +
        'Details: ' + (dbLoadError ? dbLoadError.message : 'unknown') +
        existingSqliteDataNote(),
    });
    return null;
  }

  try {
    db = new Database(dbPath);

    // WAL: نوشتن هم‌زمان با خواندن، مقاوم‌تر در برابر بسته‌شدن ناگهانی برنامه.
    // foreign_keys: بدون این pragma، تعریف FOREIGN KEY در SQLite عملاً بی‌اثر است.
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // فاز ۰.۳ — جمع‌کردن فایل WAL در هر راه‌اندازی: بدون checkpoint دوره‌ای،
    // روی اپ‌هایی که ماه‌ها باز می‌مانند فایل -wal بزرگ و بزرگ‌تر می‌شود.
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (checkpointError) {
      logger.warn('WAL checkpoint failed:', checkpointError);
    }

    createBaseTables(db);
    runMigrations(db);

    // سلامت‌سنجی دوره‌ای (هفته‌ای یک‌بار) — بعد از migration تا روی اسکیمای نهایی اجرا شود
    runPeriodicIntegrityCheck(db);

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

    // اگر قبلاً در حالت جایگزین (JSON) داده ثبت شده، به SQLite منتقل می‌شود
    await migrateJsonFallbackIntoSqlite();

    logger.info('Database initialized at:', dbPath);
    return db;
  } catch (error) {
    logger.error('Database initialization error, falling back to JSON file storage:', error);
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
    logger.error('Error reading settings:', error);
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
        logger.error('Error saving proxy settings:', e);
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
      filters: options?.filters || [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return null;
    allowFile(result.filePath);
    if (options?.data !== undefined && options?.data !== null) {
      try {
        ensureParentDir(result.filePath);
        fs.writeFileSync(result.filePath, options.data);
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
      filters: options?.filters || [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePaths?.length) return null;
    for (const filePath of result.filePaths) allowFile(filePath);
    if (options?.readContent) {
      try {
        const filePath = result.filePaths[0];
        const content = fs.readFileSync(filePath, 'utf-8');
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
      fs.writeFileSync(safePath, data);
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

  // =============== Backup Package v3 (فاز ۰.۵) ===============
  // بکاپ پوشه‌ای استریمی: کاربر پوشهٔ مقصد را انتخاب می‌کند و main مستقیماً
  // در آن بستهٔ <name>/data.json + media/ می‌سازد — بدون عبور صدها مگابایت از
  // IPC و بدون ساخت رشتهٔ JSON غول‌پیکر در حافظه.
  ipcMain.handle('backup:export', async (_event, params) => {
    if (!dbHandlers) return { success: false, error: 'Database not initialized' };
    const preferredDir = typeof params?.defaultPath === 'string' && params.defaultPath.trim()
      ? params.defaultPath
      : app.getPath('documents');
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'پوشهٔ ذخیرهٔ نسخهٔ پشتیبان را انتخاب کنید / Choose backup folder',
      defaultPath: preferredDir,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || !filePaths?.[0]) return { success: false, canceled: true };

    const baseDir = filePaths[0];
    try {
      const result = await dbHandlers.handleDbQuery('exportBackupPackage', { baseDir });
      if (result?.error && String(result.error).startsWith('Unknown method')) {
        // حالت جایگزین (JSON): بستهٔ فایلی ندارد — همان بکاپ کلاسیک در همان پوشه نوشته می‌شود
        const classic = await dbHandlers.handleDbQuery('exportData', {});
        if (typeof classic !== 'string') return { success: false, error: 'Export failed' };
        const fileName = `scalpai-backup-${new Date().toISOString().split('T')[0]}.json`;
        const targetPath = path.join(baseDir, fileName);
        fs.writeFileSync(targetPath, classic);
        return { success: true, filePath: targetPath, legacy: true };
      }
      if (result?.error) throw new Error(result.error);
      logger.info('Backup package created at:', result.path);
      return { success: true, filePath: result.path };
    } catch (error) {
      logger.error('Backup export failed:', error);
      return { success: false, error: error.message || String(error) };
    }
  });

  // بازیابی خودکار هر دو فرمت: بستهٔ پوشه‌ای v3 (data.json + media/) یا JSON کلاسیک v2
  ipcMain.handle('backup:import', async () => {
    if (!dbHandlers) return { success: false, error: 'Database not initialized' };
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'فایل بکاپ (data.json داخل پوشهٔ بکاپ، یا فایل JSON قدیمی) / Choose backup file',
      filters: [{ name: 'ScalpAI Backup', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.[0]) return { success: false, canceled: true };

    const chosenFile = filePaths[0];
    try {
      const isPackage = path.basename(chosenFile) === 'data.json'
        && fs.existsSync(path.join(path.dirname(chosenFile), 'media'));
      const result = isPackage
        ? await dbHandlers.handleDbQuery('importDataPackage', { dataJsonPath: chosenFile })
        : await dbHandlers.handleDbQuery('importData', { jsonData: fs.readFileSync(chosenFile, 'utf-8') });
      if (result?.error && String(result.error).startsWith('Unknown method')) {
        return { success: false, error: 'این نوع بکاپ در حالت ذخیره‌سازی فعلی پشتیبانی نمی‌شود.' };
      }
      if (result?.error) throw new Error(result.error);
      return { success: true, packageImport: isPackage };
    } catch (error) {
      logger.error('Backup import failed:', error);
      return { success: false, error: error.message || String(error) };
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
    return { success: true, token, username };
  });

  ipcMain.handle('auth:validateSession', async (event, { token }) => {
    return validateSession(token);
  });

  ipcMain.handle('auth:destroySession', async (event, { token }) => {
    return destroySession(token);
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
    const tmpPath = path.join(app.getPath('temp'), `scalpai-print-${Date.now()}.html`);
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
      logger.warn('Could not read AI settings:', e);
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
  // پس از ری‌استارت، پوشهٔ بکاپ ذخیره‌شده را دوباره به allowlist اضافه کن
  try {
    const settings = await dbHandlers.handleDbQuery('getSettings', {});
    if (settings && typeof settings === 'object' && settings.backupPath) {
      allowDirectory(settings.backupPath);
    }
  } catch (e) {
    logger.warn('Could not restore backup path allowlist:', e);
  }
  await loadProxySettings();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
