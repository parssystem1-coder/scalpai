import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * تست دود — ثبت مراجع جدید (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * چرا این جریان: ثبت مراجع، **اولین کاری** است که کاربر روز اول در کلینیک
 * انجام می‌دهد. اگر این فرم کار نکند، هیچ‌چیز دیگری در برنامه قابل استفاده
 * نیست (جلسه، تحلیل و گالری همه به یک مراجع نیاز دارند).
 */

const createClient = vi.fn();
const getClientsPage = vi.fn();
vi.mock('../../db', () => ({
  db: {},
  electronUtils: { isElectron: false },
  encryptionUtils: { isElectron: false, getStatus: async () => null },
}));

import Clients from '../../pages/Clients';
import { useClientsStore } from '../../store';

/** استور را با اکشن‌های mock پر می‌کند تا لایهٔ دیتابیس درگیر نشود */
function primeStore(overrides: Record<string, unknown> = {}) {
  useClientsStore.setState({
    managedClients: [],
    managedLoading: false,
    managedTotal: 0,
    managedPage: 1,
    managedPageSize: 20,
    managedSearch: '',
    fetchManagedClients: getClientsPage,
    setManagedSearch: vi.fn(),
    goToManagedPage: vi.fn(),
    addClient: createClient,
    updateClient: vi.fn(),
    deleteClient: vi.fn(),
    ...overrides,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  getClientsPage.mockResolvedValue(undefined);
  createClient.mockResolvedValue({ id: 'c-1', firstName: 'Ali', lastName: 'Rezaei' });
  primeStore();
});

/**
 * فرم را باز می‌کند. نکته: هم دکمهٔ هدر و هم عنوان مودال متن «New Client»
 * دارند، پس عمداً با نقش `button` تفکیک می‌شود نه با متن تنها.
 */
async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'New Client' }));
  // حضور فیلدهای فرم، نشانهٔ باز شدن مودال است (متن عنوان مبهم است)
  return await screen.findByPlaceholderText('First Name');
}

/** فرم را باز و با دادهٔ معتبر پر می‌کند */
async function openAndFillForm(user: ReturnType<typeof userEvent.setup>) {
  await openForm(user);
  await user.type(screen.getByPlaceholderText('First Name'), 'Ali');
  await user.type(screen.getByPlaceholderText('Last Name'), 'Rezaei');
  await user.type(screen.getByPlaceholderText('Phone'), '09120000000');
}

describe('تست دود / AUD-13 — ثبت مراجع', () => {
  it('صفحهٔ مراجعان رندر می‌شود و فهرست را می‌خواند', async () => {
    render(<Clients />);
    // اگر این فراخوانی نشود، کاربر همیشه فهرست خالی می‌بیند
    await waitFor(() => expect(getClientsPage).toHaveBeenCalled());
  });

  it('فرم مراجع جدید باز می‌شود و ثبت با داده‌های واردشده انجام می‌گیرد', async () => {
    const user = userEvent.setup();
    render(<Clients />);
    await openAndFillForm(user);

    await user.click(screen.getByRole('button', { name: 'Add Client' }));

    await waitFor(() => expect(createClient).toHaveBeenCalledTimes(1));
    expect(createClient.mock.calls[0][0]).toMatchObject({
      firstName: 'Ali',
      lastName: 'Rezaei',
      phone: '09120000000',
    });
    // پس از ثبت موفق، مودال باید بسته شود (فیلدهای فرم ناپدید شوند)
    await waitFor(() => expect(screen.queryByPlaceholderText('First Name')).toBeNull());
  });

  it('اگر ثبت شکست بخورد، مودال باز می‌ماند تا داده‌های کاربر از بین نرود', async () => {
    // این رفتار عمدی است (کامنت در Clients.tsx): بستن مودال هنگام خطا یعنی
    // کاربر همهٔ چیزی را که تایپ کرده از دست می‌دهد.
    createClient.mockRejectedValue(new Error('db unavailable'));
    const user = userEvent.setup();
    render(<Clients />);
    await openAndFillForm(user);

    await user.click(screen.getByRole('button', { name: 'Add Client' }));

    await waitFor(() => expect(createClient).toHaveBeenCalled());
    // مودال هنوز باز است و مقادیر واردشده سر جایشان هستند
    expect(screen.getByPlaceholderText('First Name')).toHaveValue('Ali');
    expect(screen.getByPlaceholderText('Phone')).toHaveValue('09120000000');
  });

  it('فیلدهای ضروری اجباری‌اند (نام، نام خانوادگی، تلفن)', async () => {
    const user = userEvent.setup();
    render(<Clients />);
    await openForm(user);

    expect(screen.getByPlaceholderText('First Name')).toBeRequired();
    expect(screen.getByPlaceholderText('Last Name')).toBeRequired();
    expect(screen.getByPlaceholderText('Phone')).toBeRequired();
    // ایمیل عمداً اختیاری است — بیمار ممکن است ایمیل نداشته باشد
    expect(screen.getByPlaceholderText('Email')).not.toBeRequired();
  });
});
