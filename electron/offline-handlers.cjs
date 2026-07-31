/**
 * Offline Analysis Handlers - Python subprocess integration
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { parseDataUrl } = require('./db-common.cjs');

function getBundledAnalyzerPath() {
  const candidates = [
    path.join(__dirname, '../python/dist/ScalpAI-Python-Analyzer.exe'),
    path.join(process.resourcesPath || '', 'python/ScalpAI-Python-Analyzer.exe'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

function getPythonScriptPath() {
  const devPath = path.join(__dirname, '../python/analyze.py');
  if (fs.existsSync(devPath)) return devPath;
  const prodPath = path.join(process.resourcesPath || '', 'python/analyze.py');
  if (fs.existsSync(prodPath)) return prodPath;
  return devPath;
}

let cachedPythonCommand;

function findPythonCommand() {
  if (cachedPythonCommand !== undefined) return cachedPythonCommand;

  const candidates = process.platform === 'win32'
    ? ['python', 'python3', 'py']
    : ['python3', 'python'];

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ['--version'], { windowsHide: true, timeout: 5000 });
      if (!result.error && result.status === 0) {
        cachedPythonCommand = candidate;
        return candidate;
      }
    } catch (e) {
      // این دستور در دسترس نیست، بعدی را امتحان کن
    }
  }

  // هیچ‌کدام پیدا نشد؛ اولین گزینه را برمی‌گردانیم تا خطای واضح ENOENT ایجاد شود
  // و مسیر fallback به موتور مرورگر فعال گردد.
  cachedPythonCommand = candidates[0];
  return cachedPythonCommand;
}

/**
 * فاز ۱ / AUD-8 — بهداشت فایل موقت تحلیل آفلاین
 * -----------------------------------------------------------------------
 * مشکلی که این بخش حل می‌کند: برای تحلیل آفلاین، تصویر باید به‌صورت یک فایل
 * روی دیسک به پروسهٔ پایتون داده شود. تا پیش از این، آن فایل در %TEMP%
 * سیستم‌عامل (`os.tmpdir()`) نوشته می‌شد و فقط در بلوک `finally` پاک می‌شد؛
 * یعنی کرش، قطع برق یا kill شدن پروسه = ماندن دائمی عکس بالینی بیمار در یک
 * پوشهٔ عمومی. موج ۱ (W1-6) همین مشکل را برای گزارش HTML چاپ حل کرده بود
 * (`main.cjs` → `getPrintTmpDir`/`cleanupStalePrintTemp`) ولی این مسیر جا افتاد.
 *
 * تصمیم مهندسی عمدی: خودِ فایل موقت **رمزنگاری نمی‌شود**، چون پروسهٔ پایتون
 * باید بتواند آن را بخواند و کلید را نمی‌توان به آن سپرد. راه درست کوتاه‌کردن
 * عمر فایل و تضمین پاک‌سازی است، نه یک رمزنگاری نمایشی که کلیدش کنارش باشد.
 *
 * سه لایهٔ دفاعی:
 *   ۱) مسیر داخل userData (نه پوشهٔ عمومی سیستم) با مجوز محدود.
 *   ۲) پاک‌سازی بقایای جلسات قبلی هنگام استارت‌آپ اپ.
 *   ۳) تور ایمنی هنگام خروج پروسه برای فایل‌هایی که در لحظهٔ خروج باز بوده‌اند.
 */

const TEMP_DIR_NAME = 'analyze-tmp';
const TEMP_FILE_PREFIX = 'scalpai-analyze-';

/**
 * ریشهٔ userData که main هنگام راه‌اندازی تزریق می‌کند. تا وقتی تنظیم نشده،
 * رفتار قبلی (پوشهٔ موقت سیستم) حفظ می‌شود تا هیچ مسیری بی‌صدا نشکند.
 * @type {string|null}
 */
let analyzeTempRoot = null;

/** فایل‌های موقتی که همین حالا در حال استفاده‌اند — برای پاک‌سازی هنگام خروج */
const liveTempFiles = new Set();

/**
 * تعیین ریشهٔ فایل‌های موقت تحلیل (از main فراخوانی می‌شود).
 * @param {string} userDataPath
 */
function setAnalyzeTempRoot(userDataPath) {
  analyzeTempRoot = typeof userDataPath === 'string' && userDataPath ? userDataPath : null;
}

/** پوشهٔ موقت تحلیل را می‌سازد (اگر نبود) و برمی‌گرداند */
function getAnalyzeTmpDir() {
  if (!analyzeTempRoot) return os.tmpdir();
  const dir = path.join(analyzeTempRoot, TEMP_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

/**
 * لایهٔ دوم — پاک‌سازی بقایای تصاویر موقت از جلسات کرش‌کردهٔ قبلی.
 * هم‌الگوی `cleanupStalePrintTemp` در main.cjs.
 * @param {string} [userDataPath] — اگر داده نشود از ریشهٔ تنظیم‌شده استفاده می‌کند
 * @returns {{ removed: number, failed: number }}
 */
function cleanupStaleAnalyzeTemp(userDataPath) {
  const root = userDataPath || analyzeTempRoot;
  const report = { removed: 0, failed: 0 };
  if (!root) return report;
  try {
    const dir = path.join(root, TEMP_DIR_NAME);
    if (!fs.existsSync(dir)) return report;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(TEMP_FILE_PREFIX)) continue;
      try {
        fs.unlinkSync(path.join(dir, name));
        report.removed += 1;
      } catch {
        // فایل قفل‌شده یا هم‌زمان حذف‌شده — نادیده بگیر
        report.failed += 1;
      }
    }
    if (report.removed > 0) {
      console.log(`Removed ${report.removed} stale offline-analysis temp image(s)`);
    }
  } catch (err) {
    console.warn('Could not clean stale analyze temp files:', err && err.message);
  }
  return report;
}

/** لایهٔ سوم — تور ایمنی: هرچه هنگام خروج پروسه باز مانده بود پاک شود */
function cleanupLiveTempFiles() {
  for (const filePath of liveTempFiles) {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
  liveTempFiles.clear();
}

function removeTempImage(tempPath) {
  liveTempFiles.delete(tempPath);
  try {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch (err) {
    console.warn('Could not remove offline-analysis temp image:', err && err.message);
  }
}

function writeTempImage(base64Data) {
  const parsed = parseDataUrl(base64Data) || { base64: base64Data, extension: 'jpg' };
  const ext = parsed.extension === 'bin' ? 'jpg' : parsed.extension;
  const tempPath = path.join(getAnalyzeTmpDir(), `${TEMP_FILE_PREFIX}${crypto.randomUUID()}.${ext}`);
  // mode 0o600: فقط همان کاربر سیستم‌عامل بتواند بخواند (روی ویندوز بی‌اثر است
  // ولی ضرری هم ندارد؛ محافظت اصلی ویندوز از ACL پوشهٔ userData می‌آید).
  fs.writeFileSync(tempPath, parsed.base64, { encoding: 'base64', mode: 0o600 });
  liveTempFiles.add(tempPath);
  return tempPath;
}

function runPythonAnalysis(imagePath, lang = 'fa') {
  return new Promise((resolve) => {
    const bundledAnalyzer = getBundledAnalyzerPath();
    const bundled = fs.existsSync(bundledAnalyzer);
    const scriptPath = getPythonScriptPath();
    const pythonCmd = bundled ? bundledAnalyzer : findPythonCommand();
    const commandArgs = bundled ? [imagePath, lang] : [scriptPath, imagePath, lang];
    const TIMEOUT_MS = 60000;

    if (!bundled && !fs.existsSync(scriptPath)) {
      resolve({ success: false, error: 'Python analyzer script not found', fallback: true });
      return;
    }

    // The packaged analyzer is a standalone executable. Development keeps the
    // Python-script path for fast iteration; production has no Python dependency.
    const proc = spawn(pythonCmd, commandArgs, {
      windowsHide: true,
    });

    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve(result);
    };

    const killTimer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
      // اگر بعد از ۲ ثانیه هنوز زنده بود، SIGKILL
      setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL');
        } catch { /* ignore */ }
      }, 2000);
      finish({
        success: false,
        error: `Python analyzer timed out after ${TIMEOUT_MS / 1000}s`,
        fallback: true,
      });
    }, TIMEOUT_MS);

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('error', (err) => {
      finish({ success: false, error: err.message, fallback: true });
    });

    proc.on('close', (code) => {
      if (settled) return;
      if (code !== 0) {
        finish({
          success: false,
          error: stderr || stdout || `Python exited with code ${code}`,
          fallback: true,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          finish({ success: false, error: result.error, fallback: true });
          return;
        }
        finish({ success: true, data: result });
      } catch (e) {
        finish({ success: false, error: 'Invalid JSON from Python analyzer', fallback: true });
      }
    });
  });
}

function createOfflineHandlers() {
  return {
    async analyzeImage({ base64Image, lang = 'fa' }) {
      let tempPath = null;
      try {
        tempPath = writeTempImage(base64Image);
        const result = await runPythonAnalysis(tempPath, lang);
        return result;
      } finally {
        // مسیر عادی حذف؛ لایه‌های دوم و سوم (استارت‌آپ و exit) پوشش کرش را می‌دهند
        if (tempPath) removeTempImage(tempPath);
      }
    },

    async checkPythonAvailable() {
      const bundledAnalyzer = getBundledAnalyzerPath();
      const bundled = fs.existsSync(bundledAnalyzer);
      const scriptPath = getPythonScriptPath();
      return {
        scriptExists: bundled || fs.existsSync(scriptPath),
        bundled: bundled,
        scriptPath: bundled ? bundledAnalyzer : scriptPath,
        pythonCommand: bundled ? 'bundled' : findPythonCommand(),
      };
    },
  };
}

module.exports = {
  createOfflineHandlers,
  // فاز ۱ / AUD-8 — بهداشت فایل موقت (از main و از تست‌ها مصرف می‌شود)
  setAnalyzeTempRoot,
  getAnalyzeTmpDir,
  cleanupStaleAnalyzeTemp,
  cleanupLiveTempFiles,
  writeTempImage,
  removeTempImage,
  TEMP_DIR_NAME,
  TEMP_FILE_PREFIX,
};
