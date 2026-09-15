/**
 * @scalpai/notify — دروازه پیام (فاز ۵a / ADR-0046).
 *
 * این پکیج هیچ چیزی از NestJS، دیتابیس یا BullMQ نمی‌داند — و نباید بداند.
 * منطق قالب، انتخاب کانال و پاک‌سازی PHI خالص و قابل تست با جدول ورودی/خروجی
 * می‌ماند، و همه‌ی وابستگی‌های زنده (صف، تراکنش، لاگ) در apps/api می‌مانند.
 */

export type {
  AdapterCapabilities,
  InboundEnvelope,
  MessagingAdapter,
  OutboundMessage,
  SendOutcome,
  SendResult,
} from "./types.js";
export { AdapterNotImplementedError, NotifyError } from "./types.js";

export {
  ADAPTERS,
  allAdapters,
  baleAdapter,
  eitaaAdapter,
  getAdapter,
  kavenegarAdapter,
  telegramAdapter,
  whatsappAdapter,
} from "./adapters/index.js";
export { ZarinpalAdapter, zarinpalAdapter, type PaymentResult, type ZarinpalHttpClient } from "./adapters/zarinpal.adapter.js";

export {
  MESSAGE_TEMPLATES,
  getTemplate,
  isKnownTemplate,
  renderTemplate,
  type MessageTemplate,
  type RenderOptions,
  type RenderedMessage,
} from "./template.js";

export {
  DEFAULT_CHANNEL_ORDER,
  channelChain,
  routeChannel,
  type RecipientReachability,
  type RouteDecision,
  type RouteRefusal,
  type RouteRequest,
} from "./router.js";

export {
  INBOX_PREVIEW_MAX,
  RECIPIENT_MASK_VISIBLE,
  assertVarsRedacted,
  previewBody,
  redactRecipient,
  redactVars,
  type VarValue,
} from "./redact.js";
