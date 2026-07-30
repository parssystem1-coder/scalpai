/**
 * EncryptionPanel — وضعیت رمزنگاری دادهٔ در سکون + ابزار مهاجرت تصاویر (موج ۲ / C1-C2)
 * -----------------------------------------------------------------------
 * - نمایش وضعیت واقعی (درایور، رمز بودن دیتابیس، رمز تصاویر) از main —
 *   نه تخمین از renderer.
 * - ابزار یک‌بارهٔ «رمزنگاری تصاویر قدیمی»: فایل‌های رمزنشدهٔ روی دیسک
 *   پیدا و با کلید این دستگاه رمز می‌شوند (idempotent، با گزارش پیشرفت).
 */

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ShieldAlert, KeyRound, Database, Image as ImageIcon, Loader } from 'lucide-react';
import { encryptionUtils } from '../../db';
import { useT, type Dict } from '../../i18n';

type EncKey =
  | 'encTitle' | 'encDbEncrypted' | 'encDbPlain' | 'encImagesOn' | 'encImagesOff'
  | 'encDriverLabel' | 'encMigrated' | 'encUnavailable' | 'encWebNote'
  | 'encryptLegacyBtn' | 'encryptLegacyRunning' | 'encryptLegacyHint'
  | 'encLegacyDone' | 'encLegacyNothing' | 'encLegacyFailed' | 'encKeyError'
  | 'recoveryBtn' | 'recoveryHint' | 'recoveryLoginHint' | 'usernameLabel'
  | 'passwordLabel' | 'recoveryInvalid' | 'recoveryHide';

const dict = {
  encTitle: { fa: 'رمزنگاری دادهٔ در سکون', en: 'Data-at-Rest Encryption' },
  encDbEncrypted: { fa: 'دیتابیس: رمزنگاری‌شده (SQLCipher)', en: 'Database: encrypted (SQLCipher)' },
  encDbPlain: { fa: 'دیتابیس: رمزنگاری نشده', en: 'Database: NOT encrypted' },
  encImagesOn: { fa: 'تصاویر جدید: رمزنگاری‌شده (AES-256-GCM)', en: 'New images: encrypted (AES-256-GCM)' },
  encImagesOff: { fa: 'تصاویر جدید: رمزنگاری نشده', en: 'New images: NOT encrypted' },
  encDriverLabel: { fa: 'درایور SQLite', en: 'SQLite driver' },
  encMigrated: { fa: 'مهاجرت دیتابیس این دستگاه انجام شد', en: 'This device database was migrated' },
  encUnavailable: {
    fa: 'رمزنگاری در این اجرا فعال نیست (safeStorage سیستم‌عامل یا درایور SQLCipher در دسترس نیست) — برنامه مثل قبل کار می‌کند ولی داده رمز نمی‌شود.',
    en: 'Encryption is inactive in this run (OS safeStorage or SQLCipher driver unavailable) — the app works as before but data is not encrypted.',
  },
  encWebNote: {
    fa: 'نسخهٔ وب: داده در IndexedDB مرورگر شماست؛ رمزنگاری در سطح دسکتاپ (Electron) اعمال می‌شود.',
    en: 'Web version: data lives in your browser IndexedDB; at-rest encryption applies to the desktop (Electron) app.',
  },
  encryptLegacyBtn: { fa: 'رمزنگاری تصاویر قدیمی روی دیسک', en: 'Encrypt existing images on disk' },
  encryptLegacyRunning: { fa: 'در حال رمزنگاری تصاویر...', en: 'Encrypting images...' },
  encryptLegacyHint: {
    fa: 'تصاویر ذخیره‌شده قبل از فعال شدن رمزنگاری را پیدا و فقط آن‌ها را رمز می‌کند (امن برای اجرای مجدد).',
    en: 'Finds and encrypts only images stored before encryption was enabled (safe to re-run).',
  },
  encLegacyDone: { fa: 'رمزنگاری شد', en: 'encrypted' },
  encLegacyNothing: { fa: 'همهٔ تصاویر از قبل رمز بودند — کاری لازم نبود.', en: 'All images were already encrypted — nothing to do.' },
  encLegacyFailed: { fa: 'ناموفق', en: 'failed' },
  encKeyError: { fa: 'کلید رمزنگاری در دسترس نیست', en: 'Encryption key unavailable' },
  recoveryBtn: { fa: 'نمایش کلید بازیابی', en: 'Show recovery key' },
  recoveryHint: {
    fa: 'با این کلید می‌توان دیتابیس/تصاویر رمزشدهٔ این دستگاه را باز کرد. آن را یک‌بار روی کاغذ یادداشت و در جای امن نگه دارید؛ نمایش در لاگ حسابرسی ثبت می‌شود.',
    en: 'This key can decrypt this device\'s database/images. Write it down once and keep it somewhere safe; each reveal is recorded in the audit log.',
  },
  recoveryLoginHint: { fa: 'برای نمایش، ورود اپ را دوباره تأیید کنید', en: 'Re-confirm your app login to reveal' },
  usernameLabel: { fa: 'نام کاربری', en: 'Username' },
  passwordLabel: { fa: 'پسورد', en: 'Password' },
  recoveryInvalid: { fa: 'نام کاربری یا پسورد اشتباه است', en: 'Invalid username or password' },
  recoveryHide: { fa: 'پنهان کردن کلید', en: 'Hide key' },
} as const satisfies Dict<EncKey>;

interface EncStatus {
  driver: string;
  keyStatus: string;
  dbEncrypted: boolean;
  imageEncryption: boolean;
  migrationReport: { tables: number; rows: number } | null;
}

interface LegacyResult {
  success: boolean;
  error?: string;
  encrypted?: number;
  alreadyEncrypted?: number;
  failed?: number;
}

export default function EncryptionPanel() {
  const t = useT(dict);
  const [status, setStatus] = useState<EncStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<LegacyResult | null>(null);
  // کلید بازیابی (نمایش پس از احراز مجدد)
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryUser, setRecoveryUser] = useState('');
  const [recoveryPass, setRecoveryPass] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    encryptionUtils.getStatus().then(s => {
      if (!mounted.current) return;
      setStatus(s as EncStatus | null);
      setLoaded(true);
    }).catch(() => setLoaded(true));
    return () => { mounted.current = false; };
  }, []);

  if (!encryptionUtils.isElectron) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-white/50">
        {t('encWebNote')}
      </div>
    );
  }
  if (!loaded) return null;

  const active = status?.imageEncryption && status?.dbEncrypted;
  const StatusIcon = active ? ShieldCheck : ShieldAlert;

  const revealKey = async () => {
    setRecoveryError('');
    const r = await encryptionUtils.revealRecoveryKey(recoveryUser, recoveryPass);
    if (!mounted.current) return;
    if (r?.success && r.recoveryKey) {
      setRecoveryKey(r.recoveryKey);
      setRecoveryPass('');
    } else {
      setRecoveryError(t('recoveryInvalid'));
    }
  };

  const runLegacyEncryption = async () => {
    setRunning(true);
    setResult(null);
    setProgress(null);
    try {
      const r = await encryptionUtils.encryptLegacyImages(p => setProgress(p));
      if (mounted.current) setResult(r);
      const fresh = await encryptionUtils.getStatus();
      if (mounted.current) setStatus(fresh as EncStatus | null);
    } finally {
      if (mounted.current) {
        setRunning(false);
        setProgress(null);
      }
    }
  };

  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <StatusIcon size={18} className={active ? 'text-emerald-400' : 'text-yellow-400'} />
        <h4 className="font-semibold text-sm">{t('encTitle')}</h4>
      </div>

      <ul className="space-y-1.5 text-xs text-white/75">
        <li className="flex items-center gap-2">
          <Database size={13} className={status?.dbEncrypted ? 'text-emerald-400' : 'text-yellow-400'} />
          <span>{status?.dbEncrypted ? t('encDbEncrypted') : t('encDbPlain')}</span>
        </li>
        <li className="flex items-center gap-2">
          <ImageIcon size={13} className={status?.imageEncryption ? 'text-emerald-400' : 'text-yellow-400'} />
          <span>{status?.imageEncryption ? t('encImagesOn') : t('encImagesOff')}</span>
        </li>
        <li className="flex items-center gap-2 opacity-60">
          <KeyRound size={13} />
          <span dir="ltr">{t('encDriverLabel')}: {status?.driver || '—'}</span>
        </li>
        {status?.migrationReport && (
          <li className="text-emerald-300/90" dir="ltr">
            ✓ {t('encMigrated')} ({status.migrationReport.tables} tables / {status.migrationReport.rows} rows)
          </li>
        )}
      </ul>

      {!status?.imageEncryption && (
        <p className="text-xs text-yellow-200/80 leading-5">{t('encUnavailable')}</p>
      )}

      {status?.imageEncryption && (
        <div className="space-y-2 pt-1 border-t border-white/10">
          {/* کلید بازیابی — کاهش ریسک گم شدن DEK (نقشه‌راه C1) */}
          {!recoveryKey && !showRecoveryForm && (
            <button
              type="button"
              onClick={() => setShowRecoveryForm(true)}
              className="text-xs text-white/60 hover:text-white/90 transition underline underline-offset-4"
            >
              {t('recoveryBtn')}
            </button>
          )}
          {showRecoveryForm && !recoveryKey && (
            <div className="space-y-2">
              <p className="text-xs text-white/55">{t('recoveryLoginHint')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={recoveryUser}
                  onChange={e => setRecoveryUser(e.target.value)}
                  placeholder={t('usernameLabel')}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-emerald-400 focus:outline-none text-xs"
                  dir="ltr"
                />
                <input
                  type="password"
                  value={recoveryPass}
                  onChange={e => setRecoveryPass(e.target.value)}
                  placeholder={t('passwordLabel')}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-emerald-400 focus:outline-none text-xs"
                  dir="ltr"
                  onKeyDown={e => { if (e.key === 'Enter') revealKey(); }}
                />
              </div>
              {recoveryError && <p className="text-xs text-red-300">{recoveryError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={revealKey}
                  disabled={!recoveryUser || !recoveryPass}
                  className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/30 transition text-xs font-semibold disabled:opacity-50"
                >
                  {t('recoveryBtn')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowRecoveryForm(false); setRecoveryError(''); setRecoveryPass(''); }}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 transition text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
          {recoveryKey && (
            <div className="space-y-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
              <p className="text-xs text-yellow-200/85 leading-5">{t('recoveryHint')}</p>
              <code className="block text-xs break-all rounded bg-black/40 p-2 text-yellow-100 select-all" dir="ltr">
                {recoveryKey}
              </code>
              <button
                type="button"
                onClick={() => { setRecoveryKey(null); setShowRecoveryForm(false); setRecoveryUser(''); }}
                className="text-xs text-white/60 hover:text-white/90 transition underline underline-offset-4"
              >
                {t('recoveryHide')}
              </button>
            </div>
          )}

          <p className="text-xs text-white/55 leading-5">{t('encryptLegacyHint')}</p>
          {progress && (
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" dir="ltr">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{ width: progress.total ? `${Math.round((progress.done / progress.total) * 100)}%` : '0%' }}
              />
            </div>
          )}
          <button
            type="button"
            onClick={runLegacyEncryption}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition text-xs font-semibold disabled:opacity-50"
          >
            {running && <Loader size={14} className="animate-spin" />}
            <span>{running ? t('encryptLegacyRunning') : t('encryptLegacyBtn')}</span>
          </button>
          {result && !result.success && (
            <p className="text-xs text-red-300">{result.error === 'encryption-unavailable' ? t('encKeyError') : result.error}</p>
          )}
          {result?.success && (
            <p className="text-xs text-emerald-300/90" dir="ltr">
              {result.encrypted === 0 && (result.failed ?? 0) === 0
                ? t('encLegacyNothing')
                : `${t('encLegacyDone')}: ${result.encrypted}${(result.failed ?? 0) > 0 ? ` — ${t('encLegacyFailed')}: ${result.failed}` : ''}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
