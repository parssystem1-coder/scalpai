import type { InboundEnvelope, MessagingAdapter } from "../types.js";
import { createStubAdapter, readString } from "./stub-base.js";

/**
 * ایتا — مسنجر داخلی. STUB.
 *
 * مهم‌ترین تفاوتش با بقیه: مسیر رسمی پیام‌رسانیِ خودکار محدود است و گزارش
 * تحویل ندارد، پس حالت delivered روی این کانال هرگز رخ نمی‌دهد: پیام sent
 * می‌ماند و این دروغ نیست، همه‌ی چیزی است که می‌دانیم.
 */
export const eitaaAdapter: MessagingAdapter = createStubAdapter({
  channel: "eitaa",
  provider: "eitaayar",
  capabilities: {
    maxBodyChars: 4096,
    supportsInbound: true,
    supportsDeliveryReceipt: false,
    requiresOptIn: true,
  },
  requiredEnv: ["EITAA_TOKEN"],
  parseInbound(payload: unknown): InboundEnvelope | null {
    const from = readString(payload, "chat_id") ?? readString(payload, "from", "id");
    const body = readString(payload, "text");
    if (!from || !body) return null;
    return {
      channel: "eitaa",
      provider: "eitaayar",
      providerMessageId: readString(payload, "message_id"),
      from,
      body,
      receivedAt: readString(payload, "date"),
    };
  },
});
