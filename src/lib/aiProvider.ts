/**
 * aiProvider.ts
 * -----------------------------------------------------------------------
 * لایهٔ یکپارچه و مستقل از سرویس برای فراخوانی هوش مصنوعی چندوجهی (تصویر+متن).
 *
 * چرا این فایل لازم بود:
 *  - قبلاً کد فراخوانی Gemini با هاردکد آدرس و کلید، هم در AIAnalysis.tsx و
 *    هم در Settings.tsx (برای تست اتصال) تکرار شده بود.
 *  - در نسخهٔ وب، برای دور زدن CORS، تصویر مراجع + کلید API از طریق چند
 *    پراکسی *عمومی و ناشناس* (allorigins.win, corsproxy.io, codetabs.com)
 *    عبور می‌کرد — یک ریسک حریم خصوصیِ جدی برای دادهٔ پزشکی.
 *
 * راه‌حل:
 *  - این ماژول از دو نوع سرویس پشتیبانی می‌کند:
 *      1) 'gemini'            → Google Generative Language API (فرمت بومی آن)
 *      2) 'openai_compatible' → هر سرویسی که فرمت OpenAI Chat Completions را
 *         پیاده‌سازی کند (OpenRouter, Groq, Together, DeepSeek, Ollama محلی،
 *         LM Studio، خودِ OpenAI و...) — یعنی عملاً «هر AI که کاربر بخواهد».
 *  - در Electron، این فراخوانی از طریق IPC در پردازش اصلی (Node) انجام
 *    می‌شود (ببینید electron/ai-handlers.cjs) که اصلاً محدودیت CORS ندارد،
 *    پس هیچ پراکسی‌ای لازم نیست.
 *  - در وب، فراخوانی مستقیم از مرورگر انجام می‌شود؛ اکثر سرویس‌های مدرن
 *    (Gemini، OpenRouter، Groq) هدر CORS باز برای استفادهٔ سمت کلاینت
 *    می‌فرستند. اگر کاربر خودش یک پراکسی مطمئن (مثلاً یک Cloudflare Worker
 *    شخصی) دارد می‌تواند در تنظیمات وارد کند؛ دیگر هیچ پراکسی عمومی به‌طور
 *    پیش‌فرض استفاده نمی‌شود.
 *
 * منطق ساخت درخواست/استخراج پاسخ در ./aiRequestCore.ts است
 * (نسخهٔ Electron: shared/ai-request-core.cjs با همان رفتار).
 */

import {
  OPENROUTER_FREE_ROUTER,
  AI_ANALYZE_TIMEOUT_MS,
  AI_TEST_TIMEOUT_MS,
  AI_MAX_TRANSIENT_RETRIES,
  buildOpenAICompatibleHeaders,
  normalizeOpenRouterModel,
  resolveOpenAICompatibleTestModel,
  resolveAiRuntimeConfig as resolveAiRuntimeConfigCore,
  buildVisionRequest as buildVisionRequestCore,
  buildTestConnectionRequest,
  extractResponseText as extractResponseTextCore,
  extractErrorMessage as extractErrorMessageCore,
  extractJsonText,
  extractResponseModelId,
  isTransientAiError,
  backoffDelayMs,
} from './aiRequestCore';

export type AIProviderId = 'gemini' | 'openai_compatible';

export interface AIProviderConfig {
  provider: AIProviderId;
  apiKey: string;
  /** برای gemini: کل URL endpoint (شامل :generateContent). برای openai_compatible: ریشهٔ API (مثلاً https://openrouter.ai/api/v1) */
  baseUrl?: string;
  /** فقط برای openai_compatible لازم است (نام مدل، مثل llama-3.2-11b-vision-preview) */
  model?: string;
  /** فقط در وب و فقط اگر کاربر صراحتاً یک پراکسی شخصیِ خودش را وارد کرده باشد */
  proxyUrl?: string;
}

export interface AIVisionCallResult {
  success: boolean;
  text?: string;
  error?: string;
  /** کد HTTP در صورت وجود، برای تشخیص rate-limit و... */
  status?: number;
  /** درخواست توسط کاربر یا ipc cancel قطع شده */
  aborted?: boolean;
  /** فاز ۳٫۲ — شناسهٔ مدلی که واقعاً پاسخ داده (ممکن است با مدل درخواستی فرق کند) */
  responseModelId?: string;
  /** فاز ۳٫۳ — چند تلاش مجدد لازم شد */
  retryCount?: number;
}

/** پیش‌فرض‌های آماده — در UI مشتری فقط شمارهٔ عمومی (مدل ۱…۴) دیده می‌شود */
export const AI_PROVIDER_PRESETS: Array<{
  id: string;
  /** شمارهٔ عمومی برای نمایش به مشتری (۱ تا ۴) */
  publicSlot: 1 | 2 | 3 | 4;
  /** نام واقعی سرویس — فقط برای متخصص در تنظیمات */
  label: { fa: string; en: string };
  provider: AIProviderId;
  baseUrl: string;
  model?: string;
  freeInfo: { fa: string; en: string };
  getKeyUrl: string;
}> = [
  {
    id: 'gemini-flash',
    publicSlot: 1,
    label: {
      fa: 'Google Gemini 2.0 Flash (پیشنهادی — رایگان)',
      en: 'Google Gemini 2.0 Flash (recommended — free)',
    },
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    freeInfo: {
      fa: 'سطح رایگان سخاوتمندانه دارد؛ کلید را در چند ثانیه از AI Studio بگیرید.',
      en: 'Has a generous free tier; get a key from AI Studio in seconds.',
    },
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'openrouter-free',
    publicSlot: 2,
    label: {
      fa: 'OpenRouter (مدل‌های رایگان :free)',
      en: 'OpenRouter (free :free models)',
    },
    provider: 'openai_compatible',
    baseUrl: 'https://openrouter.ai/api/v1',
    // روتر رایگان OpenRouter — خودش مدل رایگانِ در دسترس (حتی vision) را انتخاب می‌کند
    model: 'openrouter/free',
    freeInfo: {
      fa: 'روتر رایگان: خودکار از مدل‌های رایگان موجود (شامل تصویری) استفاده می‌کند؛ بدون نیاز به اعتبار.',
      en: 'Free router: automatically picks an available free model (including vision); no credits needed.',
    },
    getKeyUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'groq-free',
    publicSlot: 3,
    label: {
      fa: 'Groq (سریع، سطح رایگان)',
      en: 'Groq (fast, free tier)',
    },
    provider: 'openai_compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.2-11b-vision-preview',
    freeInfo: {
      fa: 'سطح رایگان با سرعت پاسخ‌دهی بسیار بالا.',
      en: 'Free tier with very fast response times.',
    },
    getKeyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'custom',
    publicSlot: 4,
    label: {
      fa: 'سفارشی (هر سرویس سازگار با OpenAI، حتی مدل محلی)',
      en: 'Custom (any OpenAI-compatible service, even local)',
    },
    provider: 'openai_compatible',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llava',
    freeInfo: {
      fa: 'برای Ollama/LM Studio محلی یا هر سرویس دیگری که خودتان مشخص می‌کنید.',
      en: 'For local Ollama/LM Studio or any other service you specify.',
    },
    getKeyUrl: '',
  },
];

/** تشخیص preset فعال از تنظیمات ذخیره‌شده */
export function detectAiPresetId(settings: {
  aiPresetId?: string;
  aiProvider?: string;
  aiBaseUrl?: string;
}): string {
  if (settings.aiPresetId && AI_PROVIDER_PRESETS.some(p => p.id === settings.aiPresetId)) {
    return settings.aiPresetId;
  }
  const base = (settings.aiBaseUrl || '').toLowerCase();
  if (base.includes('openrouter.ai')) return 'openrouter-free';
  if (base.includes('groq.com')) return 'groq-free';
  if ((settings.aiProvider || 'gemini') === 'openai_compatible') return 'custom';
  return 'gemini-flash';
}

/** برچسب عمومی بدون افشای نام سرویس واقعی — برای صفحهٔ تحلیل مشتری */
export function getAiPublicModelLabel(
  settings: { aiPresetId?: string; aiProvider?: string; aiBaseUrl?: string },
  lang: 'fa' | 'en' = 'fa',
): string {
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === detectAiPresetId(settings))
    ?? AI_PROVIDER_PRESETS[0];
  return lang === 'fa' ? `مدل ${preset.publicSlot}` : `Model ${preset.publicSlot}`;
}

export function getAiPublicSlot(
  settings: { aiPresetId?: string; aiProvider?: string; aiBaseUrl?: string },
): 1 | 2 | 3 | 4 {
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === detectAiPresetId(settings))
    ?? AI_PROVIDER_PRESETS[0];
  return preset.publicSlot;
}

export { OPENROUTER_FREE_ROUTER, AI_ANALYZE_TIMEOUT_MS, AI_TEST_TIMEOUT_MS };

// Re-export با نام‌های قبلی برای سازگاری
export { buildOpenAICompatibleHeaders, normalizeOpenRouterModel, resolveOpenAICompatibleTestModel };

export function resolveAiRuntimeConfig(config: AIProviderConfig): AIProviderConfig {
  return resolveAiRuntimeConfigCore(config as unknown as Record<string, unknown>) as AIProviderConfig;
}

export function buildVisionRequest(
  config: AIProviderConfig,
  base64Image: string,
  mimeType: string,
  prompt: string,
) {
  return buildVisionRequestCore(config, base64Image, mimeType, prompt);
}

export function extractResponseText(provider: AIProviderId, data: unknown): string | null {
  return extractResponseTextCore(provider, data);
}

export function extractErrorMessage(status: number, data: unknown): string {
  return extractErrorMessageCore(status, data);
}

/**
 * فراخوانی مستقیم AI از مرورگر (فقط برای نسخهٔ وب — در Electron از IPC استفاده می‌شود).
 * هیچ پراکسی عمومیِ پیش‌فرضی استفاده نمی‌شود؛ فقط اگر کاربر خودش proxyUrl را ست کرده باشد.
 */
async function callAIVisionOnce(
  config: AIProviderConfig,
  base64Image: string,
  mimeType: string,
  prompt: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<AIVisionCallResult> {
  const { url, headers, body } = buildVisionRequest(config, base64Image, mimeType, prompt);
  const finalUrl = config.proxyUrl ? config.proxyUrl + encodeURIComponent(url) : url;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? AI_ANALYZE_TIMEOUT_MS);
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { success: false, status: response.status, error: extractErrorMessage(response.status, data) };
    }

    const text = extractResponseText(config.provider, data);
    if (!text) {
      return { success: false, error: 'No response text from AI' };
    }

    return {
      success: true,
      text: extractJsonText(text),
      responseModelId: extractResponseModelId(config.provider, data) ?? undefined,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    const e = err as Error;
    return { success: false, error: e.name === 'AbortError' ? 'Timeout' : e.message };
  }
}

/**
 * فاز ۳٫۳ — تلاش مجدد خودکار فقط برای خطاهای گذرا (5xx/شبکه/timeout).
 * 401/403 و rate-limit تکرار نمی‌شوند: تکرارشان فقط سهمیه می‌سوزاند و
 * کاربر را بی‌دلیل منتظر نگه می‌دارد.
 */
export async function callAIVisionFromBrowser(
  config: AIProviderConfig,
  base64Image: string,
  mimeType: string,
  prompt: string,
  opts: { signal?: AbortSignal; timeoutMs?: number; maxRetries?: number } = {}
): Promise<AIVisionCallResult> {
  const maxRetries = opts.maxRetries ?? AI_MAX_TRANSIENT_RETRIES;
  let last: AIVisionCallResult = { success: false, error: 'No attempt made' };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    last = await callAIVisionOnce(config, base64Image, mimeType, prompt, opts);
    if (last.success) return attempt ? { ...last, retryCount: attempt } : last;
    // لغو توسط کاربر هرگز retry نمی‌شود
    if (opts.signal?.aborted || last.aborted) break;
    if (attempt >= maxRetries) break;
    if (!isTransientAiError(last.status, last.error)) break;
    await new Promise(r => setTimeout(r, backoffDelayMs(attempt)));
  }
  return maxRetries > 0 ? { ...last, retryCount: maxRetries } : last;
}

/** تست سریع اتصال (پرامپت خیلی کوتاه، بدون تصویر) */
export async function testAIConnectionFromBrowser(
  config: AIProviderConfig,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<AIVisionCallResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? AI_TEST_TIMEOUT_MS);

  try {
    const { url, headers, body } = buildTestConnectionRequest(config);
    const finalUrl = config.proxyUrl ? config.proxyUrl + encodeURIComponent(url) : url;
    const response = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { success: false, status: response.status, error: extractErrorMessage(response.status, data) };
    }
    return { success: true };
  } catch (err) {
    clearTimeout(timeoutId);
    const e = err as Error;
    return { success: false, error: e.name === 'AbortError' ? 'Timeout' : e.message };
  }
}
