import type { MessagingChannel } from "@scalpai/shared";
import {
  AdapterNotImplementedError,
  type AdapterCapabilities,
  type InboundEnvelope,
  type MessagingAdapter,
  type OutboundMessage,
  type SendResult,
} from "../types.js";

/**
 * پایه مشترک پنج adapter فاز ۵a. همه stub اند — هیچ fetch، هیچ socket، هیچ SDK.
 *
 * رفتار stub عمداً دو حالته است، و این مهم‌ترین خط این فایل است:
 *
 *   • خارج از production — یک شناسه قطعیِ مصنوعی برمی‌گرداند تا مسیر aftercare
 *     از اول تا آخر قابل اجرا و تست باشد.
 *   • در production — خطا می‌دهد. دلیلش روشن است: یک adapter که موفقیت
 *     جعلی برمی‌گرداند، ردیف message_log را sent می‌کند، داشبورد سبز می‌ماند و
 *     هیچ بیماری هیچ پیامی نمی‌گیرد. این بدترین حالت ممکن است، نه بهترین.
 */

/** FNV-1a — نه کریپتوگرافیک، فقط یک شناسه قطعی. بسته به node:crypto نیست. */
function stableId(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isProduction(env: Record<string, string | undefined>): boolean {
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production";
}

export interface StubAdapterConfig {
  readonly channel: MessagingChannel;
  readonly provider: string;
  readonly capabilities: AdapterCapabilities;
  /** متغیرهای محیطی که پیاده‌سازی واقعی لازم خواهد داشت. همه باید موجود باشند. */
  readonly requiredEnv: readonly string[];
  readonly parseInbound: (payload: unknown) => InboundEnvelope | null;
}

export function createStubAdapter(config: StubAdapterConfig): MessagingAdapter {
  return {
    channel: config.channel,
    provider: config.provider,
    capabilities: config.capabilities,

    isConfigured(env = process.env): boolean {
      return config.requiredEnv.every((name) => (env[name] ?? "").trim().length > 0);
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async send(message: OutboundMessage, env = process.env): Promise<SendResult> {
      if (isProduction(env)) {
        throw new AdapterNotImplementedError(config.channel);
      }
      // هیچ I/O ی. شناسه از idempotencyKey مشتق می‌شود، پس دو بار ارسالِ همان
      // پیام در تست همان شناسه را می‌دهد — دقیقاً رفتاری که پروایدر واقعی دارد.
      return {
        outcome: "accepted",
        provider: config.provider,
        providerMessageId: `stub-${config.channel}-${stableId(message.idempotencyKey)}`,
        reason: "adapter-stub",
      };
    },

    parseInbound: config.parseInbound,
  };
}

/** خواندن امن یک فیلد متنی از payload نامعلوم webhook. */
export function readString(source: unknown, ...path: string[]): string | undefined {
  let cursor: unknown = source;
  for (const key of path) {
    if (typeof cursor !== "object" || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  if (typeof cursor === "string") return cursor.trim() || undefined;
  if (typeof cursor === "number") return String(cursor);
  return undefined;
}
