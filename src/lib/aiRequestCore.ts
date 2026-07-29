/**
 * aiRequestCore.ts — فاز ۳
 *
 * لایهٔ دسترسی و تایپ‌های TypeScript برای منطق مشترک ساخت درخواست هوش مصنوعی.
 * کدهای محاسباتی واقعی ۱۰۰٪ از فایل منبع واحد حقیقت یعنی
 * `shared/ai-request-core.cjs` لود و بازنشر می‌شوند تا از هرگونه تداخل منطقی
 * بین الکترون و وب جلوگیری شود.
 */

// @ts-expect-error cjs import
import aiCore from '../../shared/ai-request-core.cjs';

export const {
  DEFAULT_GEMINI_URL,
  OPENROUTER_FREE_ROUTER,
  OPENROUTER_RETIRED_MODELS,
  AI_VISION_TEMPERATURE,
  AI_VISION_TOP_K,
  AI_VISION_TOP_P,
  AI_VISION_MAX_TOKENS,
  AI_ANALYZE_TIMEOUT_MS,
  AI_TEST_TIMEOUT_MS,
  AI_MAX_TRANSIENT_RETRIES,
  stripDataUrlPrefix,
  buildOpenAICompatibleHeaders,
  normalizeOpenRouterModel,
  resolveOpenAICompatibleTestModel,
  resolveAiRuntimeConfig,
  buildVisionRequest,
  buildTestConnectionRequest,
  extractResponseText,
  extractResponseModelId,
  isTransientAiError,
  backoffDelayMs,
  extractErrorMessage,
  extractJsonText,
} = aiCore;

export type AiRuntimeConfig = {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  [key: string]: unknown;
};
