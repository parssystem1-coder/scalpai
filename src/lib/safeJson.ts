/**
 * پارس امن JSON ذخیره‌شده — هم‌راستا با electron/db-common.parseStoredJson
 */
export function parseStoredJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
