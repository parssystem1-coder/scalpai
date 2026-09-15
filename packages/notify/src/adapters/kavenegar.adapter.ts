import type { InboundEnvelope, MessagingAdapter, OutboundMessage, SendResult } from "../types.js";
import { fetchHttpClient, type HttpClientPort } from "./http-client.port.js";
import { readString } from "./stub-base.js";

interface KavenegarResponse {
  readonly return?: { readonly status?: number; readonly message?: string };
  readonly entries?: readonly { readonly messageid?: number | string }[];
}

/** Kavenegar REST adapter; provider translation is isolated and PHI is not returned in results. */
export class KavenegarAdapter implements MessagingAdapter {
  readonly channel = "kavenegar" as const;
  readonly provider = "kavenegar";
  readonly capabilities = { maxBodyChars: 480, supportsInbound: false, supportsDeliveryReceipt: true, requiresOptIn: false } as const;
  readonly requiredEnv = ["KAVENEGAR_API_KEY", "KAVENEGAR_SENDER"] as const;

  constructor(private readonly http: HttpClientPort = fetchHttpClient) {}

  isConfigured(env: Record<string, string | undefined> = process.env): boolean {
    return this.requiredEnv.every((name) => Boolean(env[name]?.trim()));
  }

  async send(message: OutboundMessage, env: Record<string, string | undefined> = process.env): Promise<SendResult> {
    const apiKey = env.KAVENEGAR_API_KEY?.trim();
    const sender = env.KAVENEGAR_SENDER?.trim();
    if (!apiKey || !sender) return { outcome: "rejected", provider: this.provider, reason: "not-configured", retryable: false };
    if (message.body.length > this.capabilities.maxBodyChars) return { outcome: "rejected", provider: this.provider, reason: "body-too-long", retryable: false };
    try {
      const response = await this.http.post<KavenegarResponse>(
        `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`,
        new URLSearchParams({ receptor: message.to, message: message.body, sender }),
      );
      const payload = await response.json();
      const status = payload.return?.status ?? response.status;
      if (response.ok && status >= 200 && status < 300) {
        const providerMessageId = payload.entries?.[0]?.messageid;
        return { outcome: "accepted", provider: this.provider, providerMessageId: providerMessageId === undefined ? undefined : String(providerMessageId), reason: "provider-accepted" };
      }
      return { outcome: "rejected", provider: this.provider, reason: mapKavenegarError(status), retryable: status === 429 || status >= 500 };
    } catch {
      return { outcome: "rejected", provider: this.provider, reason: "provider-unreachable", retryable: true };
    }
  }

  parseInbound(payload: unknown): InboundEnvelope | null {
    const from = readString(payload, "from");
    const body = readString(payload, "message");
    if (!from || !body) return null;
    return { channel: this.channel, provider: this.provider, providerMessageId: readString(payload, "messageid"), from, body, receivedAt: readString(payload, "date") };
  }
}

function mapKavenegarError(status: number): string {
  if (status === 400 || status === 411) return "invalid-request";
  if (status === 412 || status === 413) return "insufficient-credit";
  if (status === 414 || status === 415) return "blocked-receptor";
  if (status === 429) return "rate-limited";
  return status >= 500 ? "provider-error" : "provider-rejected";
}

export const kavenegarAdapter: MessagingAdapter = new KavenegarAdapter();
