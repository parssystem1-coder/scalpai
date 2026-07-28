const SALT_LENGTH = 16;
const ITERATIONS = 100000;

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return `pbkdf2:${ITERATIONS}:${bufferToBase64(salt.buffer)}:${bufferToBase64(derived)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  // متن سادهٔ legacy دیگر پذیرفته نمی‌شود (مهاجرت در adapter-web.verifyCredentials)
  if (!stored.startsWith('pbkdf2:') && !stored.startsWith('scrypt:')) {
    return false;
  }
  if (stored.startsWith('pbkdf2:')) {
    const [, iterationsStr, saltB64, hashB64] = stored.split(':');
    const iterations = parseInt(iterationsStr, 10);
    const salt = base64ToBuffer(saltB64);
    const expected = base64ToBuffer(hashB64);
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const derivedBytes = new Uint8Array(derived);
    if (derivedBytes.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < derivedBytes.length; i++) diff |= derivedBytes[i] ^ expected[i];
    return diff === 0;
  }
  // scrypt فقط در Electron (Node crypto) قابل تأیید است؛ پسوردهای جدید Electron
  // هم با pbkdf2 نوشته می‌شوند. هش scrypt قدیمی روی وب نیاز به ورود مجدد دارد.
  if (stored.startsWith('scrypt:')) {
    return false;
  }
  return false;
}

/** فقط برای مهاجرت یک‌بارهٔ پسورد متن‌ساده */
export function verifyLegacyPlaintextPassword(password: string, stored: string): boolean {
  if (!stored || stored.startsWith('pbkdf2:') || stored.startsWith('scrypt:')) return false;
  return password === stored;
}

export function isLegacyPlaintextPassword(stored: string | undefined): boolean {
  return !!(stored && !stored.startsWith('pbkdf2:') && !stored.startsWith('scrypt:'));
}

export function stripPasswordFromSettings<T extends { password?: string; passwordHash?: string; aiApiKey?: string }>(
  settings: T
): Omit<T, 'password' | 'passwordHash'> & { hasPassword: boolean; hasApiKey: boolean } {
  const { password, passwordHash, ...rest } = settings;
  return {
    ...rest,
    hasPassword: !!(passwordHash || password),
    hasApiKey: !!settings.aiApiKey,
  };
}
