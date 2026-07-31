/**
 * تست منطق رضایت‌نامهٔ حریم‌خصوصی (موج ۲ / C3.1)
 * قانون: بدون رضایت معتبرِ نسخهٔ جاری، درگاه تحلیل آنلاین بسته می‌ماند.
 */
import { describe, it, expect } from 'vitest';
import {
  PRIVACY_CONSENT_VERSION,
  hasValidPrivacyConsent,
  buildPrivacyConsentRecord,
} from './privacyConsent';

describe('privacyConsent (موج ۲ / C3.1)', () => {
  it('نسخهٔ فعلی رضایت، معتبر شناخته می‌شود', () => {
    const settings = { privacyConsent: { version: PRIVACY_CONSENT_VERSION, at: new Date().toISOString() } };
    expect(hasValidPrivacyConsent(settings)).toBe(true);
  });

  it('نبود رضایت = درگاه بسته', () => {
    expect(hasValidPrivacyConsent(undefined)).toBe(false);
    expect(hasValidPrivacyConsent(null)).toBe(false);
    expect(hasValidPrivacyConsent({})).toBe(false);
    expect(hasValidPrivacyConsent({ privacyConsent: undefined })).toBe(false);
  });

  it('نسخهٔ قدیمی معتبر نیست — re-consent اجباری است', () => {
    const settings = { privacyConsent: { version: '1970-01-01.v0', at: new Date().toISOString() } };
    expect(hasValidPrivacyConsent(settings)).toBe(false);
  });

  it('زمان ثبت خالی/معیوب معتبر نیست', () => {
    expect(hasValidPrivacyConsent({ privacyConsent: { version: PRIVACY_CONSENT_VERSION, at: '' } })).toBe(false);
  });

  it('رکورد ساخته‌شده همیشه معتبر است و نسخهٔ جاری را دارد', () => {
    const record = buildPrivacyConsentRecord();
    expect(record.version).toBe(PRIVACY_CONSENT_VERSION);
    expect(record.at.length).toBeGreaterThan(0);
    expect(hasValidPrivacyConsent({ privacyConsent: record })).toBe(true);
  });
});
