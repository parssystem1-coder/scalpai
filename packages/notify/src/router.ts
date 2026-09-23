import type { MessagingChannel } from "@scalpai/shared";
import { MESSAGING_CHANNELS } from "@scalpai/shared";
import { ADAPTERS, getAdapter } from "./adapters/index.js";
import { AdapterNotImplementedError, type MessagingAdapter, type OutboundMessage, type SendResult } from "./types.js";

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

/**
 * ترتیب پیش‌فرض موج ۱ — SMS-first عملیاتی.
 * Kavenegar تنها کانال تولیدی اجباری است؛ مسنجرها تا موج ۲ stub و fail-closedاند.
 */
export const DEFAULT_CHANNEL_ORDER: readonly MessagingChannel[] = [
  "kavenegar",
  "bale",
  "eitaa",
  "telegram",
  "whatsapp",
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
  /** کانال‌هایی که همین tick شکست خورده‌اند — دوباره انتخاب نمی‌شوند. */
  readonly exclude?: readonly MessagingChannel[];
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
  const skip = new Set(request.exclude ?? []);
  return dedupe([
    ...(request.preferred ? [request.preferred] : []),
    ...(request.clinicOrder ?? []),
    ...DEFAULT_CHANNEL_ORDER,
  ]).filter((channel) => !skip.has(channel));
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

/**
 * گام بعد از شکست **ارسال** — نه شکست انتخاب.
 * کانال‌های alreadyTried از زنجیره حذف می‌شوند و اولین کانال هنوز قابل‌استفاده برمی‌گردد.
 */
export function routeAfterFailure(
  request: RouteRequest,
  failedChannel: MessagingChannel,
  alreadyTried: readonly MessagingChannel[] = [failedChannel],
): RouteDecision {
  const decision = routeChannel({
    ...request,
    preferred: undefined,
    exclude: alreadyTried,
  });
  if (decision.ok) {
    return { ...decision, fallbackFrom: failedChannel };
  }
  return decision;
}

export interface FailoverSendRequest {
  readonly request: RouteRequest;
  readonly message: Omit<OutboundMessage, "channel">;
  readonly initial: MessagingChannel;
  readonly send?: (adapter: MessagingAdapter, message: OutboundMessage) => Promise<SendResult>;
}

export interface FailoverSendResult {
  readonly channel: MessagingChannel;
  readonly result: SendResult;
  readonly attempted: readonly MessagingChannel[];
}

/**
 * همان tick: preferred fail → کانال بعدی قابل‌استفاده (معمولاً kavenegar).
 * defer خاموش پس از شکست ارسال ممنوع است.
 */
export async function sendWithChannelFailover(args: FailoverSendRequest): Promise<FailoverSendResult> {
  const attempted: MessagingChannel[] = [];
  let channel = args.initial;
  const dispatch =
    args.send ??
    ((adapter: MessagingAdapter, message: OutboundMessage) => adapter.send(message, args.request.env));

  for (;;) {
    attempted.push(channel);
    const adapter = getAdapter(channel);
    let result: SendResult;
    try {
      result = await dispatch(adapter, { ...args.message, channel });
    } catch (err) {
      result = {
        outcome: "rejected",
        provider: adapter.provider,
        reason: err instanceof AdapterNotImplementedError ? "adapter-not-implemented" : "send-failed",
        retryable: false,
      };
    }
    if (result.outcome === "accepted") {
      return { channel, result, attempted };
    }
    const next = routeAfterFailure(args.request, channel, attempted);
    if (!next.ok) {
      return { channel, result, attempted };
    }
    channel = next.channel;
  }
}
