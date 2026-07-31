import { useEffect, useState } from 'react';
import { Globe, Palette, Database, Download, Upload, FolderOpen, Sparkles, Bot, Lock, BrainCircuit } from 'lucide-react';
import { useSettingsStore } from '../../store';
import { electronUtils, db, encryptionUtils } from '../../db';
import type { LocalModelMetadata } from '../../db';
import type { LocalModelBackupBundle } from '../../lib/modelBundle';
import { useT, usePick } from '../../i18n';
import { settingsDict } from './strings';
import type { Notify } from './types';
import EncryptionPanel from './EncryptionPanel';

const V3_PREFIX = 'scalpai-backup:v3:base64:';
const V4_PREFIX = 'scalpai-backup:v4:enc:base64:';
const MIN_BACKUP_PASSWORD_LENGTH = 8;

const THEME_OPTIONS = [
  {
    theme: 'dark' as const,
    labelKey: 'themeDark' as const,
    activeClass: 'ring-2 ring-blue-400 scale-105 shadow-lg shadow-blue-500/20',
    baseClass: 'bg-gray-800 text-white',
    glowClass: 'from-gray-900/50',
    dotClass: null,
  },
  {
    theme: 'blue' as const,
    labelKey: 'themeBlue' as const,
    activeClass: 'ring-2 ring-cyan-400 scale-105 shadow-lg shadow-cyan-500/30',
    baseClass: 'bg-gradient-to-br from-blue-900 via-blue-800 to-cyan-900 text-white',
    glowClass: 'from-cyan-500/20',
    dotClass: 'bg-cyan-400',
  },
  {
    theme: 'purple' as const,
    labelKey: 'themePurple' as const,
    activeClass: 'ring-2 ring-violet-400 scale-105 shadow-lg shadow-violet-500/30',
    baseClass: 'bg-gradient-to-br from-violet-900 via-indigo-900 to-purple-900 text-white',
    glowClass: 'from-violet-500/20',
    dotClass: 'bg-violet-400',
  },
  {
    theme: 'cyber' as const,
    labelKey: 'themeMint' as const,
    activeClass: 'ring-2 ring-teal-400 scale-105 shadow-lg shadow-teal-400/40',
    baseClass: 'bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-teal-50 border border-teal-400/25',
    glowClass: 'from-teal-400/20',
    dotClass: 'bg-teal-400',
  },
  {
    theme: 'neural' as const,
    labelKey: 'themeNeural' as const,
    activeClass: 'ring-2 ring-fuchsia-400 scale-105 shadow-lg shadow-fuchsia-500/40',
    baseClass: 'bg-gradient-to-br from-slate-950 via-teal-950 to-fuchsia-950 text-white border border-fuchsia-400/30',
    glowClass: 'from-fuchsia-500/25',
    dotClass: 'bg-gradient-to-r from-teal-400 to-fuchsia-400',
  },
  {
    theme: 'mintAi' as const,
    labelKey: 'themeMintAi' as const,
    activeClass: 'ring-2 ring-emerald-300 scale-105 shadow-lg shadow-cyan-400/40',
    baseClass: 'bg-gradient-to-br from-emerald-950 via-teal-900 to-cyan-950 text-emerald-50 border border-emerald-300/30',
    glowClass: 'from-emerald-400/25',
    dotClass: 'bg-gradient-to-r from-emerald-300 via-teal-300 to-cyan-300',
  },
];

export default function GeneralTab({ notify }: { notify: Notify }) {
  const { settings, updateSettings, exportData, importData } = useSettingsStore();
  const t = useT(settingsDict);
  const pick = usePick();

  const [backupDirHandle, setBackupDirHandle] = useState<FileSystemDirectoryHandle | null>(null);

  // موج ۲ (C2.4) — گزینهٔ «پشتیبان رمزدار با پسورد» (فقط Electron؛ بک‌اند وب فعلاً بدون رمز)
  const [useBackupPassword, setUseBackupPassword] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupPasswordConfirm, setBackupPasswordConfirm] = useState('');
  // وقتی فایل انتخابی برای بازیابی رمزدار v4 بود، payload اینجا نگه داشته می‌شود تا پسورد گرفته شود
  const [pendingEncryptedImport, setPendingEncryptedImport] = useState<string | null>(null);
  // موج ۳ (O2): در جریان فایل‌محور Electron payload نگه داشته نمی‌شود؛ main با
  // retryLast همان فایل را دوباره می‌خواند — این فلگ فقط پنل پسورد را باز نگه می‌دارد.
  const [pendingElectronImport, setPendingElectronImport] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  // موج ۳ (O3): مدل محلی به‌صورت اختیاری داخل بکاپ قرار می‌گیرد
  const [includeModelInBackup, setIncludeModelInBackup] = useState(true);
  const [transferBusy, setTransferBusy] = useState(false);

  /**
   * فاز ۱ (AUD-9) — وقتی لایهٔ رمزنگاری فعال است، بکاپ بدون پسورد ممنوع است.
   * دلیل: کلید تصاویر داخل خودِ بستهٔ پشتیبان قرار می‌گیرد، پس فایل بدون پسورد
   * معادل دادهٔ کاملاً باز است. گیت واقعی در main-process است
   * (`db-common.cjs::assertBackupPasswordWhenEncryptionActive`)؛ این پرچم فقط
   * تجربهٔ کاربری را با آن هماهنگ می‌کند تا کاربر به خطای بعد از کلیک نخورد.
   */
  const [passwordMandatory, setPasswordMandatory] = useState(false);

  useEffect(() => {
    let alive = true;
    encryptionUtils.getStatus()
      .then(status => {
        if (!alive || !status) return;
        const mandatory = Boolean(status.imageEncryption || status.dbEncrypted);
        setPasswordMandatory(mandatory);
        if (mandatory) setUseBackupPassword(true);
      })
      .catch(() => { /* وضعیت رمز در دسترس نیست — گیت main همچنان برقرار است */ });
    return () => { alive = false; };
  }, []);

  const validateBackupPassword = (): string | null => {
    if (!useBackupPassword) return null;
    if (backupPassword.length < MIN_BACKUP_PASSWORD_LENGTH) return t('backupPasswordShort');
    if (backupPassword !== backupPasswordConfirm) return t('backupPasswordMismatch');
    return null;
  };

  /**
   * موج ۳ (O3): مدل خوانده‌شده از بکاپ به‌عنوان «چلنجر» پارک می‌شود — هرگز
   * مستقیم جایگزین مدل فعال نمی‌شود. decide نهایی با کارت چلنجر در تب یادگیری
   * ماشین است. خروجی boolean تا پیام نهایی (alert) قابل تنظیم باشد.
   */
  const stageImportedModelAsChallenger = async (bundle: LocalModelBackupBundle): Promise<boolean> => {
    try {
      const localModel = await import('../../lib/localModel');
      await localModel.stageBundleAsChallenger(bundle);
      await updateSettings({
        localModelChallenger: {
          stagedAt: new Date().toISOString(),
          featureVersion: bundle.featureVersion ?? null,
          metadata: (bundle.metadata as LocalModelMetadata | null) ?? null,
        },
      });
      return true;
    } catch (error) {
      console.error('Challenger staging failed:', error);
      return false;
    }
  };

  /** انتهای جریان بازیابی موفق: پارک مدل (در صورت وجود) + تأیید + reload */
  const finishSuccessfulImport = async (importedModel: LocalModelBackupBundle | null | undefined) => {
    let suffix = '';
    if (importedModel) {
      const staged = await stageImportedModelAsChallenger(importedModel);
      suffix = '\n' + t(staged ? 'modelStagedAsChallenger' : 'modelImportRejected');
    }
    alert(t('restoreSuccess') + suffix);
    window.location.reload();
  };

  const importWithOptionalPassword = async (payload: string) => {
    if (payload.startsWith(V4_PREFIX)) {
      setPendingEncryptedImport(payload);
      return;
    }
    const report = await importData(payload);
    await finishSuccessfulImport(report?.importedModel);
  };

  // موج ۳ (O2): بازیابی فایل‌محور در Electron — فایل در main خوانده می‌شود و
  // دیگر کل آرشیو به‌صورت رشته بین renderer و main دست‌به‌دست نمی‌شود.
  const importFromElectronPath = async (options: { backupPassword?: string; retryLast?: boolean }) => {
    if (!window.electronAPI?.backup) return;
    setTransferBusy(true);
    try {
      const result = await window.electronAPI.backup.importFromPath(options);
      if (!result || result.canceled) return;
      if (result.passwordRequired) {
        setPendingElectronImport(true);
        return;
      }
      if (!result.success) {
        console.error('Import from path failed:', result.error);
        notify('error', result.passwordError ? t('wrongBackupPassword') : t('restoreError'));
        return;
      }
      setPendingElectronImport(false);
      setImportPassword('');
      await finishSuccessfulImport(result.importedModel);
    } catch (error) {
      console.error('Import from path error:', error);
      notify('error', t('restoreError'));
    } finally {
      setTransferBusy(false);
    }
  };

  const completeEncryptedImport = async () => {
    // جریان فایل‌محور Electron: همان فایل قبلی با پسورد دوباره خوانده می‌شود
    if (pendingElectronImport) {
      await importFromElectronPath({ backupPassword: importPassword, retryLast: true });
      return;
    }
    if (!pendingEncryptedImport) return;
    try {
      const report = await importData(pendingEncryptedImport, { backupPassword: importPassword });
      setPendingEncryptedImport(null);
      setImportPassword('');
      await finishSuccessfulImport(report?.importedModel);
    } catch (error) {
      console.error('Encrypted import error:', error);
      notify('error', t('wrongBackupPassword'));
    }
  };

  /** موج ۳ (O3): بستهٔ مدل فعال محلی — بدون مدل یا با خطا، null (بکاپ بدون مدل معتبر است) */
  const buildModelBundle = async (): Promise<LocalModelBackupBundle | null> => {
    try {
      const localModel = await import('../../lib/localModel');
      const metadata = await db.getModelMetadata();
      return await localModel.exportActiveModelBundle(metadata);
    } catch (error) {
      console.warn('Model bundle export skipped (no local model or unreadable):', error);
      return null;
    }
  };

  // انتخاب پوشه بکاپ — در Electron با دیالوگ سیستم، در وب با File System Access API
  const selectBackupDirectory = async () => {
    try {
      if (electronUtils.isElectron) {
        const result = await electronUtils.selectDirectory();
        if (result && result.length > 0) {
          const selectedPath = result[0];
          await updateSettings({ backupPath: selectedPath });
          notify('success', pick(`پوشه ذخیره‌سازی انتخاب شد: ${selectedPath}`, `Backup folder selected: ${selectedPath}`));
        }
      } else if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        setBackupDirHandle(dirHandle);
        await updateSettings({ backupPath: dirHandle.name });
        notify('success', t('folderSelected'));
      } else {
        notify('error', t('folderNotSupported'));
      }
    } catch (error) {
      // لغو دیالوگ توسط کاربر (AbortError) خطا محسوب نمی‌شود
      if (!(error instanceof DOMException) || error.name !== 'AbortError') {
        console.error('Error selecting directory:', error);
      }
    }
  };

  const handleExport = async () => {
    const passwordError = validateBackupPassword();
    if (passwordError) {
      notify('error', passwordError);
      return;
    }
    setTransferBusy(true);
    try {
      // موج ۳ (O3): مدل محلی — در هر دو بک‌اند (Electron ZIP / وب JSON) قابل تعبیه است
      const modelBundle = includeModelInBackup ? await buildModelBundle() : null;

      // موج ۳ (O2): مسیر فایل‌محور Electron — دیالوگ و ZIP‌سازی هر دو در main؛
      // هیچ payload باینری‌ای از IPC عبور نمی‌کند (سه کپی حافظه/IPC مسیر قدیمی حذف شد).
      if (electronUtils.isElectron && window.electronAPI?.backup) {
        const now = new Date();
        const fileName = `scalpai-backup-${now.toISOString().split('T')[0]}-${now.toTimeString().split(' ')[0].replace(/:/g, '-')}.${useBackupPassword ? 'zip.enc' : 'zip'}`;
        const result = await window.electronAPI.backup.exportToPath({
          backupPassword: useBackupPassword ? backupPassword : undefined,
          modelBundle,
          defaultPath: settings.backupPath ? `${settings.backupPath}/${fileName}` : undefined,
        });
        if (result?.canceled) return;
        if (!result?.success) {
          console.error('Export to path failed:', result?.error);
          // فاز ۱ (AUD-9): گیت main-process رد کرده — پیام دقیق به‌جای خطای کلی
          if (typeof result?.error === 'string' && result.error.includes('backup-password-required')) {
            setPasswordMandatory(true);
            setUseBackupPassword(true);
            notify('error', t('backupPasswordMandatory'));
            return;
          }
          notify('error', t('backupExportError'));
          return;
        }
        const sizeMb = result.bytes ? `${(result.bytes / (1024 * 1024)).toFixed(1)} MB` : '';
        notify('success', pick(
          `فایل ذخیره شد: ${result.filePath}${sizeMb ? ` (${sizeMb})` : ''}`,
          `File saved: ${result.filePath}${sizeMb ? ` (${sizeMb})` : ''}`,
        ));
        return;
      }

      const data = await exportData({ modelBundle });
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      let fileName = `scalpai-backup-${dateStr}-${timeStr}.json`;
      let isZip = false;
      let zipBase64 = '';

      if (typeof data === 'string' && data.startsWith(V3_PREFIX)) {
        fileName = `scalpai-backup-${dateStr}-${timeStr}.zip`;
        isZip = true;
        zipBase64 = data.split(V3_PREFIX)[1];
      } else if (typeof data === 'string' && data.startsWith(V4_PREFIX)) {
        // بکاپ رمزدار v4 — محتوا رشتهٔ متنی prefix است (ZIP رمزشده نمی‌تواند باز شود)
        fileName = `scalpai-backup-${dateStr}-${timeStr}.zip.enc`;
      }

      // وب با پوشهٔ انتخاب‌شده از File System Access API
      if (backupDirHandle) {
      try {
        const fileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        if (isZip) {
          const binaryString = window.atob(zipBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          await writable.write(bytes);
        } else {
          await writable.write(data);
        }
        await writable.close();
        notify('success', pick(`فایل در پوشه ${backupDirHandle.name} ذخیره شد`, `File saved to ${backupDirHandle.name}`));
        return;
      } catch (error) {
        console.error('Error saving to directory:', error);
      }
    }

      // fallback: دانلود معمولی مرورگر
      let blob;
      if (isZip) {
        const binaryString = window.atob(zipBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        blob = new Blob([bytes], { type: 'application/zip' });
      } else {
        blob = new Blob([data], { type: 'application/json' });
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Backup export error:', error);
      // فاز ۱ (AUD-9): همان گیت در مسیر غیرفایل‌محور (exportData) هم اعمال می‌شود
      if (error instanceof Error && error.message.includes('backup-password-required')) {
        setPasswordMandatory(true);
        setUseBackupPassword(true);
        notify('error', t('backupPasswordMandatory'));
      } else {
        notify('error', t('backupExportError'));
      }
    } finally {
      setTransferBusy(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let importPayload = ev.target?.result as string;
        if (file.name.endsWith('.zip')) {
          const base64Data = importPayload.split('base64,')[1];
          importPayload = `${V3_PREFIX}${base64Data}`;
        }
        await importWithOptionalPassword(importPayload);
      } catch (error) {
        console.error('Import error:', error);
        alert(t('restoreError'));
      }
    };
    if (file.name.endsWith('.zip')) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  };

  // Electron: بازیابی فایل‌محور — انتخاب فایل، خواندن و import همه در main؛
  // payload باینری از IPC عبور نمی‌کند (موج ۳ / O2).
  const handleImportFromBackupPath = async () => {
    if (!electronUtils.isElectron || !window.electronAPI?.backup) return;
    await importFromElectronPath({});
  };

  return (
    <div className="space-y-6">
      {/* Language */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="text-blue-400" size={24} />
          <h3 className="font-semibold">{t('language')}</h3>
        </div>
        <div className="flex gap-4">
          <button
            onClick={() => updateSettings({ language: 'fa' })}
            className={`flex-1 p-4 rounded-xl text-center transition ${settings.language === 'fa' ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'}`}
          >
            فارسی
          </button>
          <button
            onClick={() => updateSettings({ language: 'en' })}
            className={`flex-1 p-4 rounded-xl text-center transition ${settings.language === 'en' ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'}`}
          >
            English
          </button>
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="text-purple-400" size={24} />
          <h3 className="font-semibold">{t('theme')}</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {THEME_OPTIONS.map(option => (
            <button
              key={option.theme}
              onClick={() => updateSettings({ theme: option.theme })}
              className={`relative p-3 rounded-xl text-center transition-all duration-300 overflow-hidden group ${
                settings.theme === option.theme ? option.activeClass : 'hover:scale-105'
              } ${option.baseClass}`}
            >
              <div className={`absolute inset-0 bg-gradient-to-t ${option.glowClass} to-transparent opacity-0 group-hover:opacity-100 transition-opacity`} />
              {option.theme === 'neural' && (
                <Sparkles size={12} className="absolute top-1.5 left-1.5 text-fuchsia-300 opacity-80" />
              )}
              {option.theme === 'mintAi' && (
                <Bot size={12} className="absolute top-1.5 left-1.5 text-emerald-200 opacity-90" />
              )}
              {option.dotClass && <div className={`absolute top-1 right-1 w-1.5 h-1.5 ${option.dotClass} rounded-full animate-pulse`} />}
              <span className="relative z-10 font-medium text-sm">{t(option.labelKey)}</span>
            </button>
          ))}
        </div>
        <p className="text-xs opacity-50 mt-4 text-center">{t('themesHint')}</p>
      </div>

      {/* Backup & Restore */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="text-green-400" size={24} />
          <h3 className="font-semibold">{t('backupRestore')}</h3>
        </div>

        <div className="mb-4">
          <label className="block text-sm mb-2 opacity-70">{t('backupFolder')}</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={backupDirHandle ? backupDirHandle.name : (settings.backupPath || '')}
              readOnly
              placeholder={t('noFolderSelected')}
              className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-green-400 focus:outline-none"
            />
            <button
              onClick={selectBackupDirectory}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 transition"
            >
              <FolderOpen size={20} />
              <span>{t('select')}</span>
            </button>
          </div>
          <p className="text-xs opacity-50 mt-2">{t('backupFolderHint')}</p>
        </div>

        <div className="flex gap-4">
          <button
            onClick={handleExport}
            disabled={transferBusy}
            className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 transition disabled:opacity-50"
          >
            <Download size={20} />
            <span>{transferBusy ? t('backupTransferBusy') : t('backup')}</span>
          </button>
          {electronUtils.isElectron ? (
            <button
              onClick={handleImportFromBackupPath}
              disabled={transferBusy}
              className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
            >
              <Upload size={20} />
              <span>{transferBusy ? t('backupTransferBusy') : t('restore')}</span>
            </button>
          ) : (
            <label className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition cursor-pointer">
              <Upload size={20} />
              <span>{t('restore')}</span>
              <input type="file" accept=".json,.zip,.enc" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>

        {/* موج ۳ (O3) — تعبیهٔ مدل محلی در بکاپ (هر دو بک‌اند) */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includeModelInBackup}
              onChange={e => setIncludeModelInBackup(e.target.checked)}
              className="w-4 h-4 accent-teal-500"
            />
            <span className="flex items-center gap-1.5">
              <BrainCircuit size={15} className="text-teal-300" />
              {t('includeModelInBackup')}
            </span>
          </label>
          <p className="text-xs opacity-50 leading-5">{t('backupModelHint')}</p>
        </div>

        {/* موج ۲ (C2.4) — گزینهٔ پشتیبان رمزدار با پسورد (فقط Electron) */}
        {electronUtils.isElectron && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={useBackupPassword}
                // فاز ۱ (AUD-9): با رمزنگاری فعال، برداشتن این تیک مجاز نیست
                disabled={passwordMandatory}
                onChange={e => setUseBackupPassword(passwordMandatory ? true : e.target.checked)}
                className="w-4 h-4 accent-green-500 disabled:opacity-60"
              />
              <span>{t('backupUsePassword')}</span>
            </label>
            {passwordMandatory && (
              <p className="text-xs text-emerald-200/70 leading-5">{t('backupPasswordMandatory')}</p>
            )}
            {useBackupPassword && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  value={backupPassword}
                  onChange={e => setBackupPassword(e.target.value)}
                  placeholder={t('backupPasswordLabel')}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-green-400 focus:outline-none text-sm"
                  dir="ltr"
                />
                <input
                  type="password"
                  value={backupPasswordConfirm}
                  onChange={e => setBackupPasswordConfirm(e.target.value)}
                  placeholder={t('backupPasswordConfirmLabel')}
                  className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-green-400 focus:outline-none text-sm"
                  dir="ltr"
                />
              </div>
            )}
            <p className="text-xs text-yellow-200/60 flex items-start gap-1.5">
              <Lock size={12} className="flex-shrink-0 mt-0.5" />
              <span>{t('backupPasswordNote')}</span>
            </p>
          </div>
        )}

        {/* ورود پسورد برای فایل پشتیبان رمزدار هنگام بازیابی (وب: payload؛ الکترون: retryLast) */}
        {(pendingEncryptedImport || pendingElectronImport) && (
          <div className="mt-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 space-y-3">
            <p className="text-sm text-yellow-100/90 flex items-center gap-2">
              <Lock size={15} />
              <span>{t('enterBackupPassword')}</span>
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={importPassword}
                onChange={e => setImportPassword(e.target.value)}
                placeholder={t('backupPasswordLabel')}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-sm"
                dir="ltr"
                onKeyDown={e => { if (e.key === 'Enter') completeEncryptedImport(); }}
              />
              <button
                onClick={completeEncryptedImport}
                disabled={!importPassword}
                className="px-4 py-2.5 rounded-xl bg-yellow-500/25 text-yellow-200 hover:bg-yellow-500/35 transition text-sm font-semibold disabled:opacity-50"
              >
                {t('decryptAndRestore')}
              </button>
              <button
                onClick={() => { setPendingEncryptedImport(null); setPendingElectronImport(false); setImportPassword(''); }}
                className="px-4 py-2.5 rounded-xl bg-white/5 text-white/60 hover:bg-white/10 transition text-sm"
              >
                {t('cancelEncryptedRestore')}
              </button>
            </div>
          </div>
        )}

        {/* موج ۲ (C1-C2) — وضعیت رمزنگاری + ابزار مهاجرت تصاویر قدیمی */}
        <div className="mt-4">
          <EncryptionPanel />
        </div>
      </div>
    </div>
  );
}
