/**
 * UpdateBanner — بنر به‌روزرسانی خودکار (موج ۳ / O1)
 * -----------------------------------------------------------------------
 * قرارداد: electron/updater.cjs وضعیت را push می‌کند (updater.onStatus) و
 * getState وضعیت لحظه‌ای است. در dev وب/disable بودن، state.enabled=false
 * است و این کامپوننت چیزی رندر نمی‌کند.
 *
 * چرا بنر و نه دانلود silent + popup: کاربر بالینی باید بداند نسخه جدید
 * آمده؛ نصب (quitAndInstall) فقط با کلیک خودش انجام می‌شود.
 */

import { useEffect, useState } from 'react';
import { DownloadCloud, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { useT, type Dict } from '../i18n';

type UpdaterStatusType = 'checking' | 'available' | 'not-available' | 'downloaded' | 'error';

interface UpdaterStatus {
  type: UpdaterStatusType;
  version?: string | null;
  error?: string | null;
}

const dict = {
  downloading: {
    fa: 'نسخهٔ جدید در حال دانلود است…',
    en: 'A new version is downloading…',
  },
  downloaded: {
    fa: 'به‌روزرسانی دانلود شد و آمادهٔ نصب است',
    en: 'Update downloaded and ready to install',
  },
  restartInstall: {
    fa: 'ری‌استارت و نصب',
    en: 'Restart & install',
  },
  later: {
    fa: 'بعداً',
    en: 'Later',
  },
  failedPrefix: {
    fa: 'بررسی به‌روزرسانی ناموفق بود',
    en: 'Update check failed',
  },
} as const satisfies Dict<UpdaterKey>;

type UpdaterKey = 'downloading' | 'downloaded' | 'restartInstall' | 'later' | 'failedPrefix';

export default function UpdateBanner() {
  const t = useT(dict);
  const [enabled, setEnabled] = useState(false);
  // آخرین رویداد معنادار؛ «error» قابل dismiss است و با رویداد بعدی جایگزین می‌شود
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const updater = window.electronAPI?.updater;
    if (!updater) return;
    let active = true;
    updater.getState()
      .then(state => {
        if (!active) return;
        setEnabled(state.enabled);
        // اگر اپ وسط دانلود/آمادهٔ نصب بود و بنر تازه mount شد، وضعیت جاری را بازسازی کن
        if (state.updateDownloaded) setStatus({ type: 'downloaded', version: state.version });
        else if (state.updateAvailable) setStatus({ type: 'available', version: state.version });
        else if (state.error) setStatus({ type: 'error', error: state.error });
      })
      .catch(() => { /* IPC failure → بنر پنهان می‌ماند */ });
    const unsubscribe = updater.onStatus((next) => {
      if (!active) return;
      setEnabled(true);
      setStatus(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (!enabled || !status) return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await window.electronAPI?.updater?.quitAndInstall();
      // در مسیر موفق، پروسه‌های main همین‌جا quit می‌شوند؛ installing می‌ماند تا spinner
    } catch {
      setInstalling(false);
    }
  };

  // «checking» و «not-available» بنر نمی‌خواهند: فقط رویدادهای عمل‌پذیر/اطلاع‌رسان
  if (status.type === 'checking' || status.type === 'not-available') return null;

  if (status.type === 'available') {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border border-blue-400/30 bg-blue-950/90 px-4 py-2.5 shadow-xl backdrop-blur text-sm text-blue-100">
        <DownloadCloud size={16} className="animate-pulse text-blue-300" />
        <span>{t('downloading')}{status.version ? ` · v${status.version}` : ''}</span>
      </div>
    );
  }

  if (status.type === 'downloaded') {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-950/90 px-4 py-2.5 shadow-xl backdrop-blur text-sm text-emerald-100">
        <RefreshCw size={16} className={installing ? 'animate-spin text-emerald-300' : 'text-emerald-300'} />
        <span>{t('downloaded')}{status.version ? ` · v${status.version}` : ''}</span>
        <button
          onClick={handleInstall}
          disabled={installing}
          className="rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 disabled:opacity-50 px-3 py-1.5 font-semibold transition"
        >
          {t('restartInstall')}
        </button>
        <button
          onClick={() => setStatus(null)}
          disabled={installing}
          className="rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-50 px-3 py-1.5 transition"
        >
          {t('later')}
        </button>
      </div>
    );
  }

  // error — آنگاه dismiss با X ولی بنر چسبان نیست (گوشه، نه وسط)
  return (
    <div className="fixed bottom-4 end-4 z-40 flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-950/90 px-4 py-2.5 shadow-xl backdrop-blur text-xs text-amber-100 max-w-md">
      <AlertTriangle size={15} className="shrink-0 text-amber-300" />
      <span className="truncate" title={status.error || undefined}>
        {t('failedPrefix')}{status.error ? `: ${status.error}` : ''}
      </span>
      <button onClick={() => setStatus(null)} className="shrink-0 rounded-lg p-1 hover:bg-white/10 transition" aria-label="dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
