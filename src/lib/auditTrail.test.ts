import { describe, expect, it } from 'vitest';
import {
  AUDIT_EVENT_LABELS,
  auditEventLabel,
  auditPageCount,
  buildAuditCsv,
  formatAuditTimestamp,
  isSensitiveAuditEvent,
  summarizeAuditDetail,
} from './auditTrail';
// @ts-expect-error audit.cjs has no type declaration file
import { AUDIT_EVENTS, applyAuditRetention, auditRetentionCutoff, AUDIT_MAX_ROWS, AUDIT_RETENTION_MONTHS } from '../../electron/audit.cjs';
import type { AuditLogEntry } from '../db/types';

/**
 * فاز ۲ / AUD-11 و AUD-12 — ردپای حسابرسی
 * -----------------------------------------------------------------------
 * چرا این تست‌ها مهم‌اند: سند privacy.md ادعای «پاسخ‌پذیری» می‌کند. اگر
 * واژه‌نامهٔ رویدادها از کد main عقب بماند، بازرس یک شناسهٔ خام انگلیسی
 * می‌بیند و ادعا بی‌پشتوانه می‌شود. تست اول دقیقاً همین را گارد می‌کند.
 */

const entry = (over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  id: 'id-1',
  event: 'data.export',
  actor: 'local-user',
  detail: '{"format":"v4-encrypted","passwordProtected":true}',
  createdAt: '2026-03-21T10:30:00.000Z',
  ...over,
});

describe('فاز ۲ / AUD-11 — واژه‌نامهٔ رویدادها', () => {
  it('گارد هم‌گامی: هر رویداد در audit.cjs باید ترجمهٔ فارسی و انگلیسی داشته باشد', () => {
    const codes = Object.values(AUDIT_EVENTS as Record<string, string>);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const label = AUDIT_EVENT_LABELS[code];
      expect(label, `رویداد «${code}» در واژه‌نامهٔ UI ترجمه ندارد`).toBeDefined();
      expect(label.fa.length).toBeGreaterThan(0);
      expect(label.en.length).toBeGreaterThan(0);
      // ترجمهٔ فارسی نباید همان شناسهٔ خام رها شده باشد
      expect(label.fa).not.toBe(code);
    }
  });

  it('واژه‌نامه رویداد اضافی و بی‌مصرف ندارد (جلوگیری از انباشت مردهٔ کلید)', () => {
    const codes = new Set(Object.values(AUDIT_EVENTS as Record<string, string>));
    for (const key of Object.keys(AUDIT_EVENT_LABELS)) {
      expect(codes.has(key), `کلید «${key}» در AUDIT_EVENTS وجود ندارد`).toBe(true);
    }
  });

  it('رویداد ناشناخته باعث خطا نمی‌شود و شناسهٔ خام را نشان می‌دهد', () => {
    // سناریوی واقعی: بازیابی بکاپی که با نسخهٔ جدیدتر ساخته شده. پنهان کردن
    // یک رویداد حسابرسی بدتر از نشان دادن شناسهٔ خام است.
    expect(auditEventLabel('future.event.v9', 'fa')).toBe('future.event.v9');
  });

  it('رویدادهای خروج/حذف داده حساس علامت‌گذاری می‌شوند', () => {
    expect(isSensitiveAuditEvent('data.export')).toBe(true);
    expect(isSensitiveAuditEvent('ai.cloud.request')).toBe(true);
    expect(isSensitiveAuditEvent('client.delete')).toBe(true);
    expect(isSensitiveAuditEvent('auth.login')).toBe(false);
  });
});

describe('فاز ۲ / AUD-11 — قالب‌بندی و خلاصه', () => {
  it('تاریخ فارسی شمسی و تاریخ انگلیسی میلادی است', () => {
    const fa = formatAuditTimestamp('2026-03-21T10:30:00.000Z', 'fa');
    // ۲۰۲۶-۰۳-۲۱ ابتدای سال ۱۴۰۵ شمسی است
    expect(fa).toMatch(/^140\d\/\d{2}\/\d{2} \d{2}:\d{2}$/);
    const en = formatAuditTimestamp('2026-03-21T10:30:00.000Z', 'en');
    expect(en).toMatch(/^2026-03-\d{2} \d{2}:\d{2}$/);
  });

  it('تاریخ نامعتبر باعث کرش صفحه نمی‌شود', () => {
    expect(formatAuditTimestamp('not-a-date', 'fa')).toBe('not-a-date');
    expect(formatAuditTimestamp('', 'fa')).toBe('');
  });

  it('جزئیات JSON به متن خوانا تبدیل می‌شود و ورودی غیر-JSON سالم می‌ماند', () => {
    expect(summarizeAuditDetail('{"format":"v3","passwordProtected":false}'))
      .toBe('format: v3، passwordProtected: false');
    expect(summarizeAuditDetail('plain text')).toBe('plain text');
    expect(summarizeAuditDetail(null)).toBe('');
  });
});

describe('فاز ۲ / AUD-11 — خروجی CSV برای بازرس', () => {
  it('سرستون و ردیف تولید می‌کند و با BOM شروع می‌شود', () => {
    const csv = buildAuditCsv([entry()], 'fa');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('زمان');
    expect(lines[1]).toContain('صدور داده');
  });

  it('در برابر CSV injection مقاوم است (فرمول اکسل خنثی می‌شود)', () => {
    // لاگ حسابرسی ممکن است به بازرس بیرونی داده شود؛ نباید بردار حمله شود.
    const csv = buildAuditCsv([entry({ actor: '=cmd|calc!A1' })], 'en');
    expect(csv).toContain("'=cmd|calc!A1");
    expect(csv).not.toMatch(/,=cmd/);
  });

  it('فیلد دارای کاما و نقل‌قول درست escape می‌شود', () => {
    const csv = buildAuditCsv([entry({ actor: 'a,b"c' })], 'en');
    expect(csv).toContain('"a,b""c"');
  });
});

describe('فاز ۲ / AUD-11 — صفحه‌بندی', () => {
  it('تعداد صفحه درست محاسبه می‌شود و هرگز صفر نیست', () => {
    expect(auditPageCount(0, 50)).toBe(1);
    expect(auditPageCount(50, 50)).toBe(1);
    expect(auditPageCount(51, 50)).toBe(2);
    expect(auditPageCount(100, 50)).toBe(2);
  });
});

describe('فاز ۲ / AUD-12 — سیاست نگهداری', () => {
  const now = new Date('2026-07-31T00:00:00.000Z');

  it('مرز زمانی دقیقاً ۲۴ ماه قبل است', () => {
    expect(AUDIT_RETENTION_MONTHS).toBe(24);
    const cutoff = auditRetentionCutoff(now);
    expect(cutoff.startsWith('2024-07-31')).toBe(true);
  });

  it('رویداد قدیمی‌تر از مرز حذف و تازه‌تر نگه داشته می‌شود', () => {
    const kept = { id: 'new', createdAt: '2026-01-01T00:00:00.000Z' };
    const dropped = { id: 'old', createdAt: '2023-01-01T00:00:00.000Z' };
    const out = applyAuditRetention([kept, dropped], now) as Array<{ id: string }>;
    expect(out.map(e => e.id)).toEqual(['new']);
  });

  it('سقف تعدادی اعمال می‌شود و تازه‌ترین‌ها می‌مانند', () => {
    const many = Array.from({ length: AUDIT_MAX_ROWS + 10 }, (_, i) => ({
      id: `e-${i}`,
      // هرچه i بزرگ‌تر، تازه‌تر
      createdAt: new Date(now.getTime() - (AUDIT_MAX_ROWS + 10 - i) * 1000).toISOString(),
    }));
    const out = applyAuditRetention(many, now) as Array<{ id: string }>;
    expect(out).toHaveLength(AUDIT_MAX_ROWS);
    // خروجی از نو به کهنه مرتب است، پس اولی باید تازه‌ترین باشد
    expect(out[0].id).toBe(`e-${AUDIT_MAX_ROWS + 9}`);
  });

  it('ورودی خراب یا غیرآرایه باعث خطا نمی‌شود', () => {
    expect(applyAuditRetention(null as never, now)).toEqual([]);
    expect(applyAuditRetention([{ id: 'x' } as never], now)).toEqual([]);
  });
});
