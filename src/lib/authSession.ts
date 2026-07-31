/**
 * مدیریت نشست ورود — Electron از توکن main-process استفاده می‌کند؛
 * وب همچنان یک توکن محلی تصادفی نگه می‌دارد (به‌جای فلگ loggedIn).
 *
 * موج ۲ (C4): ذخیرهٔ نشست از localStorage به sessionStorage منتقل شد —
 * توکن وب دیگر پس از بستن تب/مرورگر زنده نمی‌ماند (کاهش ماندگاری اعتبارنامه
 * روی ماشین مشترک). نشست‌های قدیمی localStorage در اولین خواندن پاک می‌شوند.
 */

import { parseStoredJson } from './safeJson';

const AUTH_KEY = 'scalpai_auth';

export interface AuthSession {
  username: string;
  /** توکن نشست — در Electron توسط main صادر می‌شود */
  token: string;
}

/** پاکسازی مهاجرتی نشست قدیمی localStorage (C4) — idempotent */
function purgeLegacyLocalSession(): void {
  try {
    if (localStorage.getItem(AUTH_KEY) !== null) localStorage.removeItem(AUTH_KEY);
  } catch {
    /* حالت private mode — مهم نیست */
  }
}

export function readAuthSession(): AuthSession | null {
  try {
    purgeLegacyLocalSession();
    const raw = parseStoredJson<Record<string, unknown>>(sessionStorage.getItem(AUTH_KEY), {});
    if (raw && typeof raw.username === 'string' && typeof raw.token === 'string' && raw.token) {
      return { username: raw.username, token: raw.token };
    }
    // مهاجرت از فرمت قدیمی { loggedIn: true }
    if (raw?.loggedIn && typeof raw.username === 'string') {
      return null; // نشست قدیمی دیگر معتبر نیست — ورود مجدد لازم است
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function writeAuthSession(session: AuthSession): void {
  purgeLegacyLocalSession();
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } finally {
    purgeLegacyLocalSession();
  }
}

export async function createAuthSession(username: string, password: string): Promise<AuthSession> {
  if (window.electronAPI?.auth) {
    const result = await window.electronAPI.auth.createSession(username, password);
    if (!result.success || !result.token) {
      throw new Error(result.error || 'Login failed');
    }
    const session = { username: result.username || username, token: result.token };
    writeAuthSession(session);
    return session;
  }
  // وب: توکن تصادفی محلی (پسورد همین الان با verifyCredentials چک شده)
  const session = { username, token: crypto.randomUUID() };
  writeAuthSession(session);
  return session;
}

/** برای اولین راه‌اندازی حساب — پسورد قبلاً ذخیره شده */
export async function createAuthSessionAfterSetup(username: string, password: string): Promise<AuthSession> {
  return createAuthSession(username, password);
}

export async function validateAuthSession(): Promise<AuthSession | null> {
  const session = readAuthSession();
  if (!session) return null;

  if (window.electronAPI?.auth) {
    const result = await window.electronAPI.auth.validateSession(session.token);
    if (!result.valid || (result.username && result.username !== session.username)) {
      clearAuthSession();
      return null;
    }
    return session;
  }

  // وب: فقط وجود توکن + تطبیق نام کاربری با settings کافی است (در App چک می‌شود)
  return session;
}

export async function destroyAuthSession(): Promise<void> {
  const session = readAuthSession();
  if (session && window.electronAPI?.auth) {
    await window.electronAPI.auth.destroySession(session.token);
  }
  clearAuthSession();
}

export async function updateAuthUsername(username: string): Promise<void> {
  const session = readAuthSession();
  if (!session) return;
  if (window.electronAPI?.auth) {
    await window.electronAPI.auth.updateUsername(session.token, username);
  }
  writeAuthSession({ ...session, username });
}
