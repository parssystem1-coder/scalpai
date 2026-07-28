import { useState } from 'react';
import { Globe, Palette, Database, Download, Upload, FolderOpen, Sparkles, Bot } from 'lucide-react';
import { useSettingsStore } from '../../store';
import { electronUtils, backupUtils } from '../../db';
import { useT, usePick } from '../../i18n';
import { settingsDict } from './strings';
import type { Notify } from './types';

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
    // فاز ۰.۵ — دسکتاپ: بستهٔ پوشه‌ای استریمی (v3). همه‌چیز (دیالوگ + کپی فایل‌ها)
    // در main انجام می‌شود — دیگر صدها مگابایت از IPC رد نمی‌شود.
    if (electronUtils.isElectron) {
      try {
        const result = await backupUtils.exportPackage(settings.backupPath || undefined);
        if (result.canceled) return;
        if (!result.success) throw new Error(result.error || 'Backup failed');
        notify('success', pick(`بکاپ ذخیره شد: ${result.filePath}`, `Backup saved: ${result.filePath}`));
      } catch (error) {
        console.error('Error exporting backup package:', error);
        notify('error', pick('ذخیرهٔ بکاپ ناموفق بود', 'Backup failed'));
      }
      return;
    }

    const data = await exportData();
    const fileName = `scalpai-backup-${new Date().toISOString().split('T')[0]}.json`;

    // Electron با مسیر بکاپ ذخیره‌شده
    if (electronUtils.isElectron && settings.backupPath) {
      try {
        const filePath = `${settings.backupPath}/${fileName}`;
        const saved = await electronUtils.saveFileToPath(filePath, data);
        if (!saved) throw new Error('Backup save failed');
        notify('success', pick(`فایل در ${filePath} ذخیره شد`, `File saved to ${filePath}`));
        return;
      } catch (error) {
        console.error('Error saving to Electron path:', error);
      }
    }

    // وب با پوشهٔ انتخاب‌شده از File System Access API
    if (backupDirHandle) {
      try {
        const fileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        notify('success', pick(`فایل در پوشه ${backupDirHandle.name} ذخیره شد`, `File saved to ${backupDirHandle.name}`));
        return;
      } catch (error) {
        console.error('Error saving to directory:', error);
      }
    }

    // Electron بدون مسیر: دیالوگ ذخیره (نوشتن در main)
    if (electronUtils.isElectron) {
      try {
        const result = await electronUtils.saveFileDialog(data, fileName);
        if (result) {
          notify('success', pick(`فایل ذخیره شد: ${result}`, `File saved: ${result}`));
          return;
        }
      } catch (error) {
        console.error('Error with Electron save dialog:', error);
      }
    }

    // fallback: دانلود معمولی مرورگر
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await importData(ev.target?.result as string);
        alert(t('restoreSuccess'));
        window.location.reload();
      } catch {
        alert(t('restoreError'));
      }
    };
    reader.readAsText(file);
  };

  // Electron: بازیابی از بکاپ — فاز ۰.۵: انتخاب خودکار فرمت (بستهٔ v3 یا JSON کلاسیک v2)
  // و انتقال فایل‌ها کاملاً در main انجام می‌شود (بدون عبور محتوا از IPC)
  const handleImportFromBackupPath = async () => {
    if (!electronUtils.isElectron) return;
    try {
      const result = await backupUtils.importAuto();
      if (result.canceled) return;
      if (!result.success) throw new Error(result.error || 'Import failed');
      alert(t('restoreSuccess'));
      window.location.reload();
    } catch (error) {
      console.error('Error importing from backup path:', error);
      alert(t('restoreError'));
    }
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
          <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500/30 transition">
            <Download size={20} />
            <span>{t('backup')}</span>
          </button>
          {electronUtils.isElectron ? (
            <button onClick={handleImportFromBackupPath} className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition">
              <Upload size={20} />
              <span>{t('restore')}</span>
            </button>
          ) : (
            <label className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition cursor-pointer">
              <Upload size={20} />
              <span>{t('restore')}</span>
              <input type="file" accept=".json" onChange={handleImport} className="hidden" />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
