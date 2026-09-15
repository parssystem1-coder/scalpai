import type { InboundEnvelope, MessagingAdapter } from "../types.js";
import { createStubAdapter, readString } from "./stub-base.js";

/**
 * بله — مسنجر داخلی. STUB.
 *
 * Bot API شبیه تلگرام است، و همان محدودیت را دارد: ربات تا وقتی کاربر اول start
 * نزنده نمی‌تواند پیام بدهد — پس `requiresOptIn: true`. بدون این پرچم، router
 * کانالی را انتخاب می‌کند که قطعاً رد می‌شود و پیام پیگیری گم می‌شود.
 */
export const baleAdapter: MessagingAdapter = createStubAdapter({
  channel: "bale",
  provider: "bale",
  capabilities: {
    maxBodyChars: 4096,
    supportsInbound: true,
    supportsDeliveryReceipt: false,
    requiresOptIn: true,
  },
  requiredEnv: ["BALE_BOT_TOKEN"],
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
  },
});
