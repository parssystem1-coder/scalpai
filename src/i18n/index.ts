/**
 * i18n — زیرساخت سادهٔ دوزبانه (فارسی/انگلیسی)
 * -----------------------------------------------------------------------
 * قبلاً همهٔ متن‌ها به‌صورت `isRtl ? 'فارسی' : 'English'` داخل JSX پخش بودند.
 * حالا:
 *  - هر بخش UI یک دیکشنری `{ key: { fa, en } }` دارد (متن‌ها متمرکز؛
 *    افزودن زبان جدید = افزودن یک فیلد، بدون دست زدن به کامپوننت‌ها).
 *  - «زبان» و «جهت متن» دو مفهوم جدا هستند: dir از زبان مشتق می‌شود
 *    ولی مصرف‌کننده‌ها فقط از useLang می‌گیرند، نه با مقایسهٔ مستقیم زبان.
 */

import { useCallback } from 'react';
import { useSettingsStore } from '../store';

export type Lang = 'fa' | 'en';

/** یک مدخل دیکشنری: متن هر دو زبان کنار هم — کلید جاافتاده در tsc خطا می‌دهد */
export interface LocalizedText {
  fa: string;
  en: string;
}

export type Dict<K extends string = string> = Record<K, LocalizedText>;

export function useLang(): { lang: Lang; isRtl: boolean; dir: 'rtl' | 'ltr' } {
  const language = useSettingsStore(s => s.settings.language);
  const lang: Lang = language === 'en' ? 'en' : 'fa';
  return { lang, isRtl: lang === 'fa', dir: lang === 'fa' ? 'rtl' : 'ltr' };
}

/**
 * هوک ترجمه بر اساس یک دیکشنری مشخص:
 *   const t = useT(settingsDict);
 *   t('backup') → 'پشتیبان‌گیری' یا 'Backup'
 * کلیدها type-safe هستند (فقط کلیدهای همان دیکشنری پذیرفته می‌شوند).
 */
export function useT<K extends string>(dict: Dict<K>): (key: K) => string {
  const { lang } = useLang();
  return useCallback((key: K) => dict[key][lang], [dict, lang]);
}

/**
 * برای متن‌هایی که با داده ساخته می‌شوند (خارج از دیکشنری):
 *   const pick = usePick();
 *   pick(`فایل در ${p} ذخیره شد`, `File saved to ${p}`)
 */
export function usePick(): (fa: string, en: string) => string {
  const { lang } = useLang();
  return useCallback((fa: string, en: string) => (lang === 'fa' ? fa : en), [lang]);
}
