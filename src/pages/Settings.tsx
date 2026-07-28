/**
 * Settings — پوستهٔ صفحهٔ تنظیمات
 * هر تب یک کامپوننت مستقل در src/pages/settings/ است و state فرم خودش را
 * محلی نگه می‌دارد؛ این فایل فقط ناوبری تب‌ها و پیام سراسری را مدیریت می‌کند.
 */
import { useEffect, useRef, useState } from 'react';
import { Settings as SettingsIcon, Users, Brain, User, Shield, Check, AlertCircle } from 'lucide-react';
import { useSettingsStore, useTrichologistsStore } from '../store';
import { useT } from '../i18n';
import { settingsDict } from './settings/strings';
import type { Notify } from './settings/types';
import GeneralTab from './settings/GeneralTab';
import ProfileTab from './settings/ProfileTab';
import ProxyTab from './settings/ProxyTab';
import TrichologistsTab from './settings/TrichologistsTab';
import AITab from './settings/AITab';

const tabs = [
  { id: 'general', icon: SettingsIcon, labelKey: 'tabGeneral' },
  { id: 'profile', icon: User, labelKey: 'tabProfile' },
  { id: 'proxy', icon: Shield, labelKey: 'tabProxy' },
  { id: 'trichologists', icon: Users, labelKey: 'tabTrichologists' },
  { id: 'ai', icon: Brain, labelKey: 'tabAI' },
] as const;

export default function Settings() {
  const { fetchSettings } = useSettingsStore();
  const { fetchTrichologists } = useTrichologistsStore();
  const t = useT(settingsDict);

  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('general');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchTrichologists();
    return () => {
      if (messageTimer.current) clearTimeout(messageTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notify: Notify = (type, text) => {
    setMessage({ type, text });
    if (messageTimer.current) clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setMessage(null), type === 'error' ? 5000 : 3000);
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition whitespace-nowrap ${isActive ? 'bg-blue-500 text-white' : 'hover:bg-white/10'}`}
            >
              <Icon size={20} />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Global message */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success'
            ? 'bg-green-500/20 border border-green-500/30 text-green-400'
            : 'bg-red-500/20 border border-red-500/30 text-red-400'
        }`}>
          {message.type === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
          <span>{message.text}</span>
        </div>
      )}

      {activeTab === 'general' && <GeneralTab notify={notify} />}
      {activeTab === 'profile' && <ProfileTab notify={notify} />}
      {activeTab === 'proxy' && <ProxyTab notify={notify} />}
      {activeTab === 'trichologists' && <TrichologistsTab />}
      {activeTab === 'ai' && <AITab />}
    </div>
  );
}
