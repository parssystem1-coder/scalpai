import type { MessageLocale, MessagingChannel } from "@scalpai/shared";

/**
 * فاز ۵a — پورتِ دروازه پیام (ADR-0046).
 *
 * تنها چیزی که اپلیکیشن از یک پروایدر می‌شناسد همین interface است. هیچ جای
 * دیگری نباید بداند کاوه‌نگار REST است و تلگرام Bot API — وگرنه افزودن کانال
 * ششم یعنی دست بردن در سرویس aftercare.
 *
 * قراردادِ مرکزی PHI هم همینجاست: `OutboundMessage.to` فقط در لحظه ارسال زنده
 * است، و `SendResult` هرگز آن را پس نمی‌دهد. هرچه برمی‌گردد مستقیماً قابل لاگ
 * کردن است.
 */

export interface AdapterCapabilities {
  /** بیشترین طول متنی که کانال در یک پیام می‌پذیرد. رندرر به این پابند است. */
  readonly maxBodyChars: number;
  /** آیا کانال پاسخ بیمار را برمی‌گرداند؟ پیامک یک‌طرفه است. */
  readonly supportsInbound: boolean;
  /** آیا گزارش تحویل می‌دهد؟ بدون آن حالت delivered هرگز رخ نمی‌دهد. */
  readonly supportsDeliveryReceipt: boolean;
  /** آیا مخاطب باید از پیش عضو/مشترک شده باشد؟ (مسنجرها بله، پیامک خیر) */
  readonly requiresOptIn: boolean;
}

/** پیامی که قرار است برود. فقط در حافظه وجود دارد — هیچ ردیفی این شکل را ندارد. */
export interface OutboundMessage {
  readonly channel: MessagingChannel;
  /** مخاطب خوانا. PHI — لاگ کردن، ذخیره کردن و برگرداندنش ممنوع است. */
  readonly to: string;
  readonly body: string;
  readonly locale: MessageLocale;
  /** همان message_log.idempotency_key. پروایدرهایی که پشتیبانی می‌کنند پاسش می‌دهند. */
  readonly idempotencyKey: string;
  /** فراداده‌ی بی‌خطر برای ردگیری: templateKey، stepIndex، … هرگز نام/تلفن. */
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

export type SendOutcome = "accepted" | "rejected" | "suppressed";

/**
 * پاسخ ارسال. `accepted` یعنی پروایدر تحویل گرفت، نه یعنی بیمار خواند. تفکیک
 * sent و delivered دقیقاً برای همین در message_log وجود دارد.
 */
export interface SendResult {
  readonly outcome: SendOutcome;
  readonly provider: string;
  readonly providerMessageId?: string;
  /** دلیلِ بی‌خطر، کوتاه و قابل لاگ. هرگز حاوی متن پیام یا شماره. */
  readonly reason?: string;
  /** برای خطای گذرا (۴۲۹ / ۵xx) true است؛ شماره نامعتبر retry ندارد. */
  readonly retryable?: boolean;
}

/** پیام ورودی، پس از نرمال‌سازی شکل خام webhook هر پروایدر. */
export interface InboundEnvelope {
  readonly channel: MessagingChannel;
  readonly provider: string;
  readonly providerMessageId?: string;
  /** فرستنده خوانا. PHI — سرویس فوراً hash می‌کند. */
  readonly from: string;
  readonly body: string;
  readonly receivedAt?: string;
  readonly replyToProviderMessageId?: string;
}

export class NotifyError extends Error {
  constructor(message: string) {
    super(`notify: ${message}`);
    this.name = "NotifyError";
  }
}

/**
 * بالا رفتن این خطا در production درست‌تر از برگرداندن یک موفقیت قلابی است: یک
 * فاز بعدی که فراموش کند این adapter را بنویسد، باید بفهمد — نه اینکه بیماران
 * در سکوت پیامی نگیرند و داشبورد سبز بماند.
 */
export class AdapterNotImplementedError extends NotifyError {
  constructor(channel: MessagingChannel) {
    super(`adapter '${channel}' is a stub and refuses to run in production`);
    this.name = "AdapterNotImplementedError";
  }
}

export interface MessagingAdapter {
  readonly channel: MessagingChannel;
  readonly provider: string;
  readonly capabilities: AdapterCapabilities;
  /** آیا کلید/توکن لازم در محیط هست؟ router کانال بی‌کلید را انتخاب نمی‌کند. */
  isConfigured(env?: Record<string, string | undefined>): boolean;
  send(message: OutboundMessage, env?: Record<string, string | undefined>): Promise<SendResult>;
  /** شکل خام webhook → پاکت نرمال. `null` یعنی این payload مال این کانال نیست. */
  parseInbound(payload: unknown): InboundEnvelope | null;
}
