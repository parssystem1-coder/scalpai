/**
 * مدیریت نشست ورود — Electron از توکن main-process استفاده می‌کند؛
 * وب همچنان یک توکن محلی تصادفی نگه می‌دارد (به‌جای فلگ loggedIn).
 */

import { parseStoredJson } from './safeJson';

const AUTH_KEY = 'scalpai_auth';

export interface AuthSession {
  username: string;
  /** توکن نشست — در Electron توسط main صادر می‌شود */
  token: string;
}

export function readAuthSession(): AuthSession | null {
  try {
    const raw = parseStoredJson<Record<string, unknown>>(localStorage.getItem(AUTH_KEY), {});
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
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_KEY);
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
