/**
 * PrivacyConsentModal — رضایت‌نامهٔ حریم‌خصوصی اولین اجرا (موج ۲ / C3.1)
 * -----------------------------------------------------------------------
 * modal غیرقابل‌رد (بدون دکمهٔ بستن/کلیک بیرون) که تا ثبت رضایت، کل اپ را
 * پوش می‌دهد. با ثبت، privacyConsent={version,at} در settings ذخیره می‌شود و
 * درگاه تحلیل آنلاین (useAISession) باز می‌شود.
 *
 * چرا غیرقابل‌رد: تحلیل آفلاین هم دادهٔ بالینی تولید می‌کند؛ کاربر باید حداقل
 * یک‌بار بداند چه چیزی کجا نگه داشته می‌شود — حتی اگر هرگز AI ابری نزند.
 */

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Database, Image, Cloud, HardDrive, Loader } from 'lucide-react';
import { useSettingsStore } from '../store';
import { useT, useLang, type Dict } from '../i18n';
import {
  buildPrivacyConsentRecord,
  hasValidPrivacyConsent,
} from '../lib/privacyConsent';

const dict = {
  title: {
    fa: 'حریم‌خصوصی و ذخیره‌سازی داده',
    en: 'Privacy & Data Storage',
  },
  intro: {
    fa: 'پیش از شروع، لطفاً این خلاصهٔ شفاف را بخوانید. ScalpAI یک نرم‌افزار دسکتاپ است و دادهٔ شما را به‌طور پیش‌فرض روی همین دستگاه نگه می‌دارد:',
    en: 'Before you start, please read this transparency summary. ScalpAI is a desktop application and keeps your data on this device by default:',
  },
  pointLocal: {
    fa: 'دیتابیس بالینی (نام، تلفن، پرسشنامهٔ پزشکی، تشخیص‌ها) و تصاویر روی همین دستگاه نگه داشته می‌شوند؛ نسخهٔ دسکتاپ آن‌ها را به‌صورت رمزنگاری‌شده ذخیره می‌کند و نسخهٔ وب داخل حافظهٔ مرورگر شماست.',
    en: 'Your clinical database (names, phones, medical questionnaires, diagnoses) and images are kept on this device; the desktop app stores them encrypted, the web version stores them in your browser storage.',
  },
  pointBackup: {
    fa: 'پشتیبان‌گیری ZIP فقط وقتی خود شما بسازید انجام می‌شود و در مسیر انتخابی خودتان ذخیره می‌گردد؛ مسئولیت امنیت آن فایل با شماست.',
    en: 'ZIP backups are only created when you make one, saved to a location you choose; securing that file is your responsibility.',
  },
  pointCloud: {
    fa: 'تنها در «تحلیل آنلاین» و فقط با کلید API خود شما، تصویر انتخاب‌شده (+ زمینهٔ پرسشنامه در صورت فعال بودن گزینهٔ آن) به سرویس هوش مصنوعی انتخابی شما ارسال می‌شود. هر ارسال در لاگ حسابرسی ثبت می‌شود.',
    en: 'Only in "Online Analysis" — and only with your own API key — the selected image (plus questionnaire context if you enable it) is sent to your chosen AI provider. Every send is recorded in the audit log.',
  },
  pointModel: {
    fa: 'مدل محلی و تحلیل آفلاین کاملاً روی دستگاه اجرا می‌شوند و هیچ داده‌ای بیرون نمی‌رود.',
    en: 'The local model and offline analysis run entirely on-device; no data leaves.',
  },
  acknowledge: {
    fa: 'خواندم و می‌پذیرم — شروع استفاده',
    en: 'I have read and accept — Start using',
  },
  saving: {
    fa: 'در حال ثبت...',
    en: 'Recording...',
  },
  docRef: {
    fa: 'جزئیات کامل در سند docs/privacy.md داخل برنامه.',
    en: 'Full details in the bundled docs/privacy.md document.',
  },
} as const satisfies Dict<ConsentKey>;

type ConsentKey =
  | 'title' | 'intro' | 'pointLocal' | 'pointBackup' | 'pointCloud'
  | 'pointModel' | 'acknowledge' | 'saving' | 'docRef';

export default function PrivacyConsentModal() {
  const settings = useSettingsStore(s => s.settings);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const t = useT(dict);
  const { isRtl } = useLang();
  const [saving, setSaving] = useState(false);

  // تا اولین fetch تنظیمات کامل نشده (گذار true←loading←false مشاهده نشده)
  // تصمیم نگیر — جلوگیری از فلش modal در هر شروع اپ.
  const loading = useSettingsStore(s => s.loading);
  const seenLoadingRef = useRef(false);
  const [firstFetchDone, setFirstFetchDone] = useState(false);
  useEffect(() => {
    if (loading) seenLoadingRef.current = true;
    else if (seenLoadingRef.current && !firstFetchDone) setFirstFetchDone(true);
  }, [loading, firstFetchDone]);
  if (!firstFetchDone || loading || hasValidPrivacyConsent(settings)) return null;

  const accept = async () => {
    setSaving(true);
    try {
      await updateSettings({ privacyConsent: buildPrivacyConsentRecord() });
    } finally {
      setSaving(false);
    }
  };

  const points = [
    { icon: Database, text: t('pointLocal') },
    { icon: Image, text: t('pointBackup') },
    { icon: Cloud, text: t('pointCloud') },
    { icon: HardDrive, text: t('pointModel') },
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="max-w-lg w-full rounded-2xl bg-[#0d1117] border border-white/10 shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="text-emerald-400" size={24} />
          </div>
          <h2 className="text-lg font-bold">{t('title')}</h2>
        </div>

        <p className="text-sm text-white/70 leading-6">{t('intro')}</p>

        <ul className="space-y-3">
          {points.map(({ icon: Icon, text }) => (
            <li key={text.slice(0, 24)} className="flex items-start gap-3 text-sm text-white/85 leading-6">
              <Icon size={17} className="text-emerald-400 flex-shrink-0 mt-1" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-white/40">{t('docRef')}</p>

        <button
          type="button"
          onClick={accept}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-semibold transition flex items-center justify-center gap-2"
        >
          {saving && <Loader size={16} className="animate-spin" />}
          <span>{saving ? t('saving') : t('acknowledge')}</span>
        </button>
      </div>
    </div>
  );
}
