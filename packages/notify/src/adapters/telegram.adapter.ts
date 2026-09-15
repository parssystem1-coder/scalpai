import type { InboundEnvelope, MessagingAdapter } from "../types.js";
import { createStubAdapter, readString } from "./stub-base.js";

/**
 * تلگرام — Bot API. STUB.
 *
 * `from` اینجا chat id است نه شماره موبایل. باز هم PHI حساب می‌شود و همان
 * مسیر hash را می‌رود: یک chat id هم یک شناسه مستقیمِ قابل ردگیری به یک فرد است.
 */
export const telegramAdapter: MessagingAdapter = createStubAdapter({
  channel: "telegram",
  provider: "telegram",
  capabilities: {
    maxBodyChars: 4096,
    supportsInbound: true,
    supportsDeliveryReceipt: false,
    requiresOptIn: true,
  },
  requiredEnv: ["TELEGRAM_BOT_TOKEN"],
  parseInbound(payload: unknown): InboundEnvelope | null {
    const from = readString(payload, "message", "chat", "id");
    const body = readString(payload, "message", "text");
    if (!from || !body) return null;
    return {
      channel: "telegram",
      provider: "telegram",
      providerMessageId: readString(payload, "message", "message_id"),
      from,
      body,
      receivedAt: readString(payload, "message", "date"),
      replyToProviderMessageId: readString(payload, "message", "reply_to_message", "message_id"),
    };
  },
});
