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

function writeTempImage(base64Data) {
  const parsed = parseDataUrl(base64Data) || { base64: base64Data, extension: 'jpg' };
  const ext = parsed.extension === 'bin' ? 'jpg' : parsed.extension;
  const tempPath = path.join(os.tmpdir(), `scalpai-${crypto.randomUUID()}.${ext}`);
  fs.writeFileSync(tempPath, parsed.base64, 'base64');
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
        if (tempPath && fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
        }
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

module.exports = { createOfflineHandlers };
