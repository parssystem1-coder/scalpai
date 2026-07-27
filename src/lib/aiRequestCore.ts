/**
 * منطق مشترک ساخت درخواست AI — نسخهٔ ESM برای renderer (Vite).
 * نسخهٔ Electron: shared/ai-request-core.cjs (همان رفتار؛ require در main).
 * هنگام تغییر منطق، هر دو فایل را هم‌راستا نگه دارید.
 */

export const DEFAULT_GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

export const OPENROUTER_FREE_ROUTER = 'openrouter/free';

export const OPENROUTER_RETIRED_MODELS = [
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-90b-vision-instruct:free',
];

export const AI_VISION_TEMPERATURE = 0.4;
export const AI_VISION_TOP_K = 32;
export const AI_VISION_TOP_P = 1;
export const AI_VISION_MAX_TOKENS = 4096;
export const AI_ANALYZE_TIMEOUT_MS = 45000;
export const AI_TEST_TIMEOUT_MS = 15000;

export type AiRuntimeConfig = {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  [key: string]: unknown;
};

export function stripDataUrlPrefix(base64Image: string): string {
  return base64Image && String(base64Image).includes('base64,')
    ? String(base64Image).split('base64,')[1]
    : base64Image;
}

export function buildOpenAICompatibleHeaders(apiKey: string, baseUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  const root = String(baseUrl || '').toLowerCase();
  if (root.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://scalpai.app';
    headers['X-Title'] = 'ScalpAI';
  }
  return headers;
}

export function normalizeOpenRouterModel(baseUrl?: string, model?: string): string {
  const root = String(baseUrl || '').toLowerCase();
  if (!root.includes('openrouter.ai')) return String(model || '').trim();
  const m = String(model || '').trim();
  if (
    !m ||
    m.includes('gpt-4o') ||
    OPENROUTER_RETIRED_MODELS.includes(m) ||
    (m.endsWith(':free') && m !== OPENROUTER_FREE_ROUTER)
  ) {
    return OPENROUTER_FREE_ROUTER;
  }
  return m;
}

export function resolveOpenAICompatibleTestModel(baseUrl?: string, configuredModel?: string): string {
  const root = String(baseUrl || '').toLowerCase();
  const model = String(configuredModel || '').trim();
  if (root.includes('openrouter.ai')) {
    if (
      !model ||
      model.includes('gpt-4o') ||
      OPENROUTER_RETIRED_MODELS.includes(model) ||
      (model.includes(':free') && model !== OPENROUTER_FREE_ROUTER)
    ) {
      return OPENROUTER_FREE_ROUTER;
    }
    return model;
  }
  return model || 'gpt-4o-mini';
}

export function resolveAiRuntimeConfig<T extends Record<string, unknown>>(config: T): T & AiRuntimeConfig {
  const apiKey = String((config && config.apiKey) || '').trim();
  let provider = String((config && config.provider) || 'gemini');
  let baseUrl = String((config && config.baseUrl) || '').trim();
  let model = String((config && config.model) || '').trim();

  const looksLikeOpenRouterKey = apiKey.startsWith('sk-or-');
  const looksLikeOpenRouterUrl = baseUrl.toLowerCase().includes('openrouter.ai');

  if (looksLikeOpenRouterKey || looksLikeOpenRouterUrl) {
    provider = 'openai_compatible';
    if (!looksLikeOpenRouterUrl) {
      baseUrl = 'https://openrouter.ai/api/v1';
    }
    model = normalizeOpenRouterModel(baseUrl, model);
  }

  return {
    ...config,
    provider,
    apiKey,
    baseUrl: baseUrl || undefined,
    model: model || undefined,
  };
}

export function buildVisionRequest(
  config: { provider: string; apiKey: string; baseUrl?: string; model?: string },
  base64Image: string,
  mimeType: string,
  prompt: string,
): { url: string; headers: Record<string, string>; body: unknown } {
  const base64Data = stripDataUrlPrefix(base64Image);

  if (config.provider === 'gemini') {
    const baseUrl = (config.baseUrl && String(config.baseUrl).trim()) || DEFAULT_GEMINI_URL;
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.apiKey)}`;
    return {
      url,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: AI_VISION_TEMPERATURE,
          topK: AI_VISION_TOP_K,
          topP: AI_VISION_TOP_P,
          maxOutputTokens: AI_VISION_MAX_TOKENS,
        },
      },
    };
  }

  const root = ((config.baseUrl && String(config.baseUrl).trim()) || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const url = `${root}/chat/completions`;
  return {
    url,
    headers: buildOpenAICompatibleHeaders(config.apiKey, root),
    body: {
      model: config.model || 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
          ],
        },
      ],
      temperature: AI_VISION_TEMPERATURE,
      max_tokens: AI_VISION_MAX_TOKENS,
    },
  };
}

export function buildTestConnectionRequest(config: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
}): { url: string; headers: Record<string, string>; body: unknown } {
  if (config.provider === 'gemini') {
    const baseUrl = (config.baseUrl && String(config.baseUrl).trim()) || DEFAULT_GEMINI_URL;
    const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.apiKey)}`;
    return {
      url,
      headers: { 'Content-Type': 'application/json' },
      body: {
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 5 },
      },
    };
  }

  const root = ((config.baseUrl && String(config.baseUrl).trim()) || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  return {
    url: `${root}/chat/completions`,
    headers: buildOpenAICompatibleHeaders(config.apiKey, root),
    body: {
      model: resolveOpenAICompatibleTestModel(root, config.model),
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    },
  };
}

export function extractResponseText(provider: string, data: unknown): string | null {
  if (provider === 'gemini') {
    const d = data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return d?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  }
  const d = data as {
    choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  };
  const content = d?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(c => c.text || '').join('\n') || null;
  return null;
}

export function extractErrorMessage(status: number, data: unknown): string {
  const d = data as { error?: { message?: string } | string };
  if (d?.error) {
    if (typeof d.error === 'string') return d.error;
    if (d.error.message) return d.error.message;
  }
  return `HTTP ${status}`;
}

export function extractJsonText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let jsonStr = raw.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  const firstBrace = jsonStr.indexOf('{');
  const firstBracket = jsonStr.indexOf('[');
  let start = -1;
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) start = firstBrace;
  else if (firstBracket >= 0) start = firstBracket;
  if (start < 0) return jsonStr.trim();

  const open = jsonStr[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return jsonStr.slice(start, i + 1).trim();
    }
  }
  return jsonStr.slice(start).trim();
}
