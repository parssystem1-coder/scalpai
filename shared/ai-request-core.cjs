/**
 * منطق مشترک ساخت درخواست AI — منبع الکترون و وب (CJS).
 * -----------------------------------------------------------------------
 * این فایل منبع واحد حقیقت (Single Source of Truth) برای تمام هدرها، بدنهٔ
 * درخواست‌ها، استخراج متن هوش مصنوعی و فرآیندهای تحلیل خطا است.
 * هرگونه تغییر در API ابری فقط در این فایل اعمال می‌شود.
 */

'use strict';

const DEFAULT_GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const OPENROUTER_FREE_ROUTER = 'openrouter/free';

const OPENROUTER_RETIRED_MODELS = [
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.2-90b-vision-instruct:free',
];

const AI_VISION_TEMPERATURE = 0.4;
const AI_VISION_TOP_K = 32;
const AI_VISION_TOP_P = 1;
const AI_VISION_MAX_TOKENS = 4096;
const AI_ANALYZE_TIMEOUT_MS = 45000;
const AI_TEST_TIMEOUT_MS = 15000;
const AI_MAX_TRANSIENT_RETRIES = 2;

function stripDataUrlPrefix(base64Image) {
  return base64Image && String(base64Image).includes('base64,')
    ? String(base64Image).split('base64,')[1]
    : base64Image;
}

function buildOpenAICompatibleHeaders(apiKey, baseUrl) {
  const headers = {
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

function normalizeOpenRouterModel(baseUrl, model) {
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

function resolveOpenAICompatibleTestModel(baseUrl, configuredModel) {
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

function resolveAiRuntimeConfig(config) {
  const apiKey = String((config && config.apiKey) || '').trim();
  let provider = (config && config.provider) || 'gemini';
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
    ...(config || {}),
    provider,
    apiKey,
    baseUrl: baseUrl || undefined,
    model: model || undefined,
  };
}

function buildVisionRequest(config, base64Image, mimeType, prompt) {
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

function buildTestConnectionRequest(config) {
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

function extractResponseText(provider, data) {
  if (provider === 'gemini') {
    return (
      (data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text) ||
      null
    );
  }
  const content =
    data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => c.text || '').join('\n') || null;
  return null;
}

function extractResponseModelId(provider, data) {
  if (provider === 'gemini') {
    return (data && (data.modelVersion || data.model)) || null;
  }
  return (data && typeof data.model === 'string' && data.model) || null;
}

function isTransientAiError(status, message) {
  if (typeof status === 'number') {
    if (status === 408 || status === 425 || status === 429) return false;
    if (status >= 500 && status < 600) return true;
    return false;
  }
  const m = (message || '').toLowerCase();
  if (!m) return false;
  if (m.includes('rate limit') || m.includes('quota')) return false;
  return (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('econnreset') ||
    m.includes('socket hang up')
  );
}

function backoffDelayMs(attempt, baseMs = 700, maxMs = 6000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function extractErrorMessage(status, data) {
  if (data && data.error) {
    if (typeof data.error === 'string') return data.error;
    if (data.error.message) return data.error.message;
  }
  return `HTTP ${status}`;
}

function extractJsonText(raw) {
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

module.exports = {
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
};
