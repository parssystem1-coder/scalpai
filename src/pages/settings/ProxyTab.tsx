import { useEffect, useState } from 'react';
import { Shield, Globe, Save, Wifi, X, Check, AlertCircle } from 'lucide-react';
import { proxyUtils, electronUtils } from '../../db';
import { useT } from '../../i18n';
import { settingsDict } from './strings';
import type { Notify } from './types';

export default function ProxyTab({ notify }: { notify: Notify }) {
  const t = useT(settingsDict);

  const [proxyUrl, setProxyUrl] = useState('');
  const [proxyTesting, setProxyTesting] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [proxySaving, setProxySaving] = useState(false);

  useEffect(() => {
    if (electronUtils.isElectron) {
      proxyUtils.getProxy().then(saved => {
        if (saved) setProxyUrl(saved);
      });
    }
  }, []);

  const handleSave = async () => {
    setProxySaving(true);
    setProxyStatus('idle');
    const result = await proxyUtils.setProxy(proxyUrl);
    if (result.success) {
      notify('success', t('proxySet'));
    } else {
      notify('error', result.error || t('proxySetError'));
    }
    setProxySaving(false);
  };

  const handleTest = async () => {
    setProxyTesting(true);
    setProxyStatus('idle');
    const result = await proxyUtils.testProxy('https://www.google.com');
    setProxyStatus(result.success ? 'success' : 'error');
    setProxyTesting(false);
  };

  const handleDisable = async () => {
    setProxyUrl('');
    await proxyUtils.setProxy('');
    setProxyStatus('idle');
    notify('success', t('proxyDisabled'));
  };

  if (!electronUtils.isElectron) {
    // نسخهٔ وب: پروکسی سیستم ندارد — راهنمای CORS proxy
    return (
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="text-yellow-400" size={24} />
          <div>
            <h3 className="font-semibold">{t('webProxyTitle')}</h3>
            <p className="text-sm opacity-50">{t('webProxySubtitle')}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <p className="text-yellow-300">{t('webProxyDesktopHint')}</p>
          <p className="text-sm text-yellow-200 mt-2">{t('webProxyCorsHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="text-teal-400" size={24} />
        <div>
          <h3 className="font-semibold">{t('systemProxy')}</h3>
          <p className="text-sm opacity-50">{t('systemProxySubtitle')}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-2 opacity-70">{t('localProxyAddress')}</label>
          <input
            type="text"
            value={proxyUrl}
            onChange={e => setProxyUrl(e.target.value)}
            placeholder="http://127.0.0.1:10808"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-teal-400 focus:outline-none"
          />
          <p className="text-xs opacity-50 mt-2">{t('proxyHint')}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={proxySaving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-gray-900 font-semibold hover:from-teal-400 hover:to-cyan-400 transition disabled:opacity-50"
          >
            {proxySaving ? <span className="animate-spin">...</span> : <Save size={20} />}
            <span>{t('saveApply')}</span>
          </button>

          <button
            onClick={handleTest}
            disabled={proxyTesting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
          >
            {proxyTesting ? <span className="animate-spin">...</span> : <Wifi size={20} />}
            <span>{t('testConnection')}</span>
          </button>

          <button
            onClick={handleDisable}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
          >
            <X size={20} />
            <span>{t('disable')}</span>
          </button>
        </div>

        {proxyStatus !== 'idle' && (
          <div className={`p-4 rounded-xl flex items-center gap-3 ${
            proxyStatus === 'success'
              ? 'bg-green-500/20 border border-green-500/30 text-green-400'
              : 'bg-red-500/20 border border-red-500/30 text-red-400'
          }`}>
            {proxyStatus === 'success' ? <Check size={20} /> : <AlertCircle size={20} />}
            <span>{proxyStatus === 'success' ? t('proxyOk') : t('proxyFail')}</span>
          </div>
        )}

        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="font-medium text-blue-300 mb-2">{t('commonProxies')}</p>
          <ul className="text-sm text-blue-200 space-y-1">
            <li><code className="bg-blue-500/20 px-2 py-0.5 rounded">http://127.0.0.1:10808</code> - V2RayN / Clash</li>
            <li><code className="bg-blue-500/20 px-2 py-0.5 rounded">http://127.0.0.1:1080</code> - Shadowsocks</li>
            <li><code className="bg-blue-500/20 px-2 py-0.5 rounded">http://127.0.0.1:7890</code> - Clash for Windows</li>
            <li><code className="bg-blue-500/20 px-2 py-0.5 rounded">socks5://127.0.0.1:1080</code> - SOCKS5</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
