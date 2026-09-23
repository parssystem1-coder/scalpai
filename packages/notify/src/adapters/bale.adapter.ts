import type { InboundEnvelope, MessagingAdapter, OutboundMessage, SendResult } from "../types.js";
import { fetchHttpClient, type HttpClientPort } from "./http-client.port.js";
import { readString } from "./stub-base.js";

/**
 * بله — مسنجر داخلی. آداپتور واقعی Bot API (موج ۲ / D08).
 *
 * Bot API شبیه تلگرام است: sendMessage با `chat_id`، و ربات تا وقتی کاربر اول
 * `/start` نزده نمی‌تواند پیام بدهد — پس `requiresOptIn: true` می‌ماند؛ بدون این
 * پرچم router کانالی را انتخاب می‌کند که قطعاً رد می‌شود و پیام پیگیری گم می‌شود.
 *
 * HTTP پشت HttpClientPort است تا تست قرارداد قطعی باشد؛ payload و exception
 * پروایدر هرگز از مرز بیرون نمی‌آید.
 */

interface BaleResponse {
  readonly ok?: boolean;
  readonly result?: { readonly message_id?: number | string };
  readonly description?: string;
  readonly error_code?: number;
  readonly parameters?: { readonly retry_after?: number };
}

const DEFAULT_TIMEOUT_MS = 10_000;

function timeoutMs(env: Record<string, string | undefined>): number {
  const value = Number(env.NOTIFY_HTTP_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 && value <= 60_000 ? Math.floor(value) : DEFAULT_TIMEOUT_MS;
}

export class BaleAdapter implements MessagingAdapter {
  readonly channel = "bale" as const;
  readonly provider = "bale";
  readonly capabilities = { maxBodyChars: 4096, supportsInbound: true, supportsDeliveryReceipt: false, requiresOptIn: true } as const;
  readonly requiredEnv = ["BALE_BOT_TOKEN"] as const;

  constructor(private readonly http: HttpClientPort = fetchHttpClient) {}

  isConfigured(env: Record<string, string | undefined> = process.env): boolean {
    return this.requiredEnv.every((name) => Boolean(env[name]?.trim()));
  }

  async send(message: OutboundMessage, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
    const token = env.BALE_BOT_TOKEN?.trim();
    if (!token) return { outcome: "rejected", provider: this.provider, reason: "not-configured", retryable: false };
    if (message.body.length > this.capabilities.maxBodyChars) return { outcome: "rejected", provider: this.provider, reason: "body-too-long", retryable: false };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs(env));
    try {
      const response = await this.http.post<BaleResponse>(
        `https://tapi.bale.ai/bot${encodeURIComponent(token)}/sendMessage`,
        new URLSearchParams({
          chat_id: message.to,
          text: message.body,
        }),
        controller.signal,
      );
      // Bot API: ok:true = پذیرفته شد. وضعیت transport اول تصمیم می‌گیرد (درس کاوه‌نگار):
      // 429 معنای retry_after دارد و 5xx گذراست؛ بدنه‌ی متناقض حکم transport را نمی‌زند.
      if (!response.ok) {
        let payload: BaleResponse | undefined;
        try {
          payload = await response.json();
        } catch {
          // بدنه‌ی غیر JSON (مثلاً صفحه‌ی خطای پروکسی) — همان طبقه‌بندی transport می‌ماند.
        }
        const retryAfter = payload?.parameters?.retry_after;
        if (response.status === 429 || typeof retryAfter === "number") {
          return { outcome: "rejected", provider: this.provider, reason: "rate-limited", retryable: true };
        }
        return {
          outcome: "rejected",
          provider: this.provider,
          reason: mapBaleError(response.status, payload?.error_code),
          retryable: response.status >= 500,
        };
      }
      const payload = await response.json();
      if (payload.ok === true && payload.result?.message_id !== undefined) {
        return {
          outcome: "accepted",
          provider: this.provider,
          providerMessageId: String(payload.result.message_id),
          reason: "provider-accepted",
        };
      }
      if (payload.ok === true) {
        // بدون message_id تأییدِ مبهم است — log بدون شناسه‌ی پروایدر گمراه‌کننده می‌شود.
        return { outcome: "rejected", provider: this.provider, reason: "invalid-provider-response", retryable: true };
      }
      return {
        outcome: "rejected",
        provider: this.provider,
        reason: mapBaleError(response.status, payload.error_code),
        retryable: payload.error_code === 429 || (payload.error_code ?? 0) >= 500,
      };
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

  /** همان شکل تلگرام: update با message.chat.id / message.text. */
  parseInbound(payload: unknown): InboundEnvelope | null {
    const from = readString(payload, "message", "chat", "id");
    const body = readString(payload, "message", "text");
    if (!from || !body) return null;
    return {
      channel: "bale",
      provider: "bale",
      providerMessageId: readString(payload, "message", "message_id"),
      from,
      body,
      receivedAt: readString(payload, "message", "date"),
    };
  }
}

function mapBaleError(transportStatus: number, errorCode?: number): string {
  const code = errorCode ?? transportStatus;
  if (code === 400) return "invalid-request";
  if (code === 403) return "blocked-receptor";
  return code >= 500 ? "provider-error" : "provider-rejected";
}

export const baleAdapter: MessagingAdapter = new BaleAdapter();
