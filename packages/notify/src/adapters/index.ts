import type { MessagingChannel } from "@scalpai/shared";
import { MESSAGING_CHANNELS } from "@scalpai/shared";
import type { MessagingAdapter } from "../types.js";
import { baleAdapter } from "./bale.adapter.js";
import { eitaaAdapter } from "./eitaa.adapter.js";
import { kavenegarAdapter } from "./kavenegar.adapter.js";
import { telegramAdapter } from "./telegram.adapter.js";
import { whatsappAdapter } from "./whatsapp.adapter.js";

/**
 * رجیستری adapter ها. `satisfies Record<MessagingChannel, …>` یک قید تایپی واقعی
 * است نه تزئین: افزودن یک کانال به MESSAGING_CHANNELS بدون نوشتن adapter ش، بیلد را
 * می‌شکند — درست همان جایی که باید بشکند.
 */
export const ADAPTERS = {
  kavenegar: kavenegarAdapter,
  bale: baleAdapter,
  eitaa: eitaaAdapter,
  telegram: telegramAdapter,
  whatsapp: whatsappAdapter,
} as const satisfies Record<MessagingChannel, MessagingAdapter>;

export function getAdapter(channel: MessagingChannel): MessagingAdapter {
  return ADAPTERS[channel];
}

export function allAdapters(): readonly MessagingAdapter[] {
  return MESSAGING_CHANNELS.map((channel) => ADAPTERS[channel]);
}

export { baleAdapter, eitaaAdapter, kavenegarAdapter, telegramAdapter, whatsappAdapter };
