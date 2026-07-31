/**
 * موج ۳ (O1) — کنترلر به‌روزرسانی خودکار (قابل‌تست با dependency injection).
 *
 * چرا ماژول جدا؟ main.cjs قبلاً `require('electron-updater')` را داخل یک
 * try/catch بلع می‌کرد و فقط console.log می‌کرد؛ یعنی در production هیچ UI نبود
 * و در dev هم ممکن بود بی‌صدا بشکند. این کنترلر:
 *  - در dev/نامشهود (isPackaged=false یا نبود autoUpdater) «stub» است تا renderer
 *    بتواند همیشه با یک قرارداد ثابت کار کند و بنر آپدیت را پنهان کند.
 *  - وضعیت را به‌صورت push به renderer می‌فرستد (notify) تا بنر فارسی نمایش داده شود.
 *  - برای تست واحد هیچ وابستگی سخت‌کد شده به electron/electron-updater ندارد.
 *
 * سیاست دانلود: autoDownload پیش‌فرض electron-updater (true) حفظ می‌شود — یعنی
 * روی نسخه‌های بدون امضای کد هم فقط «دانلود و اطلاع‌رسانی» رخ می‌دهد و نصب نهایی
 * با تأیید کاربر از بنر است (متناظر تصمیم O1 نقشه‌راه).
 */

// تأخیر اولین چک خودکار تا لانچ گیر نکند و شبکه/پروکسی بالا بیاید.
const UPDATE_CHECK_DELAY_MS = 15_000;

function disabledState() {
  return {
    enabled: false,
    checking: false,
    updateAvailable: false,
    updateDownloaded: false,
    version: null,
    error: null,
  };
}

/**
 * @param {{
 *   isPackaged: boolean,
 *   autoUpdater: object | null,
 *   notify?: (status: { type: string, version?: string|null, error?: string|null }) => void,
 *   log?: { info?: Function, warn?: Function, error?: Function },
 *   checkDelayMs?: number,
 *   setTimeoutFn?: typeof setTimeout,
 * }} deps
 */
function createAutoUpdateController({ isPackaged, autoUpdater = null, notify = () => {}, log = console, checkDelayMs = UPDATE_CHECK_DELAY_MS, setTimeoutFn = setTimeout }) {
  // محیط توسعه/تست: قرارداد ثابت بدون هیچ فراخوانی شبکه‌ای.
  if (!isPackaged || !autoUpdater) {
    return {
      getState: () => disabledState(),
      start: () => {},
      checkNow: async () => ({ ok: false, error: 'updates-disabled' }),
      installNow: () => false,
      _dispose: () => {},
    };
  }

  const state = {
    enabled: true,
    checking: false,
    updateAvailable: false,
    updateDownloaded: false,
    version: null,
    error: null,
  };

  const emit = (type, extra = {}) => {
    try {
      notify({ type, ...extra });
    } catch (err) {
      log.warn?.(`updater: notify failed: ${err.message}`);
    }
  };

  const onChecking = () => {
    state.checking = true;
    state.error = null;
    emit('checking');
  };

  const onUpdateAvailable = (info) => {
    state.checking = false;
    state.updateAvailable = true;
    state.version = info?.version || null;
    state.error = null;
    log.info?.(`updater: update available ${state.version || ''}`.trim());
    emit('available', { version: state.version });
  };

  const onUpdateNotAvailable = () => {
    state.checking = false;
    state.updateAvailable = false;
    emit('not-available');
  };

  const onUpdateDownloaded = (info) => {
    state.checking = false;
    state.updateDownloaded = true;
    state.version = info?.version || state.version;
    log.info?.('updater: update downloaded; waiting for user to install');
    emit('downloaded', { version: state.version });
  };

  const onError = (err) => {
    state.checking = false;
    state.error = err?.message || String(err);
    log.error?.(`updater: error: ${state.error}`);
    emit('error', { error: state.error });
  };

  // download-progress عمداً به renderer نمی‌رود: IPC هر چند صدم‌ثانیه spam
  // می‌شد؛ وضعیت «available» یعنی «در حال دانلود» و برای بنر همین کافی است.

  autoUpdater.on('checking-for-update', onChecking);
  autoUpdater.on('update-available', onUpdateAvailable);
  autoUpdater.on('update-not-available', onUpdateNotAvailable);
  autoUpdater.on('update-downloaded', onUpdateDownloaded);
  autoUpdater.on('error', onError);

  const safeCheck = async () => {
    try {
      state.checking = true;
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      state.checking = false;
      state.error = err?.message || String(err);
      onError(err);
      return { ok: false, error: state.error };
    }
  };

  return {
    getState: () => ({ ...state }),
    /** اولین چک خودکار با تأخیر کوتاه بعد از لانچ؛ unref تا خروج app گیر نکند. */
    start: () => {
      const timer = setTimeoutFn(() => { void safeCheck(); }, checkDelayMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
    },
    /** چک دستی کاربر (مثلاً از تنظیمات) — نتیجه promise برمی‌گردد. */
    checkNow: () => safeCheck(),
    /** نصب آپدیت دانلودشده و ری‌استارت؛ بدون دانلود موفق false برمی‌گردد. */
    installNow: () => {
      if (!state.updateDownloaded) return false;
      // forceRunAfter: بعد از نصب، نسخهٔ جدید همانجا باز شود.
      autoUpdater.quitAndInstall(false, true);
      return true;
    },
    /** فقط برای تست: قطع listeners تا instanceها به هم نچسبند. */
    _dispose: () => {
      autoUpdater.off('checking-for-update', onChecking);
      autoUpdater.off('update-available', onUpdateAvailable);
      autoUpdater.off('update-not-available', onUpdateNotAvailable);
      autoUpdater.off('update-downloaded', onUpdateDownloaded);
      autoUpdater.off('error', onError);
    },
  };
}

module.exports = { createAutoUpdateController, UPDATE_CHECK_DELAY_MS };
