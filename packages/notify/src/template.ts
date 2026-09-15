import type { MessageLocale, MessagingChannel } from "@scalpai/shared";
import { NotifyError } from "./types.js";

/**
 * رندرر قالب (فاز ۵a).
 *
 * سه تصمیم که عمدی اند:
 *
 *   ۱) متغیر غایب خطاست، نه رشته خالی. پیامک «سلام ، نتیجه آماده است» به
 *      بیمار رفتن، بدتر از نرفتن است. متغیر ناشناس هم خطاست: یعنی قالب و
 *      فراخوان دو چیز متفاوت می‌فهمند.
 *
 *   ۲) هیچ منطقی در قالب نیست — نه شرط، نه حلقه، نه فراخوانی. `{{name}}` و
 *      تمام. یک قالب که قابل اجرا باشد، یک موتور template injection است.
 *
 *   ۳) متن به سقف کانال پابند است و بریدن خطاست نه بریدن خودکار: یک پیامک
 *      نیمه‌کاره درمانی بدتر از یک خطای قابل دیدن است.
 *
 * متن‌ها موقتاً در کد اند. فاز بعد قالب قابل ویرایش کلینیک می‌شود، و همین
 * رندرر می‌ماند — فقط منبع رجیستری عوض می‌شود.
 */

export interface MessageTemplate {
  readonly key: string;
  /** متن به ازای هر زبان. هر دو زبان اجباری‌اند. */
  readonly body: Readonly<Record<MessageLocale, string>>;
  /** متغیرهای مجاز. مجموعه بسته — هرچه در متن باشد باید اینجا باشد. */
  readonly vars: readonly string[];
  /** کانال‌هایی که این قالب رویشان معنا دارد. خالی = همه. */
  readonly channels?: readonly MessagingChannel[];
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,39})\s*\}\}/g;

/**
 * متغیرهای قالب عمداً بی‌نام اند: `firstName` نداریم، چون فرستادن نام بیمار
 * درون پیام یک تصمیم محصولی است نه پیش‌فرض، و هر متغیری که اینجا باشد سر
 * از message_log درمی‌آورد. قالب‌ها با «شما» و نام کلینیک کار می‌کنند.
 */
export const MESSAGE_TEMPLATES: Readonly<Record<string, MessageTemplate>> = {
  "aftercare.day1": {
    key: "aftercare.day1",
    vars: ["clinicName"],
    body: {
      fa: "سلام! ۲۴ ساعت از جلسه شما گذشته. تا فردا محل درمان را نشویید و دست نزنید. پرسشی دارید؟ همینجا پاسخ دهید. — {{clinicName}}",
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
      en: "One month into treatment. Changes usually become measurable from this point on. — {{clinicName}}",
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
    vars: ["clinicName", "invoiceNumber", "amount"],
    body: {
      fa: "صورتحساب {{invoiceNumber}} به مبلغ {{amount}} ریال صادر شد. — {{clinicName}}",
      en: "Invoice {{invoiceNumber}} for {{amount}} IRR has been issued. — {{clinicName}}",
    },
  },
  "invoice.paid": {
    key: "invoice.paid",
    vars: ["clinicName", "invoiceNumber"],
    body: {
      fa: "پرداخت صورتحساب {{invoiceNumber}} ثبت شد. متشکریم. — {{clinicName}}",
      en: "Payment for invoice {{invoiceNumber}} has been recorded. Thank you. — {{clinicName}}",
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
  /** سقف طول متن کانال (از capabilities). */
  readonly maxChars: number;
}

export interface RenderedMessage {
  readonly body: string;
  readonly chars: number;
  readonly templateKey: string;
  readonly locale: MessageLocale;
}

/**
 * جایگزینی متغیرها. مقدار به رشته تبدیل می‌شود و هیچ تفسیری روی متنِ
 * جایگزین‌شده انجام نمی‌شود — مقداری که خودش `{{x}}` باشد دوباره رندر نمی‌شود
 * (این همان جایی است که رندررها به injection تبدیل می‌شوند).
 */
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
    if (!allowed.has(name)) {
      throw new NotifyError(`template '${key}' does not declare a variable named '${name}'`);
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

  if (missing.length > 0) {
    // رشته خالی نمی‌دهیم: پیامک با جای خالی به بیمار رفتن، بدتر از نرفتن است
    throw new NotifyError(`template '${key}' is missing variables: ${[...new Set(missing)].sort().join(", ")}`);
  }

  const trimmed = body.trim();
  if (trimmed.length === 0) throw new NotifyError(`template '${key}' rendered to an empty message`);
  if (trimmed.length > options.maxChars) {
    throw new NotifyError(
      `template '${key}' rendered ${trimmed.length} chars, over the ${options.channel} limit of ${options.maxChars}`,
    );
  }

  return { body: trimmed, chars: trimmed.length, templateKey: key, locale: options.locale };
}
