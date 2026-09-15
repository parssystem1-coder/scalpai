import type { InboundEnvelope, MessagingAdapter } from "../types.js";
import { createStubAdapter, readString } from "./stub-base.js";

/**
 * کاوه‌نگار — پیامک. STUB.
 *
 * تنها کانالی که opt-in لازم ندارد: شماره موبایل بیمار را داریم و همین کافی
 * است، پس fallback نهایی همین است. در عوض گران‌ترین و کوتاه‌ترین است: ۴۸۰
 * کاراکتر ≈ ۳ پیامک فارسی (۷۰ کاراکتری UCS-2)، و رندرر به همین پابند است.
 *
 * پیامک یک‌طرفه است: `supportsInbound: false`. اگر قالبی پاسخ می‌خواهد، router
 * این کانال را انتخاب نمی‌کند — وگرنه بیمار پاسخ می‌دهد و هیچ‌کس نمی‌بیند.
 */
export const kavenegarAdapter: MessagingAdapter = createStubAdapter({
  channel: "kavenegar",
  provider: "kavenegar",
  capabilities: {
    maxBodyChars: 480,
    supportsInbound: false,
    supportsDeliveryReceipt: true,
    requiresOptIn: false,
  },
  requiredEnv: ["KAVENEGAR_API_KEY", "KAVENEGAR_SENDER"],
  parseInbound(payload: unknown): InboundEnvelope | null {
    // وب‌هوک پیامک دوطرفه (خط اختصاصی). اگر کلینیک خط اختصاصی ندارد،
    // این مسیر هرگز فراخوانی نمی‌شود.
    const from = readString(payload, "from");
    const body = readString(payload, "message");
    if (!from || !body) return null;
    return {
      channel: "kavenegar",
      provider: "kavenegar",
      providerMessageId: readString(payload, "messageid"),
      from,
      body,
      receivedAt: readString(payload, "date"),
    };
  },
});
