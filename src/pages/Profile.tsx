import { useEffect, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { useSettingsStore } from '../store';
import { useLang } from '../i18n';
import ProfileTab from './settings/ProfileTab';
import type { Notify } from './settings/types';

/** صفحهٔ مستقل پروفایل — همان منطق ProfileTab تنظیمات را با toast محلی نمایش می‌دهد */
export default function Profile() {
  const { fetchSettings } = useSettingsStore();
  const { isRtl } = useLang();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const notify: Notify = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">{isRtl ? 'پروفایل کاربری' : 'User Profile'}</h1>

      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-400'
              : 'bg-red-500/20 border border-red-500/30 text-red-400'
          }`}
        >
          {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
          <span>{message.text}</span>
        </div>
      )}

      <ProfileTab notify={notify} />
    </div>
  );
}
