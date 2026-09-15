import { REDACTED, isSensitiveKey, scrubText } from "@scalpai/shared";
import { NotifyError } from "./types.js";

/**
 * phi-redact مخصوص دروازه پیام (فاز ۵a).
 *
 * قانون PHI در packages/shared/src/phi.ts زندگی می‌کند و این فایل آن را تکرار
 * نمی‌کند — دو فهرست PHI در دو پکیج یعنی فردا یکیشان عقب می‌ماند. اینجا فقط دو
 * کار مخصوص پیام انجام می‌شود:
 *
 *   ۱) `redactVars` — تنها چیزی که مجاز است به `message_log.vars_redacted` برسد.
 *      قید message_log_vars_no_phi_chk در 0017 همان قاعده را در دیتابیس تکرار
 *      می‌کند، پس اگر این تابع دور زده شود، INSERT می‌شکند نه اینکه بی‌صدا
 *      رد شود.
 *
 *   ۲) `redactRecipient` / `previewBody` — پروجکشن‌هایی که لاگ و فهرست inbox
 *      می‌خوانند. هرگز کل متن و هرگز کل شماره.
 *
 * بازبینی فاز ۵a/۵b: `scrubText` مشترک فقط شماره‌ی ۱۱ رقمیِ چسبیده را می‌گیرد.
 * رقم فارسی/عربی، پیش‌شماره +98/0098 و شماره‌ی جدا-جدا از دستش در می‌رفتند.
 */

export const RECIPIENT_MASK_VISIBLE = 4;
export const INBOX_PREVIEW_MAX = 200;

export type VarValue = string | number | boolean;

const PERSIAN_DIGITS = /[۰-۹]/g;
const ARABIC_DIGITS = /[٠-٩]/g;
const LONG_DIGIT_RUN = /\d(?:[\s().-]*\d){6,}/;
const IRANIAN_PHONE = /(?:(?:\+|00)?98[\s.-]?)?0?9(?:[\s.-]?\d){9}/;

function toAsciiDigits(value: string): string {
  return value
    .replace(PERSIAN_DIGITS, (digit) => String(digit.charCodeAt(0) - "۰".charCodeAt(0)))
    .replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) - "٠".charCodeAt(0)));
}

/**
 * پاک‌سازی متن پروایدر پیش از آنکه به پیش‌نمایش inbox یا reason یک خطا تبدیل
 * شود. `scrubText` مشترک اعتبارنامه/ایمیل/شماره‌ی استاندارد را می‌گیرد؛ این
 * لایه رقم فارسی، +98/0098 و شماره‌ی جدا-جدا را هم می‌گیرد.
 */
export function containsSensitivePhone(value: string): boolean {
  return IRANIAN_PHONE.test(toAsciiDigits(value));
}

export function containsLongNumericIdentifier(value: string): boolean {
  return LONG_DIGIT_RUN.test(toAsciiDigits(value));
}

export function scrubNotificationText(value: string): string {
  const shared = scrubText(value);
  const normalized = toAsciiDigits(shared);
  return normalized.replace(/(?:(?:\+|00)?98[\s.-]?)?0?9(?:[\s.-]?\d){9}/g, REDACTED).replace(/\d(?:[\s().-]*\d){6,}/g, REDACTED);
}

/**
 * متغیرهای قابل ثبت. کلید PHI حذف می‌شود (نه مقدارش ماسک)، چون خودِ دانستن
 * اینکه `firstName` بوده برای audit کافی است و مقدارش نیست. مقدارِ متنیِ کلیدِ
 * بی‌خطر هم scrub می‌شود: ایمیل یا موبایلی که زیر نام `city` فرستاده شده بازهم
 * PHI است. مقدار عددی دست‌نخورده می‌ماند — مبلغ ریالی و شماره فاکتور PHI
 * نیستند و ماسک کردنشان فقط لاگ را بی‌فایده می‌کند.
 */
export function redactVars(vars: Readonly<Record<string, unknown>>): Record<string, VarValue> {
  const out: Record<string, VarValue> = {};
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined || value === null || isSensitiveKey(key)) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "string") {
      out[key] = scrubNotificationText(value);
      continue;
    }
    out[key] = REDACTED;
  }
  return out;
}

/** ماسک مخاطب برای پیام خطای قابل خواندن: `…4567`. نه قابل بازگشت، نه بی‌معنا. */
export function redactRecipient(to: string): string {
  const digits = to.replace(/\D/g, "");
  if (digits.length <= RECIPIENT_MASK_VISIBLE) return REDACTED;
  return `…${digits.slice(-RECIPIENT_MASK_VISIBLE)}`;
}

/** پیش‌نمایش inbox: بدون توکن، بدون ایمیل، بدون موبایل، کوتاه‌شده. */
export function previewBody(body: string): string {
  const scrubbed = scrubNotificationText(body.replace(/\s+/g, " ").trim());
  return scrubbed.length > INBOX_PREVIEW_MAX ? `${scrubbed.slice(0, INBOX_PREVIEW_MAX - 1)}…` : scrubbed;
}

/**
 * نگهبان fail-closed برای مسیر نوشتن. همان کاری که assertRedactedPhiPayload برای
 * ledger می‌کند: اگر یک مسیر تازه redactVars را فراموش کند، در CI می‌شکند نه
 * در لاگ production.
 */
export function assertVarsRedacted(vars: Readonly<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (isSensitiveKey(key)) {
      throw new NotifyError(`vars.${key} is PHI and must be dropped before it reaches message_log`);
    }
    if (typeof value === "string" && scrubNotificationText(value) !== value) {
      throw new NotifyError(`vars.${key} contains sensitive text and must be scrubbed before it reaches message_log`);
    }
  }
}
