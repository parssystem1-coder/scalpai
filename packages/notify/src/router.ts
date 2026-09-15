import type { MessagingChannel } from "@scalpai/shared";
import { MESSAGING_CHANNELS } from "@scalpai/shared";
import { ADAPTERS, getAdapter } from "./adapters/index.js";
import type { MessagingAdapter } from "./types.js";

/**
 * مسیریاب کانال (فاز ۵a).
 *
 * یک تابع خالص: ورودی وضعیت، خروجی تصمیم و دلیلِ تصمیم. هیچ I/O ی، هیچ
 * بانک داده‌ای — یعنی قابل تست با یک جدول ورودی/خروجی.
 *
 * چرا دلیل هم برمی‌گردد و فقط کانال نه: پیامی که فرستاده نشد باید در
 * message_log حالت suppressed با یک دلیلِ قابل خواندن بگیرد. ساکت رد کردن یک پیام
 * پیگیری، در پشتیبانی به «ما هیچ‌وقت پیام نگرفتیم» ترجمه می‌شود و کسی
 * نمی‌تواند جواب بدهد چرا.
 */

/** ترتیب پیش‌فرض fallback. پیامک آخر است چون گران است ولی همیشه می‌رسد. */
export const DEFAULT_CHANNEL_ORDER: readonly MessagingChannel[] = [
  "bale",
  "eitaa",
  "telegram",
  "whatsapp",
  "kavenegar",
];

export interface RecipientReachability {
  /** کانال‌هایی که بیمار رویشان opt-in کرده (ربات را start زده). */
  readonly optedIn: readonly MessagingChannel[];
  /** شماره موبایل داریم؟ بدون آن پیامک ممکن نیست. */
  readonly hasMobile: boolean;
  /** بیمار پیام STOP فرستاده است. بالاتر از هر ترجیح دیگری. */
  readonly optedOut?: boolean;
}

export interface RouteRequest {
  /** کانالی که گام دنباله خواسته. ترجیح اول است، نه دستور قطعی. */
  readonly preferred?: MessagingChannel;
  /** ترتیب کانال‌های کلینیک، از clinics.settings. */
  readonly clinicOrder?: readonly MessagingChannel[];
  readonly recipient: RecipientReachability;
  /** قالب منتطر پاسخ است؟ اگر بله، کانال یک‌طرفه مجاز نیست. */
  readonly requiresReply?: boolean;
  /** طول متن رندرشده، اگر از پیش معلوم است. کانال تنگ‌تر از این رد می‌شود. */
  readonly bodyChars?: number;
  readonly env?: Record<string, string | undefined>;
}

export type RouteRefusal =
  | "recipient-opted-out"
  | "no-channel-configured"
  | "no-channel-reachable"
  | "body-too-long";

export type RouteDecision =
  | { readonly ok: true; readonly channel: MessagingChannel; readonly adapter: MessagingAdapter; readonly fallbackFrom?: MessagingChannel }
  | { readonly ok: false; readonly reason: RouteRefusal; readonly considered: readonly MessagingChannel[] };

function dedupe(channels: readonly MessagingChannel[]): MessagingChannel[] {
  const seen = new Set<MessagingChannel>();
  const out: MessagingChannel[] = [];
  for (const channel of channels) {
    if (!MESSAGING_CHANNELS.includes(channel) || seen.has(channel)) continue;
    seen.add(channel);
    out.push(channel);
  }
  return out;
}

/** زنجیره تلاش: ترجیح گام → ترتیب کلینیک → ترتیب پیش‌فرض. */
export function channelChain(request: RouteRequest): MessagingChannel[] {
  return dedupe([
    ...(request.preferred ? [request.preferred] : []),
    ...(request.clinicOrder ?? []),
    ...DEFAULT_CHANNEL_ORDER,
  ]);
}

/** آیا این کانال برای این درخواست قابل استفاده است؟ */
function isUsable(channel: MessagingChannel, request: RouteRequest): boolean {
  const adapter = getAdapter(channel);
  if (!adapter.isConfigured(request.env)) return false;
  if (request.requiresReply && !adapter.capabilities.supportsInbound) return false;
  if (request.bodyChars !== undefined && request.bodyChars > adapter.capabilities.maxBodyChars) return false;
  if (adapter.capabilities.requiresOptIn) return request.recipient.optedIn.includes(channel);
  // پیامک: opt-in لازم ندارد، ولی بدون شماره هم ممکن نیست
  return request.recipient.hasMobile;
}

export function routeChannel(request: RouteRequest): RouteDecision {
  // STOP بالاتر از همه است. بیماری که گفته نفرست، نباید از کانال دیگری هم بشنود
  const considered = channelChain(request);
  if (request.recipient.optedOut) {
    return { ok: false, reason: "recipient-opted-out", considered: [] };
  }

  const configured = considered.filter((channel) => getAdapter(channel).isConfigured(request.env));
  if (configured.length === 0) {
    return { ok: false, reason: "no-channel-configured", considered };
  }

  for (const channel of considered) {
    if (!isUsable(channel, request)) continue;
    const fallbackFrom = request.preferred && request.preferred !== channel ? request.preferred : undefined;
    return { ok: true, channel, adapter: ADAPTERS[channel], ...(fallbackFrom ? { fallbackFrom } : {}) };
  }

  // تفکیک «متن بلند است» از «مخاطب در دسترس نیست»: اولی باگ قالب است،
  // دومی واقعیت مشتری. یک دلیل مشترک برای هر دو، دیباگ را کور می‌کند.
  if (request.bodyChars !== undefined) {
    const fitsSomewhere = configured.some(
      (channel) => (request.bodyChars ?? 0) <= getAdapter(channel).capabilities.maxBodyChars,
    );
    if (!fitsSomewhere) return { ok: false, reason: "body-too-long", considered: configured };
  }
  return { ok: false, reason: "no-channel-reachable", considered: configured };
}
