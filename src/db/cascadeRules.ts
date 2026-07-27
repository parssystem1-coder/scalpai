/**
 * قوانین دامنهٔ مشترک برای cascade حذف — adapterها باید این وابستگی‌ها را رعایت کنند.
 * I/O در هر بک‌اند جداست؛ این فایل فقط قرارداد دامنه را مشخص می‌کند.
 */
export const CLIENT_DELETE_CASCADE = [
  'sessions',
  'analyses',
  'gallery',
  'trainingSamples',
  'questionnaireRevisions',
] as const;

export type ClientCascadeEntity = (typeof CLIENT_DELETE_CASCADE)[number];
