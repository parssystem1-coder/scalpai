const fs = require('fs');
const path = require('path');

let logDir = '';
let logFile = '';
let originalLog = console.log;
let originalInfo = console.info;
let originalWarn = console.warn;
let originalError = console.error;

function initLogger(userDataPath) {
  logDir = path.join(userDataPath, 'logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  logFile = path.join(logDir, 'app.log');

  function rotateLogIfNeeded() {
    if (!fs.existsSync(logFile)) return;
    try {
      const stats = fs.statSync(logFile);
      const MAX_SIZE = 2 * 1024 * 1024; // 2MB

      if (stats.size >= MAX_SIZE) {
        const file4 = path.join(logDir, 'app.log.4');
        if (fs.existsSync(file4)) {
          fs.unlinkSync(file4);
        }
        for (let i = 3; i >= 1; i--) {
          const oldFile = path.join(logDir, `app.log.${i}`);
          const newFile = path.join(logDir, `app.log.${i + 1}`);
          if (fs.existsSync(oldFile)) {
            fs.renameSync(oldFile, newFile);
          }
        }
        fs.renameSync(logFile, path.join(logDir, 'app.log.1'));
      }
    } catch (err) {
      originalError('Error during log rotation:', err);
    }
  }

  function writeLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    const logLine = `[${timestamp}] [${level}] ${message}\n`;

    // Write to terminal using original console methods
    if (level === 'ERROR') originalError(logLine.trim());
    else if (level === 'WARN') originalWarn(logLine.trim());
    else if (level === 'INFO') originalInfo(logLine.trim());
    else originalLog(logLine.trim());

    // Write to rotating files
    try {
      rotateLogIfNeeded();
      fs.appendFileSync(logFile, logLine, 'utf8');
    } catch (err) {
      originalError('Failed to write to log file:', err);
    }
  }

  console.log = (...args) => writeLog('DEBUG', args);
  console.info = (...args) => writeLog('INFO', args);
  console.warn = (...args) => writeLog('WARN', args);
  console.error = (...args) => writeLog('ERROR', args);

  // Uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in Main Process:', error);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });
}

module.exports = { initLogger };
