import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * تست دود — درگاه رضایت‌نامه (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * این جریان مستقیماً به ادعای انطباق در `docs/privacy.md` گره خورده است:
 * «تا ثبت رضایت‌نامه، تحلیل آنلاین مسدود است». اگر این modal یک روز به‌خاطر
 * یک تغییر بی‌ربط رندر نشود، برنامه بی‌سروصدا بدون رضایت کاربر کار می‌کند و
 * ادعای سند دروغ می‌شود — بدون اینکه هیچ تستی بفهمد.
 *
 * منطق خالص `hasValidPrivacyConsent` جای دیگری تست شده
 * (`src/lib/privacyConsent.test.ts`)؛ این‌جا فقط **رفتار واقعی UI** سنجیده
 * می‌شود: آیا واقعاً ظاهر می‌شود، آیا واقعاً غیرقابل‌رد است، آیا کلیک ثبت
 * می‌کند.
 */

vi.mock('../../db', () => ({
  db: { getSettings: vi.fn(async () => ({ language: 'fa', theme: 'mint' })) },
  electronUtils: { isElectron: false },
  encryptionUtils: { isElectron: false, getStatus: async () => null },
}));

import PrivacyConsentModal from '../../components/PrivacyConsentModal';
import { useSettingsStore } from '../../store';
import { PRIVACY_CONSENT_VERSION } from '../../lib/privacyConsent';

const updateSettings = vi.fn();

/**
 * modal عمداً تا کامل شدن اولین fetch تصمیم نمی‌گیرد (جلوگیری از فلش).
 * پس برای دیده شدن، باید گذار loading:true → false شبیه‌سازی شود.
 */
async function primeAfterFirstFetch(settings: Record<string, unknown>) {
  useSettingsStore.setState({ settings: settings as never, loading: true, updateSettings } as never);
  let view!: ReturnType<typeof render>;
  // هر دو مرحله داخل act: هم رندر اولیه، هم گذار loading→false که باعث
  // به‌روزرسانی state داخل کامپوننت می‌شود.
  await act(async () => {
    view = render(<PrivacyConsentModal />);
  });
  await act(async () => {
    useSettingsStore.setState({ loading: false });
  });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  updateSettings.mockResolvedValue(undefined);
});

describe('تست دود / AUD-13 — درگاه رضایت‌نامه', () => {
  it('بدون رضایت ثبت‌شده، رضایت‌نامه نمایش داده می‌شود', async () => {
    await primeAfterFirstFetch({ language: 'fa', theme: 'mint' });

    expect(await screen.findByText('حریم‌خصوصی و ذخیره‌سازی داده')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /می‌پذیرم/ })).toBeInTheDocument();
  });

  it('غیرقابل‌رد است: هیچ دکمهٔ بستن یا انصرافی ندارد', async () => {
    // این ویژگی عمدی است (docs/privacy.md): کاربر باید حداقل یک‌بار بداند
    // دادهٔ بالینی کجا نگه داشته می‌شود، حتی اگر هرگز AI ابری نزند.
    await primeAfterFirstFetch({ language: 'fa', theme: 'mint' });
    await screen.findByText('حریم‌خصوصی و ذخیره‌سازی داده');

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1); // فقط دکمهٔ پذیرش
    expect(screen.queryByRole('button', { name: /انصراف|بستن|Close|Cancel/ })).toBeNull();
  });

  it('با کلیک روی پذیرش، رضایت با نسخهٔ درست ثبت می‌شود', async () => {
    const user = userEvent.setup();
    await primeAfterFirstFetch({ language: 'fa', theme: 'mint' });

    await user.click(await screen.findByRole('button', { name: /می‌پذیرم/ }));

    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    const payload = updateSettings.mock.calls[0][0] as { privacyConsent: { version: string; at: string } };
    // نسخه باید همان ثابت مرکزی باشد — اگر روزی رضایت‌نامه عوض شود و نسخه
    // بامپ نشود، کاربران قدیمی بی‌سروصدا «راضی» فرض می‌شوند.
    expect(payload.privacyConsent.version).toBe(PRIVACY_CONSENT_VERSION);
    expect(new Date(payload.privacyConsent.at).toString()).not.toBe('Invalid Date');
  });

  it('با رضایت معتبر، اصلاً نمایش داده نمی‌شود (مزاحم کاربر نمی‌شود)', async () => {
    await primeAfterFirstFetch({
      language: 'fa',
      theme: 'mint',
      privacyConsent: { version: PRIVACY_CONSENT_VERSION, at: new Date().toISOString() },
    });

    await waitFor(() => {
      expect(screen.queryByText('حریم‌خصوصی و ذخیره‌سازی داده')).toBeNull();
    });
  });

  it('با نسخهٔ رضایت قدیمی، دوباره پرسیده می‌شود', async () => {
    // سناریوی واقعی: متن رضایت‌نامه عوض شده و نسخه بامپ شده؛ کاربر باید
    // دوباره تأیید کند، نه اینکه رضایت کهنه‌اش برای همیشه معتبر بماند.
    await primeAfterFirstFetch({
      language: 'fa',
      theme: 'mint',
      privacyConsent: { version: 'v0-outdated', at: new Date().toISOString() },
    });

    expect(await screen.findByText('حریم‌خصوصی و ذخیره‌سازی داده')).toBeInTheDocument();
  });
});
