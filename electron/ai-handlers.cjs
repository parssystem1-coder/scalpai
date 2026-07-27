/**
 * AI Handlers - فراخوانی سرویس‌های هوش مصنوعی از پردازش اصلی (Main Process)
 * -----------------------------------------------------------------------
 * منطق ساخت درخواست/استخراج پاسخ از shared/ai-request-core.cjs می‌آید
 * (همان منبعی که src/lib/aiProvider.ts استفاده می‌کند).
 *
 * چرا با Node fetch ساده نبود:
 *  - Node's built-in fetch (undici) هیچ پروکسی‌ای را به‌طور خودکار اعمال
 *    نمی‌کند، در حالی‌که این برنامه یک قابلیت «پروکسی سیستم» در تنظیمات
 *    دارد که با session.defaultSession.setProxy تنظیم می‌شود و فقط روی
 *    شبکهٔ Chromium اثر دارد.
 *  - راه‌حل: از ماژول `net` خودِ Electron استفاده می‌کنیم.
 */

const {
  AI_ANALYZE_TIMEOUT_MS,
  AI_TEST_TIMEOUT_MS,
  resolveAiRuntimeConfig,
  buildVisionRequest,
  buildTestConnectionRequest,
  extractResponseText,
  extractErrorMessage,
  extractJsonText,
} = require('../shared/ai-request-core.cjs');

/** @type {Map<string, () => void>} */
const activeAborts = new Map();

/**
 * درخواست POST با ماژول net الکترون — پروکسیِ session را خودکار اعمال می‌کند،
 * هیچ محدودیت CORS ندارد، و هیچ سرور واسطهٔ شخص‌ثالثی درگیر نمی‌شود.
 * @param {import('electron').Net} net
 * @param {string} [requestId] — اگر داده شود، با ai:cancel قابل abort است
 */
function netPostJson(net, url, headers, bodyObj, timeoutMs, requestId) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (requestId) activeAborts.delete(requestId);
      resolve(result);
    };

    let request;
    try {
      request = net.request({ method: 'POST', url });
    } catch (err) {
      finish({ ok: false, status: 0, data: { error: err.message || String(err) }, aborted: false });
      return;
    }

    Object.entries(headers).forEach(([key, value]) => request.setHeader(key, value));

    const abortRequest = () => {
      try { request.abort(); } catch { /* noop */ }
      finish({ ok: false, status: 0, data: { error: 'Aborted' }, aborted: true });
    };

    if (requestId) {
      activeAborts.set(requestId, abortRequest);
    }

    const timeoutId = setTimeout(() => {
      try { request.abort(); } catch { /* noop */ }
      finish({ ok: false, status: 0, data: { error: 'Timeout' }, aborted: false });
    }, timeoutMs);

    request.on('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || 'Invalid JSON response' }; }
        const status = response.statusCode || 0;
        finish({ ok: status >= 200 && status < 300, status, data, aborted: false });
      });
      response.on('error', (err) => {
        finish({ ok: false, status: 0, data: { error: err.message || String(err) }, aborted: false });
      });
    });

    request.on('error', (err) => {
      if (settled) return;
      const msg = err.message || String(err);
      const aborted = /abort/i.test(msg);
      finish({ ok: false, status: 0, data: { error: aborted ? 'Aborted' : msg }, aborted });
    });

    request.write(JSON.stringify(bodyObj));
    request.end();
  });
}

/**
 * @param {import('electron').Net} net
 */
function createAiHandlers(net) {
  return {
    async analyze(params) {
      const { base64Image, mimeType, prompt, requestId } = params || {};
      if (!params?.apiKey) return { success: false, error: 'API key is missing' };
      if (!base64Image) return { success: false, error: 'No image provided' };

      const config = resolveAiRuntimeConfig(params);
      const { url, headers, body } = buildVisionRequest(config, base64Image, mimeType || 'image/jpeg', prompt || '');

      const result = await netPostJson(net, url, headers, body, AI_ANALYZE_TIMEOUT_MS, requestId || null);
      if (result.aborted) {
        return { success: false, aborted: true, error: 'Aborted' };
      }
      if (!result.ok) {
        let error = extractErrorMessage(result.status, result.data);
        if (/API key not valid/i.test(error) && String(config.apiKey).startsWith('sk-or-')) {
          error = 'کلید OpenRouter به سرویس Gemini فرستاده شده بود. پروایدر را روی OpenRouter بگذارید و دوباره تلاش کنید.';
        }
        return { success: false, status: result.status, error };
      }

      const text = extractResponseText(config.provider, result.data);
      if (!text) return { success: false, error: 'No response text from AI' };

      return { success: true, text: extractJsonText(text) };
    },

    async testConnection(params) {
      if (!params?.apiKey) return { success: false, error: 'API key is missing' };

      const config = resolveAiRuntimeConfig(params);
      const { url, headers, body } = buildTestConnectionRequest(config);

      const result = await netPostJson(net, url, headers, body, AI_TEST_TIMEOUT_MS, null);
      if (!result.ok) {
        let error = extractErrorMessage(result.status, result.data);
        if (/API key not valid/i.test(error) && String(config.apiKey).startsWith('sk-or-')) {
          error = 'کلید OpenRouter است؛ سرویس باید OpenRouter باشد نه Gemini. کارت OpenRouter را انتخاب کنید.';
        }
        return { success: false, status: result.status, error };
      }
      return { success: true };
    },

    cancel(requestId) {
      if (!requestId) return { success: false };
      const abort = activeAborts.get(requestId);
      if (!abort) return { success: false };
      abort();
      return { success: true };
    },
  };
}

module.exports = { createAiHandlers, extractJsonText };
