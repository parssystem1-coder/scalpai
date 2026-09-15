import type { MessageLocale, MessagingChannel } from "@scalpai/shared";
import { containsSensitivePhone } from "./redact.js";
import { NotifyError } from "./types.js";

export interface MessageTemplate {
  readonly key: string;
  readonly body: Readonly<Record<MessageLocale, string>>;
  readonly vars: readonly string[];
  readonly channels?: readonly MessagingChannel[];
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,39})\s*\}\}/g;
function isForbiddenVarName(name: string): boolean {
  const normalized = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return ["firstname", "lastname", "fullname", "patientname", "patient", "mobile", "phone", "email", "address", "nationalid"].includes(normalized);
}

/**
 * نام متغیر کافی نیست، مقدارش هم کنترل می‌شود.
 *
 * یک متغیر مجاز مثل `when` یا `clinicName` هنوز متن آزاد است، و §13 طرح فقط
 * «متن عمومی + لینک توکن‌دارِ ساخته‌شده در سرور» را در پیام خروجی مجاز می‌داند.
 * پس کاراکتر کنترلی، ایمیل، لینک خام و رشته‌ی رقمی بلند (کد ملی، کارت، شماره
 * پرونده) اینجا رد می‌شوند نه اینکه ارسال شوند.
 *
 * وقتی متغیر لینکِ منقضی‌شدنی اضافه شد، همان‌جا یک allow-list صریح کنارش بگذارید
 * — قاعده‌ی لینک را شل نکنید.
 */
// eslint-disable-next-line no-control-regex -- intentionally matching control chars to reject them
const CONTROL_CHARS = /[-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
// \S+ avoids backtracking ambiguity that [^\s@]+ causes around the @ anchor.
const EMAIL_LIKE = /\S+@\S+\.\S{2,}/;
const LINK_LIKE = /(https?:\/\/|www\.)/i;
const LONG_DIGIT_RUN = /[0-9\u06F0-\u06F9\u0660-\u0669]{8,}/;

function unsafeValueReason(value: string): string | null {
  if (CONTROL_CHARS.test(value)) return "control characters";
  if (EMAIL_LIKE.test(value)) return "an email address";
  if (LINK_LIKE.test(value)) return "a raw link";
  if (LONG_DIGIT_RUN.test(value)) return "a long digit run";
  return null;
}

/**
 * قالب‌ها عمداً ثابت و scalar-only هستند. فیلدهای هویتی بیمار حتی در قالب‌های
 * آینده هم ممنوع‌اند، و مقداری که شکل شماره‌ی ایرانی دارد رد می‌شود نه اینکه
 * ارسال یا ذخیره شود.
 */
export const MESSAGE_TEMPLATES: Readonly<Record<string, MessageTemplate>> = {
  "aftercare.day1": {
    key: "aftercare.day1",
    vars: ["clinicName"],
    body: {
      fa: "سلام! ۲۴ ساعت از جلسه شما گذشته. تا فردا محل درمان را نشویید و دست نزنید. پرسشی دارید? همینجا پاسخ دهید. — {{clinicName}}",
      en: "Hello! It has been 24 hours since your session. Please keep the treated area dry and untouched until tomorrow. Questions? Just reply here. — {{clinicName}}",
    },
  },
  "aftercare.day3": {
    key: "aftercare.day3",
    vars: ["clinicName"],
    body: {
      fa: "روز سوم پس از جلسه: شستن ملایم با شامپوی ملایم مجاز است. از آب داغ و سونا پرهیز کنید. — {{clinicName}}",
      en: "Day 3 after your session: gentle washing with a mild shampoo is fine now. Avoid hot water and saunas. — {{clinicName}}",
    },
  },
  "aftercare.week2": {
    key: "aftercare.week2",
    vars: ["clinicName"],
    body: {
      fa: "دو هفته گذشت. برای ثبت تصویر پیگیری و بررسی روند، وقت کوتاهی لازم داریم. — {{clinicName}}",
      en: "Two weeks in. We need a short visit to capture a follow-up photo and review progress. — {{clinicName}}",
    },
  },
  "aftercare.month1": {
    key: "aftercare.month1",
    vars: ["clinicName"],
    body: {
      fa: "یک ماه از شروع درمان گذشت. تغییرات معمولاً از این مرحله قابل اندازه‌گیری می‌شوند. — {{clinicName}}",
      en: "One month into treatment. Changes usually become measurable from this point. — {{clinicName}}",
    },
  },
  "session.reminder": {
    key: "session.reminder",
    vars: ["clinicName", "when"],
    body: {
      fa: "یادآوری نوبت: {{when}}. اگر نمی‌توانید بیایید، همینجا اطلاع دهید. — {{clinicName}}",
      en: "Appointment reminder: {{when}}. If you cannot make it, just reply here. — {{clinicName}}",
    },
  },
  "invoice.issued": {
    key: "invoice.issued",
    vars: ["clinicName"],
    body: {
      fa: "صورتحساب شما آماده است. جزئیات در حساب کاربری شما در دسترس است. — {{clinicName}}",
      en: "Your invoice is ready. Details are available in your account. — {{clinicName}}",
    },
  },
  "invoice.paid": {
    key: "invoice.paid",
    vars: ["clinicName"],
    body: {
      fa: "پرداخت شما ثبت شد. جزئیات در حساب کاربری شما در دسترس است. — {{clinicName}}",
      en: "Your payment has been recorded. Details are available in your account. — {{clinicName}}",
    },
  },
};

export function isKnownTemplate(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(MESSAGE_TEMPLATES, key);
}

export function getTemplate(key: string): MessageTemplate {
  const template = MESSAGE_TEMPLATES[key];
  if (!template) throw new NotifyError(`unknown template '${key}'`);
  return template;
}

export interface RenderOptions {
  readonly locale: MessageLocale;
  readonly channel: MessagingChannel;
  readonly maxChars: number;
}

export interface RenderedMessage {
  readonly body: string;
  readonly chars: number;
  readonly templateKey: string;
  readonly locale: MessageLocale;
}

export function renderTemplate(
  key: string,
  vars: Readonly<Record<string, string | number | boolean>>,
  options: RenderOptions,
): RenderedMessage {
  const template = getTemplate(key);
  if (template.channels && !template.channels.includes(options.channel)) {
    throw new NotifyError(`template '${key}' is not available on channel '${options.channel}'`);
  }
  const source = template.body[options.locale];
  if (!source) throw new NotifyError(`template '${key}' has no '${options.locale}' body`);

  const allowed = new Set(template.vars);
  for (const name of Object.keys(vars)) {
    if (!allowed.has(name)) throw new NotifyError(`template '${key}' does not declare a variable named '${name}'`);
    if (isForbiddenVarName(name)) throw new NotifyError(`template '${key}' cannot interpolate patient identity data`);
    const value = vars[name];
    if (typeof value === "string") {
      if (containsSensitivePhone(value)) {
        throw new NotifyError(`template '${key}' contains a phone number in variable '${name}'`);
      }
      const unsafe = unsafeValueReason(value);
      if (unsafe) {
        throw new NotifyError(`template '${key}' variable '${name}' contains ${unsafe}`);
      }
    }
  }

  const missing: string[] = [];
  const body = source.replace(PLACEHOLDER, (_match, name: string) => {
    const value = vars[name];
    if (value === undefined || value === null || value === "") {
      missing.push(name);
      return "";
    }
    return String(value);
  });
  if (missing.length > 0) throw new NotifyError(`template '${key}' is missing variables: ${[...new Set(missing)].sort().join(", ")}`);

  const trimmed = body.trim();
  if (trimmed.length === 0) throw new NotifyError(`template '${key}' rendered to an empty message`);
  if (trimmed.length > options.maxChars) {
    throw new NotifyError(`template '${key}' rendered ${trimmed.length} chars, over the ${options.channel} limit of ${options.maxChars}`);
  }
  return { body: trimmed, chars: trimmed.length, templateKey: key, locale: options.locale };
}
