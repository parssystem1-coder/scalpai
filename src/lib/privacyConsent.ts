/**
 * privacyConsent.ts — نسخه و منطق رضایت‌نامهٔ حریم‌خصوصی (موج ۲ / C3.1)
 * -----------------------------------------------------------------------
 * قانون: تا وقتی کاربر نسخهٔ جاری رضایت‌نامه را ندیده و تأیید نکرده،
 * «تحلیل آنلاین» — تنها نقطهٔ خروج دادهٔ بالینی از دستگاه — غیرفعال می‌ماند.
 *
 * با هر تغییر معنادار در متن رضایت‌نامه (مثلاً افزودن سرویس بیرونی جدید یا
 * تغییر دادهٔ ارسالی)، PRIVACY_CONSENT_VERSION باید بامپ شود تا همهٔ کاربران
 * نسخهٔ جدید را دوباره ببینند و تأیید کنند (re-consent).
 */

export const PRIVACY_CONSENT_VERSION = '2026-07-30.v1';

/** @param settings — آبجکت تنظیمات برگشتی از db.getSettings (sanitizeشده) */
export function hasValidPrivacyConsent(settings: { privacyConsent?: { version: string; at: string } } | null | undefined): boolean {
  return (
    !!settings &&
    !!settings.privacyConsent &&
    typeof settings.privacyConsent.version === 'string' &&
    settings.privacyConsent.version === PRIVACY_CONSENT_VERSION &&
    typeof settings.privacyConsent.at === 'string' &&
    settings.privacyConsent.at.length > 0
  );
}

/** ساخت رکورد رضایت برای ذخیره در settings */
export function buildPrivacyConsentRecord(): { version: string; at: string } {
  return { version: PRIVACY_CONSENT_VERSION, at: new Date().toISOString() };
}
