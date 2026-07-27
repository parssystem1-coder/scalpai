import { useEffect, useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { useSettingsStore } from '../../store';
import { proxyUtils, electronUtils, aiUtils, safeStorageUtils } from '../../db';
import { AI_PROVIDER_PRESETS, detectAiPresetId } from '../../lib/aiProvider';
import { useLang, useT } from '../../i18n';
import { settingsDict } from './strings';

export default function AITab() {
  const { settings, updateSettings } = useSettingsStore();
  const t = useT(settingsDict);
  const { lang } = useLang();

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionErrorMsg, setConnectionErrorMsg] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => detectAiPresetId(settings));
  const [vpnStatus, setVpnStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  // کلید فقط هنگام تایپ کاربر در state محلی می‌ماند — از settings برنمی‌گردد
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  // اگر safeStorage در دسترس نباشد، کلید بدون رمزنگاری روی دیسک می‌رود —
  // کاربر باید قبل از وارد کردن کلید این را بداند.
  const [insecureKeyStorage, setInsecureKeyStorage] = useState(false);

  const hasApiKey = Boolean(settings.hasApiKey || apiKeyDraft);

  // بررسی دسترسی به سرویس AI (که ممکن است مسدود/تحریم باشد).
  // در Electron از main process تست می‌شود تا پروکسی تنظیم‌شده هم لحاظ شود؛
  // در وب، دریافت هر پاسخ HTTP (حتی 403 بدون کلید) یعنی سرویس در دسترس است.
  const checkVpnStatus = async () => {
    setVpnStatus('checking');
    try {
      if (proxyUtils.isElectron) {
        const result = await proxyUtils.testProxy();
        setVpnStatus(result.success ? 'connected' : 'disconnected');
        return;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      await fetch('https://generativelanguage.googleapis.com/v1beta/models', { signal: controller.signal });
      clearTimeout(timeout);
      setVpnStatus('connected');
    } catch {
      setVpnStatus('disconnected');
    }
  };

  useEffect(() => {
    checkVpnStatus();
    setSelectedPresetId(detectAiPresetId(settings));
    if (electronUtils.isElectron) {
      safeStorageUtils.isAvailable().then(available => setInsecureKeyStorage(!available)).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOpenRouter =
    (settings.aiBaseUrl || '').toLowerCase().includes('openrouter.ai') ||
    selectedPresetId === 'openrouter-free';

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionErrorMsg('');

    const draft = apiKeyDraft.trim();
    if (draft) {
      await updateSettings({ aiApiKey: draft });
      setApiKeyDraft('');
    }

    // بعد از ذخیره، آخرین تنظیمات را از store بخوان (نه از closure قدیمی)
    const latest = useSettingsStore.getState().settings;

    if (!draft && !latest.hasApiKey && !latest.aiApiKey) {
      setConnectionStatus('error');
      setConnectionErrorMsg(t('enterKeyFirst'));
      setTestingConnection(false);
      return;
    }

    const provider = latest.aiProvider || 'gemini';
    const baseUrl = latest.aiBaseUrl;
    let model = latest.aiModelName;

    // اگر OpenRouter انتخاب شده ولی مدل پولی/منسوخ است، به روتر رایگان مهاجرت کن
    if ((baseUrl || '').toLowerCase().includes('openrouter.ai')) {
      const { normalizeOpenRouterModel, OPENROUTER_FREE_ROUTER } = await import('../../lib/aiProvider');
      const normalized = normalizeOpenRouterModel(baseUrl, model);
      if (normalized !== (model || '').trim()) {
        model = normalized || OPENROUTER_FREE_ROUTER;
        await updateSettings({
          aiProvider: 'openai_compatible',
          aiBaseUrl: baseUrl || 'https://openrouter.ai/api/v1',
          aiModelName: model,
          aiPresetId: 'openrouter-free',
        });
        setSelectedPresetId('openrouter-free');
      }
    }

    const result = await aiUtils.testConnection({
      provider,
      apiKey: electronUtils.isElectron ? '' : (draft || latest.aiApiKey || ''),
      baseUrl: baseUrl || (provider === 'openai_compatible' ? 'https://openrouter.ai/api/v1' : undefined),
      model,
      proxyUrl: latest.aiProxyUrl,
    });

    if (result.success) {
      setConnectionStatus('success');
    } else {
      setConnectionStatus('error');
      let msg = result.error || t('unknownError');
      if (/security policy/i.test(msg)) {
        msg = `${msg}\n\n${t('causeOpenRouterSecurity')}`;
      }
      setConnectionErrorMsg(msg);
    }
    setTestingConnection(false);
  };

  return (
    <div className="space-y-6">
      {/* انتخاب سریع سرویس هوش مصنوعی */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 space-y-4">
        <div>
          <label className="block mb-2 font-medium">{t('aiService')}</label>
          <p className="text-xs opacity-60 mb-3">{t('aiServiceHint')}</p>
          <p className="text-xs opacity-50 mb-3">{t('specialistOnlyHint')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {AI_PROVIDER_PRESETS.map(preset => {
              const publicLabel = lang === 'fa' ? `مدل ${preset.publicSlot}` : `Model ${preset.publicSlot}`;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setSelectedPresetId(preset.id);
                    updateSettings({
                      aiProvider: preset.provider,
                      aiBaseUrl: preset.baseUrl,
                      aiModelName: preset.model || '',
                      aiPresetId: preset.id,
                    });
                  }}
                  className={`text-start p-4 rounded-xl border transition ${selectedPresetId === preset.id ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-semibold">
                      {t('publicModelBadge')} {publicLabel}
                    </span>
                  </div>
                  <p className="font-medium text-sm">{preset.label[lang]}</p>
                  <p className="text-xs opacity-60 mt-1">{preset.freeInfo[lang]}</p>
                  {preset.getKeyUrl && (
                    <a
                      href={preset.getKeyUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-blue-300 underline mt-2 inline-block"
                    >
                      {t('getFreeKey')}
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* تنظیمات دقیق (قابل ویرایش برای هر سرویسی، حتی خارج از پیش‌فرض‌های بالا) */}
      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 space-y-4">
        <div>
          <label className="block mb-2">{t('providerType')}</label>
          <select
            value={settings.aiProvider || 'gemini'}
            onChange={e => updateSettings({ aiProvider: e.target.value as 'gemini' | 'openai_compatible' })}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          >
            <option value="gemini">Google Gemini</option>
            <option value="openai_compatible">{t('openaiCompatible')}</option>
          </select>
          <p className="text-xs opacity-50 mt-1">{t('providerHint')}</p>
        </div>
        <div>
          <label className="block mb-2">{t('apiKey')}</label>
          <input
            type="password"
            value={apiKeyDraft}
            onChange={e => setApiKeyDraft(e.target.value)}
            onBlur={() => {
              if (apiKeyDraft.trim()) {
                updateSettings({ aiApiKey: apiKeyDraft.trim() }).then(() => setApiKeyDraft(''));
              }
            }}
            placeholder={hasApiKey ? '••••••••••••••••' : 'sk-... / AIza...'}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
            autoComplete="off"
          />
          {settings.hasApiKey && !apiKeyDraft && (
            <p className="text-xs text-emerald-400/80 mt-1">{t('apiKeyConfigured')}</p>
          )}
          {insecureKeyStorage && (
            <div className="text-xs mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{t('insecureKeyStorageWarning')}</span>
            </div>
          )}
        </div>
        {(settings.aiProvider || 'gemini') === 'openai_compatible' && (
          <div>
            <label className="block mb-2">{t('modelName')}</label>
            <input
              type="text"
              value={settings.aiModelName || ''}
              onChange={e => updateSettings({ aiModelName: e.target.value })}
              placeholder="e.g. openrouter/free"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}
        <div>
          <label className="block mb-2">{t('baseUrl')}</label>
          <input
            type="url"
            value={settings.aiBaseUrl || ''}
            onChange={e => updateSettings({ aiBaseUrl: e.target.value })}
            placeholder={(settings.aiProvider || 'gemini') === 'gemini'
              ? 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
              : 'https://openrouter.ai/api/v1'}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          />
          <p className="text-xs opacity-50 mt-1">
            {(settings.aiProvider || 'gemini') === 'gemini' ? t('baseUrlHintGemini') : t('baseUrlHintOpenAI')}
          </p>
        </div>
        <div>
          <label className="block mb-2">{t('ownProxy')}</label>
          <input
            type="url"
            value={settings.aiProxyUrl || ''}
            onChange={e => updateSettings({ aiProxyUrl: e.target.value })}
            placeholder={t('ownProxyPlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          />
          <div className="text-xs mt-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200">
            {t('proxyPrivacyWarning')}
          </div>
        </div>
        <div>
          <label className="block mb-2">{t('confidenceThreshold')}: {settings.aiConfidenceThreshold}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.aiConfidenceThreshold}
            onChange={e => updateSettings({ aiConfidenceThreshold: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <div className="p-4 rounded-xl border border-white/10 space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings.includeMedicalDataInAi)}
              onChange={e => updateSettings({ includeMedicalDataInAi: e.target.checked })}
              className="mt-1 w-4 h-4 rounded"
            />
            <span>
              <span className="font-medium block">{t('includeMedicalDataInAi')}</span>
              <span className="text-xs opacity-60 block mt-1">{t('includeMedicalDataInAiHint')}</span>
            </span>
          </label>
          {settings.includeMedicalDataInAi && (
            <div className="text-xs p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-200 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{t('includeMedicalDataInAiWarning')}</span>
            </div>
          )}
        </div>

        {/* Internet Connection Status */}
        <div className="mb-2 p-4 rounded-xl border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{t('internetStatus')}</span>
            <button onClick={checkVpnStatus} className="text-sm text-blue-400 hover:text-blue-300">
              {t('recheck')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {vpnStatus === 'checking' && (
              <>
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                <span className="text-yellow-400">{t('checking')}</span>
              </>
            )}
            {vpnStatus === 'connected' && (
              <>
                <Check size={16} className="text-green-400" />
                <span className="text-green-400">{t('vpnConnected')}</span>
              </>
            )}
            {vpnStatus === 'disconnected' && (
              <>
                <AlertCircle size={16} className="text-red-400" />
                <span className="text-red-400">{t('vpnDisconnected')}</span>
              </>
            )}
          </div>
          {vpnStatus === 'disconnected' && (
            <p className="text-xs text-red-300 mt-2">
              {electronUtils.isElectron ? t('vpnHintElectron') : t('vpnHintWeb')}
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={testConnection}
            disabled={testingConnection}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 transition disabled:opacity-50"
          >
            {testingConnection ? <span className="animate-spin">...</span> : <Check size={20} />}
            <span>{t('testApiConnection')}</span>
          </button>
          {connectionStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-400">
              <Check size={20} />
              <span>{t('apiConnected')}</span>
            </div>
          )}
          {connectionStatus === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-400">
                <AlertCircle size={20} />
                <span>{t('apiFailed')}</span>
              </div>
              {connectionErrorMsg && (
                <div className="text-sm text-red-300 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                  {connectionErrorMsg}
                </div>
              )}
              <div className="text-sm text-red-300 bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                <p className="font-medium mb-1">{t('possibleCauses')}</p>
                <ul className="text-xs space-y-1 list-disc list-inside">
                  <li>{t('causeInvalidKey')}</li>
                  <li>{t('causeRateLimit')}</li>
                  <li>{t('causeWrongUrl')}</li>
                  <li>{electronUtils.isElectron ? t('causeVpnElectron') : t('causeVpnWeb')}</li>
                  {isOpenRouter && <li>{t('causeOpenRouterSecurity')}</li>}
                </ul>
              </div>

              {isOpenRouter ? (
                <div className="text-sm text-blue-300 bg-blue-500/10 p-4 rounded-lg border border-blue-500/20 mt-3">
                  <p className="font-medium mb-2">{t('openRouterGuideTitle')}</p>
                  <ol className="text-xs space-y-2 list-decimal list-inside">
                    <li>{t('openRouterStep1')}</li>
                    <li>{t('openRouterStep2')}</li>
                    <li>{t('openRouterStep3')}</li>
                    <li>{t('openRouterStep4')}</li>
                  </ol>
                  <div className="mt-3 p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                    <p className="text-xs"><strong>{t('note')}</strong> {t('openRouterNote')}</p>
                  </div>
                </div>
              ) : (
              <div className="text-sm text-blue-300 bg-blue-500/10 p-4 rounded-lg border border-blue-500/20 mt-3">
                <p className="font-medium mb-2 flex items-center gap-2">{t('quotaGuideTitle')}</p>
                <ol className="text-xs space-y-2 list-decimal list-inside">
                  <li>
                    <strong>{t('quotaStep1Title')}</strong><br />
                    <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-blue-300 underline">https://aistudio.google.com</a>
                  </li>
                  <li>
                    <strong>{t('quotaStep2Title')}</strong><br />
                    {t('quotaStep2Body')}
                  </li>
                  <li>
                    <strong>{t('quotaStep3Title')}</strong><br />
                    {t('quotaStep3Body')}
                  </li>
                  <li>
                    <strong>{t('quotaStep4Title')}</strong><br />
                    {t('quotaStep4Body')}
                  </li>
                </ol>
                <div className="mt-3 p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                  <p className="text-xs">
                    <strong>{t('note')}</strong> {t('quotaNote')}
                  </p>
                </div>
              </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
