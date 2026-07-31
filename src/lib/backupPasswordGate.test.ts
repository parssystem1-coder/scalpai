import { describe, expect, it } from 'vitest';
// @ts-expect-error db-common has no type declaration file
import { assertBackupPasswordWhenEncryptionActive } from '../../electron/db-common.cjs';

/**
 * فاز ۱ / AUD-9 — گیت سخت «پسورد بکاپ اجباری»
 * -----------------------------------------------------------------------
 * مشکلی که این گیت می‌بندد: وقتی رمزنگاری فعال است، تصاویر داخل فایل پشتیبان
 * به‌صورت رمزشده کپی می‌شوند — ولی کلید بازکردنشان هم در همان بسته می‌رود
 * (`mediaEncryption.key`)، تا بازیابی روی دستگاه دیگر ممکن باشد. نتیجه: بکاپ
 * بدون پسورد عملاً معادل دادهٔ کاملاً باز است؛ مثل قفل‌کردن صندوق و چسباندن
 * کلید روی درش.
 *
 * تصمیم مالک: پسورد در این حالت **اجباری** است، نه هشدار نرم.
 *
 * این گیت عمداً در main-process تست می‌شود و نه در UI، چون هر گیت امنیتی که
 * فقط در رابط کاربری باشد با یک فراخوانی مستقیم IPC دور زده می‌شود.
 */

const gate = assertBackupPasswordWhenEncryptionActive as (
  key: Buffer | null | undefined,
  password: string | null | undefined,
) => void;

const FAKE_KEY = Buffer.alloc(32, 7);

describe('فاز ۱ / AUD-9 — گیت پسورد اجباری برای بکاپ', () => {
  it('با رمزنگاری فعال و بدون پسورد، ساختن بکاپ رد می‌شود', () => {
    expect(() => gate(FAKE_KEY, undefined)).toThrow('backup-password-required');
    expect(() => gate(FAKE_KEY, null)).toThrow('backup-password-required');
    // رشتهٔ خالی هم «پسورد» نیست
    expect(() => gate(FAKE_KEY, '')).toThrow('backup-password-required');
  });

  it('با رمزنگاری فعال و پسورد معتبر، اجازه داده می‌شود', () => {
    expect(() => gate(FAKE_KEY, 'a-strong-passphrase')).not.toThrow();
  });

  it('وقتی رمزنگاری غیرفعال است، رفتار قبلی دست‌نخورده می‌ماند', () => {
    // در این حالت هیچ کلیدی داخل بسته نمی‌رود، پس چیزی برای نشت وجود ندارد و
    // نباید کاربر را بی‌دلیل مجبور به پسورد کنیم (سازگاری عقب‌رو).
    expect(() => gate(null, undefined)).not.toThrow();
    expect(() => gate(undefined, '')).not.toThrow();
    expect(() => gate(null, 'with-password-also-fine')).not.toThrow();
  });
});
