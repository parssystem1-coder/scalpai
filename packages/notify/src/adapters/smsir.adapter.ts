import type { InboundEnvelope, MessagingAdapter, OutboundMessage, SendResult } from "../types.js";
import { fetchHttpClient, type HttpClientPort } from "./http-client.port.js";

/**
 * SMS.ir REST adapter (wave 2 / D07 — ADR-0052).
 *
 * همان پتَرن کاوه‌نگار: HTTP پشت HttpClientPort تا تست قطعی باشد؛ payload و
 * exception پروایدر هرگز از مرز بیرون نمی‌آید (PHI: متن خطا = شماره/متن بیمار).
 * کاوه‌نگار حلقه‌ی اول SMS است؛ SMS.ir حلقه‌ی دوم — جایگزین نیست (ADR-0052).
 *
 * API: POST https://api.sms.ir/v1/send/verify (x-api-key: <SMSIR_API_KEY>)
 * پاسخ: { status: 1, data: { messageId } } — status=1 تنها موفقیت است.
 */

interface SmsIrResponse {
  /** 1 = موفق؛ هر چیز دیگری شکست. روی 4xx/5xx HTTP هم ممکن است بیاید. */
  readonly status?: number;
  readonly data?: {
    readonly messageId?: number | string;
    readonly message?: string;
  };
}

const DEFAULT_TIMEOUT_MS = 10_000;

function timeoutMs(env: Record<string, string | undefined>): number {
  const value = Number(env.NOTIFY_HTTP_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 60_000 ? Math.floor(value) : DEFAULT_TIMEOUT_MS;
}

export class SmsIrAdapter implements MessagingAdapter {
  readonly channel = "smsir" as const;
  readonly provider = "smsir";
  readonly capabilities = { maxBodyChars: 480, supportsInbound: false, supportsDeliveryReceipt: false, requiresOptIn: false } as const;
  readonly requiredEnv = ["SMSIR_API_KEY", "SMSIR_SENDER"] as const;

  constructor(private readonly http: HttpClientPort = fetchHttpClient) {}

  isConfigured(env: Record<string, string | undefined> = process.env): boolean {
    return this.requiredEnv.every((name) => Boolean(env[name]?.trim()));
  }

  async send(message: OutboundMessage, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
    const apiKey = env.SMSIR_API_KEY?.trim();
    const sender = env.SMSIR_SENDER?.trim();
    if (!apiKey || !sender) return { outcome: "rejected", provider: this.provider, reason: "not-configured", retryable: false };
    if (message.body.length > this.capabilities.maxBodyChars) return { outcome: "rejected", provider: this.provider, reason: "body-too-long", retryable: false };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));
    try {
      // روی خط فرستنده‌ی خدماتی، متن باید pre-approved اپراتور باشد (DESIGN-V2 §13)؛
      // ارسال بر اساس شماره خط و متن صادرشده انجام می‌شود.
      const response = await this.http.post<SmsIrResponse>(
        "https://api.sms.ir/v1/send/verify",
        new URLSearchParams({
          lineNumber: sender,
          messageText: message.body,
          mobiles: message.to,
        }),
        controller.signal,
      );
      // همان درسی که کاوه‌نگار داد: اول وضعیت transport را تصمیم بگیر، بعد بدنه را
      // بخوان — یک 500 که تصادفاً status:1 حمل می‌کند نباید «accepted» شود.
      if (!response.ok) {
        return {
          outcome: "rejected",
          provider: this.provider,
          reason: mapSmsIrTransportError(response.status),
          retryable: response.status === 429 || response.status >= 500,
        };
      }
      const payload = await response.json();
      if (payload.status === 1) {
        const providerMessageId = payload.data?.messageId;
        return {
          outcome: "accepted",
          provider: this.provider,
          providerMessageId: providerMessageId === undefined ? undefined : String(providerMessageId),
          reason: "provider-accepted",
        };
      }
      if (typeof payload.status !== "number") {
        return { outcome: "rejected", provider: this.provider, reason: "invalid-provider-response", retryable: true };
      }
      const reason = mapSmsIrPayloadError(payload.status);
      return { outcome: "rejected", provider: this.provider, reason, retryable: reason === "rate-limited" || reason === "provider-error" };
    } catch (error) {
      return {
        outcome: "rejected",
        provider: this.provider,
        reason: error instanceof Error && error.name === "AbortError" ? "provider-timeout" : "provider-unreachable",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** موج ۲: وب‌هوک ورودی SMS.ir سیم‌کشی نشده (ADR-0052). هرگز payload بیرون نمی‌دهد. */
  parseInbound(_payload: unknown): InboundEnvelope | null {
    return null;
  }
}

function mapSmsIrTransportError(status: number): string {
  if (status === 400 || status === 401 || status === 403) return "invalid-request";
  if (status === 429) return "rate-limited";
  return status >= 500 ? "provider-error" : "provider-rejected";
}

/** کدهای وضعیت مستند SMS.ir → مجموعه‌ی بسته‌ی MESSAGE_ERROR_CODES (D05). */
function mapSmsIrPayloadError(status: number): string {
  if (status === 429) return "rate-limited";
  if (status === 402 || status === 3 || status === 4) return "insufficient-credit";
  if (status === 406 || status === 2) return "blocked-receptor";
  if (status === 411 || status === 12) return "body-too-long";
  if (status >= 500) return "provider-error";
  return "provider-rejected";
}

export const smsirAdapter: MessagingAdapter = new SmsIrAdapter();
