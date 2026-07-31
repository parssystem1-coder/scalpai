import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * تست دود — جریان ورود (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * چرا این تست وجود دارد: تا پیش از فاز ۴، هیچ فایل `*.test.tsx` در مخزن نبود
 * (`find src -name "*.test.tsx"` = صفر). یعنی ۲۷۳ تست موجود همه منطق خالص را
 * می‌سنجیدند و **هیچ‌کدام نمی‌فهمید اگر صفحهٔ ورود اصلاً رندر نشود**.
 *
 * دامنه عمداً محدود است: این «آژیر آتش» است نه پوشش کامل. اگر این تست قرمز
 * شود یعنی کاربر اصلاً نمی‌تواند وارد برنامه شود — بدترین حالت ممکن.
 */

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// لایهٔ دیتابیس mock می‌شود: این تست جریان UI را می‌سنجد، نه SQLite را
// (قرارداد دیتابیس جای دیگری با scripts/test-db-contract.cjs پوشش دارد).
const verifyCredentials = vi.fn();
const getSettings = vi.fn();
vi.mock('../../db', () => ({
  db: {
    get verifyCredentials() { return verifyCredentials; },
    get getSettings() { return getSettings; },
  },
  electronUtils: { isElectron: false },
  encryptionUtils: { isElectron: false, getStatus: async () => null },
}));

const createAuthSession = vi.fn();
const createAuthSessionAfterSetup = vi.fn();
vi.mock('../../lib/authSession', () => ({
  get createAuthSession() { return createAuthSession; },
  get createAuthSessionAfterSetup() { return createAuthSessionAfterSetup; },
}));

import Login from '../../pages/Login';
import { useSettingsStore } from '../../store';

/** تنظیمات را طوری می‌گذارد که انگار حساب از قبل ساخته شده است */
function primeExistingAccount() {
  useSettingsStore.setState({
    settings: { language: 'fa', theme: 'mint', aiConfidenceThreshold: 0.7, username: 'drsmith' },
    loading: false,
  });
}

const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ language: 'fa', theme: 'mint', username: 'drsmith' });
  createAuthSession.mockResolvedValue({ username: 'drsmith', token: 't-1' });
});

describe('تست دود / AUD-13 — جریان ورود', () => {
  it('صفحهٔ ورود رندر می‌شود و فیلدهای لازم را دارد', async () => {
    primeExistingAccount();
    renderLogin();

    expect(await screen.findByPlaceholderText('نام کاربری')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('رمز عبور')).toBeInTheDocument();
    // عنوان باید «ورود» باشد نه «ایجاد حساب» چون username از قبل هست
    expect(screen.getByText('ورود به سیستم')).toBeInTheDocument();
  });

  it('با اطلاعات درست، نشست ساخته و کاربر به صفحهٔ اصلی هدایت می‌شود', async () => {
    primeExistingAccount();
    verifyCredentials.mockResolvedValue(true);
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByPlaceholderText('نام کاربری'), 'drsmith');
    await user.type(screen.getByPlaceholderText('رمز عبور'), 'correct-pass-1');
    await user.click(screen.getByRole('button', { name: /ورود/ }));

    await waitFor(() => expect(createAuthSession).toHaveBeenCalledWith('drsmith', 'correct-pass-1'));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('با رمز اشتباه، پیام خطا نشان داده می‌شود و هدایتی رخ نمی‌دهد', async () => {
    primeExistingAccount();
    verifyCredentials.mockResolvedValue(false);
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByPlaceholderText('نام کاربری'), 'drsmith');
    await user.type(screen.getByPlaceholderText('رمز عبور'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: /ورود/ }));

    expect(await screen.findByText('نام کاربری یا رمز عبور اشتباه است')).toBeInTheDocument();
    // مهم‌ترین بخش: نباید نشست بسازد و نباید وارد برنامه شود
    expect(createAuthSession).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('در اولین اجرا (بدون حساب)، رمز کوتاه رد می‌شود و حساب ساخته نمی‌شود', async () => {
    // این گارد واقعی است: بدون آن، کاربر می‌توانست کلینیک را با رمز «۱» راه بیندازد.
    // نکته: کامپوننت هنگام mount خودش fetchSettings را صدا می‌زند و state را
    // بازنویسی می‌کند؛ پس پاسخ لایهٔ داده هم باید «بدون حساب» باشد وگرنه
    // فرم به حالت «ورود» برمی‌گردد.
    getSettings.mockResolvedValue({ language: 'fa', theme: 'mint' });
    useSettingsStore.setState({
      settings: { language: 'fa', theme: 'mint', aiConfidenceThreshold: 0.7 },
      loading: false,
    });
    const user = userEvent.setup();
    renderLogin();

    expect(await screen.findByText('ایجاد حساب کاربری')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('نام کاربری'), 'dr');
    await user.type(screen.getByPlaceholderText('رمز عبور'), '12');
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب و ورود' }));

    await waitFor(() => expect(screen.getByText(/حداقل ۳/)).toBeInTheDocument());
    expect(createAuthSessionAfterSetup).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
