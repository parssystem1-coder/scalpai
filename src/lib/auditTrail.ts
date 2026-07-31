/**
 * auditTrail — منطق خالص نمایش ردپای حسابرسی (فاز ۲ / AUD-11)
 * -----------------------------------------------------------------------
 * چرا این ماژول وجود دارد: تا پیش از این، متد `getAuditLog` فقط در
 * main-process بود و هیچ مسیری از رابط کاربری به آن نمی‌رسید. یعنی ادعای
 * «پاسخ‌پذیری» در `docs/privacy.md` عملاً برای کاربر دست‌نیافتنی بود — چیزی
 * که در ممیزی واقعی کلینیک قابل دفاع نیست.
 *
 * منطق (ترجمهٔ رویداد، قالب‌بندی تاریخ شمسی، ساخت CSV) عمداً از کامپوننت جدا
 * شده تا بدون رندر کردن UI قابل تست باشد — همان الگویی که بقیهٔ `src/lib` دارد.
 */

import type { AuditLogEntry } from '../db/types';
import { gregorianToPersian } from './jalaliDate';

/**
 * واژه‌نامهٔ رویدادها — باید با `AUDIT_EVENTS` در `electron/audit.cjs` هم‌گام
 * بماند. اگر رویداد جدیدی آن‌جا اضافه شد و این‌جا نه، تست
 * `auditTrail.test.ts` قرمز می‌شود (گارد هم‌گامی).
 */
export const AUDIT_EVENT_LABELS: Record<string, { fa: string; en: string }> = {
  'auth.login': { fa: 'ورود به برنامه', en: 'Sign in' },
  'auth.logout': { fa: 'خروج از برنامه', en: 'Sign out' },
  'data.export': { fa: 'صدور داده (پشتیبان‌گیری)', en: 'Data export (backup)' },
  'data.import': { fa: 'ورود داده (بازیابی)', en: 'Data import (restore)' },
  'client.delete': { fa: 'حذف مراجع و دادهٔ او', en: 'Client deletion' },
  'ai.cloud.request': { fa: 'ارسال تصویر به سرویس ابری', en: 'Cloud AI request' },
  'db.encryption.migrated': { fa: 'رمزنگاری پایگاه داده', en: 'Database encrypted' },
  'images.legacy.encrypted': { fa: 'رمزنگاری تصاویر قدیمی', en: 'Legacy images encrypted' },
};

/** رویدادهایی که از نظر حریم خصوصی «خروج داده» محسوب می‌شوند و باید برجسته شوند */
export const SENSITIVE_AUDIT_EVENTS = new Set([
  'data.export',
  'ai.cloud.request',
  'client.delete',
]);

/**
 * برچسب خوانا برای یک رویداد.
 * رویداد ناشناخته (مثلاً از نسخهٔ جدیدتر که بکاپش بازیابی شده) هرگز باعث
 * خطا نمی‌شود؛ خودِ شناسهٔ خام نمایش داده می‌شود — بهتر از پنهان کردن یک
 * رویداد حسابرسی است.
 */
export function auditEventLabel(event: string, lang: 'fa' | 'en'): string {
  const entry = AUDIT_EVENT_LABELS[event];
  return entry ? entry[lang] : event;
}

/** آیا این رویداد از نوع «خروج/حذف داده» است؟ (برای رنگ‌بندی در UI) */
export function isSensitiveAuditEvent(event: string): boolean {
  return SENSITIVE_AUDIT_EVENTS.has(event);
}

/**
 * قالب‌بندی زمان رویداد به تقویم شمسی + ساعت.
 * ورودی ISO است (همان چیزی که `audit.cjs` می‌نویسد). ورودی نامعتبر باعث
 * کرش صفحه نمی‌شود و خام برگردانده می‌شود.
 */
export function formatAuditTimestamp(iso: string, lang: 'fa' | 'en'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '';
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  if (lang === 'en') {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }
  const p = gregorianToPersian(date);
  const pm = (p.month + 1).toString().padStart(2, '0');
  const pd = p.day.toString().padStart(2, '0');
  return `${p.year}/${pm}/${pd} ${hh}:${mm}`;
}

/**
 * خلاصهٔ خوانا از فیلد `detail` (که JSON فشرده است).
 * قرارداد امنیتی `audit.cjs`: این فیلد هرگز دادهٔ بالینی/کلید/پسورد ندارد،
 * پس نمایشش امن است. اگر JSON نبود، همان متن خام برگردانده می‌شود.
 */
export function summarizeAuditDetail(detail: string | null): string {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail);
    if (parsed === null || typeof parsed !== 'object') return String(detail);
    return Object.entries(parsed as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('، ');
  } catch {
    return detail;
  }
}

/** یک فیلد را برای CSV امن می‌کند (نقل‌قول و جداکننده) */
function csvCell(value: string): string {
  const needsQuote = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

/**
 * ساخت متن CSV برای بازرس/ممیز.
 *
 * نکتهٔ امنیتی عمدی: مقادیری که با `= + - @` شروع می‌شوند با یک نقل‌قول
 * خنثی می‌شوند تا اکسل آن‌ها را به‌عنوان فرمول اجرا نکند (CSV injection).
 * لاگ حسابرسی سندی است که ممکن است به بازرس بیرونی داده شود؛ نباید تبدیل به
 * بردار حمله شود.
 *
 * BOM ابتدای فایل برای این است که اکسل ویندوز فارسی را درست نشان دهد.
 */
export function buildAuditCsv(entries: AuditLogEntry[], lang: 'fa' | 'en'): string {
  const header = lang === 'fa'
    ? ['زمان', 'رویداد', 'کاربر', 'جزئیات', 'شناسه']
    : ['Time', 'Event', 'Actor', 'Detail', 'ID'];

  const neutralize = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);

  const rows = entries.map(e => [
    formatAuditTimestamp(e.createdAt, lang),
    auditEventLabel(e.event, lang),
    e.actor ?? '',
    summarizeAuditDetail(e.detail),
    e.id,
  ].map(cell => csvCell(neutralize(cell))).join(','));

  return '\uFEFF' + [header.map(csvCell).join(','), ...rows].join('\r\n');
}

/** تعداد صفحات بر اساس اندازهٔ صفحه (حداقل ۱ تا UI صفحهٔ صفر نشان ندهد) */
export function auditPageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** اندازهٔ صفحهٔ پیش‌فرض جدول ردپای حسابرسی */
export const AUDIT_PAGE_SIZE = 50;
