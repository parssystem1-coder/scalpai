import type { InboundEnvelope, MessagingAdapter } from "../types.js";
import { createStubAdapter, readString } from "./stub-base.js";

/**
 * واتس‌اپ — Cloud API. STUB.
 *
 * پنجره ۲۴ ساعته معنایِ واقعی `requiresOptIn` اینجاست: خارج از پنجره، فقط
 * قالب تأییدشده‌ی Meta مجاز است و متن آزاد رد می‌شود. پیاده‌سازی واقعی باید
 * قالب‌های ما را به قالب‌های ثبت‌شده نگاشت کند — همین دلیلی است که
 * `templateKey` تا اینجا در قرارداد زنده مانده و فقط متن رندرشده رد و بدل نمی‌شود.
 */
export const whatsappAdapter: MessagingAdapter = createStubAdapter({
  channel: "whatsapp",
  provider: "whatsapp-cloud",
  capabilities: {
    maxBodyChars: 1024,
    supportsInbound: true,
    supportsDeliveryReceipt: true,
    requiresOptIn: true,
  },
  requiredEnv: ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  parseInbound(payload: unknown): InboundEnvelope | null {
    // entry[0].changes[0].value.messages[0] — شکل تودرتوی Cloud API.
    const entries = (payload as { entry?: unknown[] } | null)?.entry;
    const first = Array.isArray(entries) ? entries[0] : undefined;
    const changes = (first as { changes?: unknown[] } | undefined)?.changes;
    const change = Array.isArray(changes) ? changes[0] : undefined;
    const messages = (change as { value?: { messages?: unknown[] } } | undefined)?.value?.messages;
    const message = Array.isArray(messages) ? messages[0] : undefined;
    if (!message) return null;

    const from = readString(message, "from");
    const body = readString(message, "text", "body");
    if (!from || !body) return null;
    return {
      channel: "whatsapp",
      provider: "whatsapp-cloud",
      providerMessageId: readString(message, "id"),
      from,
      body,
      receivedAt: readString(message, "timestamp"),
      replyToProviderMessageId: readString(message, "context", "id"),
    };
  },
});
