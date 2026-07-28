import { webAdapter } from './adapter-web';
import type { DatabaseAdapter, PaginationParams } from './types';

// Type for Electron API exposed through preload
interface ElectronAPI {
  db: {
    query: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  proxy: {
    set: (proxyUrl: string) => Promise<{ success: boolean; error?: string; mode?: string }>;
    get: () => Promise<string | null>;
    test: (testUrl?: string) => Promise<{ success: boolean; error?: string; statusCode?: number }>;
  };
  dialog: {
    selectDirectory: () => Promise<string[] | null>;
    saveFile: (options: {
      data?: string;
      defaultPath?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    }) => Promise<string | { success: boolean; filePath?: string; error?: string } | null>;
    openFile: (options?: {
      filters?: Array<{ name: string; extensions: string[] }>;
      defaultPath?: string;
      readContent?: boolean;
    }) => Promise<string[] | { filePaths: string[]; content?: string; error?: string } | null>;
  };
  fs: {
    saveFile: (filePath: string, data: string) => Promise<{ success?: boolean; error?: string }>;
    readFile: (filePath: string) => Promise<{ success?: boolean; content?: string; error?: string }>;
  };
  backup?: {
    exportPackage: (params?: { defaultPath?: string }) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; legacy?: boolean; error?: string }>;
    importAuto: () => Promise<{ success: boolean; packageImport?: boolean; canceled?: boolean; error?: string }>;
  };
  auth?: {
    createSession: (username: string, password: string) => Promise<{ success: boolean; token?: string; username?: string; error?: string }>;
    validateSession: (token: string) => Promise<{ valid: boolean; username?: string }>;
    destroySession: (token: string) => Promise<{ success: boolean }>;
    updateUsername: (token: string, username: string) => Promise<{ success: boolean }>;
  };
  safeStorage: {
    isAvailable: () => Promise<boolean>;
  };
  app: {
    getPath: (name: string) => Promise<string>;
    quit: () => Promise<void>;
  };
  print?: {
    html: (html: string) => Promise<{ success: boolean; error?: string }>;
    preview: (html: string) => Promise<{ success: boolean; error?: string }>;
    toPdf: (
      html: string,
      defaultPath?: string,
    ) => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  };
  offline?: {
    analyze: (base64Image: string, lang?: string) => Promise<{ success: boolean; data?: unknown; error?: string; fallback?: boolean }>;
    checkPython: () => Promise<{ scriptExists: boolean; scriptPath?: string; pythonCommand?: string }>;
  };
  ai?: {
    analyze: (params: Record<string, unknown>) => Promise<{ success: boolean; text?: string; error?: string; status?: number; aborted?: boolean }>;
    testConnection: (params: Record<string, unknown>) => Promise<{ success: boolean; error?: string; status?: number }>;
    cancel?: (requestId: string) => Promise<{ success: boolean }>;
  };
  platform: string;
  isElectron: boolean;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    isElectron?: boolean;
  }
}

// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && window.isElectron === true;

// Wrapper around the IPC call that throws instead of silently returning
// an { error } object as if it were real data. Without this, a failed
// or uninitialized database (e.g. the better-sqlite3 native module not
// loading) looked like a successful save/read to the rest of the app,
// while nothing was actually persisted to disk.
async function callDb(method: string, params?: Record<string, unknown>): Promise<unknown> {
  const result = await window.electronAPI!.db.query(method, params);
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error(String((result as { error: unknown }).error));
  }
  return result;
}

// Create Electron adapter that uses IPC
const createElectronAdapter = (): DatabaseAdapter => ({
  async init() {
    // Database is initialized in main process
  },

  async getClients(params?: PaginationParams) {
    return await callDb('getClients', params as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['getClients']>>;
  },

  async getClientsCount(search?: string) {
    return await callDb('getClientsCount', { search }) as number;
  },

  async getClient(id: string) {
    return await callDb('getClient', { id }) as Awaited<ReturnType<DatabaseAdapter['getClient']>>;
  },

  async createClient(data) {
    return await callDb('createClient', data as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['createClient']>>;
  },

  async updateClient(id, patch) {
    return await callDb('updateClient', { id, ...patch }) as Awaited<ReturnType<DatabaseAdapter['updateClient']>>;
  },

  async deleteClient(id) {
    await callDb('deleteClient', { id });
  },

  async getGalleryByClient(clientId, params?: PaginationParams) {
    return await callDb('getGalleryByClient', { clientId, ...params }) as Awaited<ReturnType<DatabaseAdapter['getGalleryByClient']>>;
  },

  async getAllGallery(params?: PaginationParams) {
    return await callDb('getAllGallery', params as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['getAllGallery']>>;
  },

  async getGalleryCount(clientId?: string) {
    return await callDb('getGalleryCount', { clientId }) as number;
  },

  async getGalleryPage(params) {
    return await callDb('getGalleryPage', params as unknown as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['getGalleryPage']>>;
  },

  async getGalleryPageCount(params) {
    return await callDb('getGalleryPageCount', params as unknown as Record<string, unknown>) as number;
  },

  async getGalleryItemDataUrl(id: string) {
    return await callDb('getGalleryItemDataUrl', { id }) as string | null;
  },

  async addGalleryItem(clientId, item) {
    return await callDb('addGalleryItem', { ...item, clientId }) as Awaited<ReturnType<DatabaseAdapter['addGalleryItem']>>;
  },

  async deleteGalleryItem(id) {
    await callDb('deleteGalleryItem', { id });
  },

  async getTrainingPoolItems(params) {
    return await callDb('getTrainingPoolItems', params as unknown as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['getTrainingPoolItems']>>;
  },

  async getTrainingPoolItemsCount(params) {
    return await callDb('getTrainingPoolItemsCount', params as Record<string, unknown>) as number;
  },

  async updateTrainingPoolItemStatus(id, status) {
    await callDb('updateTrainingPoolItemStatus', { id, status });
  },

  async getSessions(params?: PaginationParams) {
    return await callDb('getSessions', params as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['getSessions']>>;
  },

  async getSessionsCount() {
    return await callDb('getSessionsCount') as number;
  },

  async getSessionsByClient(clientId) {
    return await callDb('getSessionsByClient', { clientId }) as Awaited<ReturnType<DatabaseAdapter['getSessionsByClient']>>;
  },

  async createSession(data) {
    return await callDb('createSession', data as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['createSession']>>;
  },

  async updateSession(id, patch) {
    return await callDb('updateSession', { id, ...patch }) as Awaited<ReturnType<DatabaseAdapter['updateSession']>>;
  },

  async deleteSession(id) {
    await callDb('deleteSession', { id });
  },

  async getQuestionnaireRevisionsByClient(clientId) {
    return await callDb('getQuestionnaireRevisionsByClient', { clientId }) as Awaited<ReturnType<DatabaseAdapter['getQuestionnaireRevisionsByClient']>>;
  },

  async getQuestionnaireRevision(clientId, sessionId) {
    return await callDb('getQuestionnaireRevision', { clientId, sessionId }) as Awaited<ReturnType<DatabaseAdapter['getQuestionnaireRevision']>>;
  },

  async getPreviousFinalQuestionnaireRevision(clientId, excludeSessionId) {
    return await callDb('getPreviousFinalQuestionnaireRevision', {
      clientId,
      excludeSessionId,
    }) as Awaited<ReturnType<DatabaseAdapter['getPreviousFinalQuestionnaireRevision']>>;
  },

  async saveQuestionnaireRevision(input) {
    return await callDb('saveQuestionnaireRevision', input as unknown as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['saveQuestionnaireRevision']>>;
  },

  async getTrichologists() {
    return await callDb('getTrichologists') as Awaited<ReturnType<DatabaseAdapter['getTrichologists']>>;
  },

  async createTrichologist(data) {
    return await callDb('createTrichologist', data as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['createTrichologist']>>;
  },

  async updateTrichologist(id, patch) {
    return await callDb('updateTrichologist', { id, ...patch }) as Awaited<ReturnType<DatabaseAdapter['updateTrichologist']>>;
  },

  async deleteTrichologist(id) {
    await callDb('deleteTrichologist', { id });
  },

  async getAnalyses(params?: PaginationParams) {
    return await callDb('getAnalyses', params as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['getAnalyses']>>;
  },

  async getAnalysesCount() {
    return await callDb('getAnalysesCount') as number;
  },

  async getAnalysesByClient(clientId) {
    return await callDb('getAnalysesByClient', { clientId }) as Awaited<ReturnType<DatabaseAdapter['getAnalysesByClient']>>;
  },

  async getAnalysisAnnotatedImage(id: string) {
    return await callDb('getAnalysisAnnotatedImage', { id }) as string | null;
  },

  async createAnalysis(data) {
    return await callDb('createAnalysis', data as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['createAnalysis']>>;
  },

  async updateAnalysis(id, patch) {
    return await callDb('updateAnalysis', { id, ...patch }) as Awaited<ReturnType<DatabaseAdapter['updateAnalysis']>>;
  },

  async deleteAnalysis(id) {
    await callDb('deleteAnalysis', { id });
  },

  async getSettings() {
    return await callDb('getSettings') as Awaited<ReturnType<DatabaseAdapter['getSettings']>>;
  },

  async updateSettings(patch) {
    return await callDb('updateSettings', patch as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['updateSettings']>>;
  },

  async exportData() {
    return await callDb('exportData') as string;
  },

  async importData(jsonData) {
    await callDb('importData', { jsonData });
  },

  async verifyCredentials(username, password) {
    return await callDb('verifyCredentials', { username, password }) as boolean;
  },

  async hasCredentials() {
    return await callDb('hasCredentials') as boolean;
  },

  async getTrainingSamples() {
    return await callDb('getTrainingSamples') as Awaited<ReturnType<DatabaseAdapter['getTrainingSamples']>>;
  },

  async addTrainingSample(data) {
    return await callDb('addTrainingSample', data as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['addTrainingSample']>>;
  },

  async saveTrainingSampleAndCompletePoolItem(data) {
    return await callDb('saveTrainingSampleAndCompletePoolItem', data as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['saveTrainingSampleAndCompletePoolItem']>>;
  },

  async updateTrainingSample(id, patch) {
    return await callDb('updateTrainingSample', { id, ...patch }) as Awaited<ReturnType<DatabaseAdapter['updateTrainingSample']>>;
  },

  async deleteTrainingSample(id) {
    await callDb('deleteTrainingSample', { id });
  },

  async markTrainingSamplesUsed(ids, modelVersion) {
    await callDb('markTrainingSamplesUsed', { ids, modelVersion });
  },

  async getModelMetadata() {
    return await callDb('getModelMetadata') as Awaited<ReturnType<DatabaseAdapter['getModelMetadata']>>;
  },

  async updateModelMetadata(patch) {
    return await callDb('updateModelMetadata', patch as Record<string, unknown>) as Awaited<ReturnType<DatabaseAdapter['updateModelMetadata']>>;
  },

  async clearModelMetadata() {
    await callDb('clearModelMetadata');
  },
});

// Use Electron adapter if in Electron, otherwise use web adapter
export const db: DatabaseAdapter = isElectron ? createElectronAdapter() : webAdapter;

/**
 * محتوای کامل یک آیتم گالری را برمی‌گرداند.
 * - آیتم‌های فایل‌محور (Electron با filePath): لیست‌ها فقط thumbnail را در url
 *   می‌گذارند، پس محتوای کامل باید از دیسک خوانده شود.
 * - آیتم‌های وب/legacy (بدون filePath): url خودِ محتوای کامل است.
 */
export async function resolveGalleryItemUrl(item: import('./types').GalleryItem): Promise<string> {
  if (!item.filePath) return item.url;
  try {
    const full = await db.getGalleryItemDataUrl(item.id);
    return full || item.url;
  } catch (err) {
    console.error('Failed to load full gallery item content:', err);
    return item.url;
  }
}

// Export utilities for Electron file operations
export const electronUtils = {
  isElectron,

  async selectDirectory(): Promise<string[] | null> {
    if (!isElectron) return null;
    return await window.electronAPI!.dialog.selectDirectory();
  },

  async saveFileToPath(filePath: string, data: string): Promise<boolean> {
    if (!isElectron) return false;
    const result = await window.electronAPI!.fs.saveFile(filePath, data);
    return result.success === true;
  },

  async saveFileDialog(data: string, defaultPath?: string): Promise<string | null> {
    if (!isElectron) return null;
    const result = await window.electronAPI!.dialog.saveFile({ data, defaultPath });
    if (!result) return null;
    // main ممکن است خودش فایل را نوشته باشد و { success, filePath } برگرداند
    if (typeof result === 'string') return result;
    if (result.success && result.filePath) return result.filePath;
    if (result.error) throw new Error(result.error);
    return null;
  },

  async openFileDialog(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
    readContent?: boolean;
  }): Promise<string[] | null> {
    if (!isElectron) return null;
    const result = await window.electronAPI!.dialog.openFile(options);
    if (!result) return null;
    if (Array.isArray(result)) return result;
    return result.filePaths || null;
  },

  /** باز کردن فایل و خواندن محتوا در main (بدون افشای مسیر برای round-trip جداگانه) */
  async openAndReadFile(options?: {
    filters?: Array<{ name: string; extensions: string[] }>;
    defaultPath?: string;
  }): Promise<string | null> {
    if (!isElectron) return null;
    const result = await window.electronAPI!.dialog.openFile({ ...options, readContent: true });
    if (!result || Array.isArray(result)) return null;
    if (result.error || result.content === undefined) return null;
    return result.content;
  },

  async readFile(filePath: string): Promise<string | null> {
    if (!isElectron) return null;
    const result = await window.electronAPI!.fs.readFile(filePath);
    return result.success ? result.content ?? null : null;
  },

  async getAppPath(name: string): Promise<string | null> {
    if (!isElectron) return null;
    return await window.electronAPI!.app.getPath(name);
  },
};

// Export Proxy utilities for Electron
export const proxyUtils = {
  isElectron,

  async setProxy(proxyUrl: string): Promise<{ success: boolean; error?: string }> {
    if (!isElectron) return { success: false, error: 'Not in Electron environment' };
    return await window.electronAPI!.proxy.set(proxyUrl);
  },

  async getProxy(): Promise<string | null> {
    if (!isElectron) return null;
    return await window.electronAPI!.proxy.get();
  },

  async testProxy(testUrl?: string): Promise<{ success: boolean; error?: string }> {
    if (!isElectron) return { success: false, error: 'Not in Electron environment' };
    return await window.electronAPI!.proxy.test(testUrl);
  },
};

// Export Offline Analysis utilities
export const offlineUtils = {
  isElectron,

  async analyze(base64Image: string, lang = 'fa') {
    if (isElectron && window.electronAPI?.offline) {
      const result = await window.electronAPI.offline.analyze(base64Image, lang);
      if (result.success && result.data) {
        return { success: true as const, data: result.data };
      }
      if (result.fallback) {
        const { analyzeImageInBrowser } = await import('../lib/offlineAnalysis');
        const data = await analyzeImageInBrowser(
          base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`,
          lang === 'fa'
        );
        return { success: true as const, data, fallback: true };
      }
      return { success: false as const, error: result.error || 'Analysis failed' };
    }

    const { analyzeImageInBrowser } = await import('../lib/offlineAnalysis');
    const data = await analyzeImageInBrowser(
      base64Image.startsWith('data:') ? base64Image : `data:image/jpeg;base64,${base64Image}`,
      lang === 'fa'
    );
    return { success: true as const, data };
  },

  async checkPython() {
    if (!isElectron || !window.electronAPI?.offline) {
      return { scriptExists: false, engine: 'browser' as const };
    }
    const info = await window.electronAPI.offline.checkPython();
    return { ...info, engine: 'python' as const };
  },
};

// Export unified AI provider utilities.
// - Electron: routed through IPC → main process → Electron's `net` module,
//   which has zero CORS restriction and automatically honors the configured
//   system proxy (Settings > Proxy), so no third-party proxy is ever needed.
// - Web: direct fetch from the browser. No public proxy is used by default;
//   if the user has explicitly configured their own trusted proxy
//   (settings.aiProxyUrl), it's used, otherwise the request goes straight
//   to the provider.
export const aiUtils = {
  isElectron,

  async analyze(config: import('../lib/aiProvider').AIProviderConfig, base64Image: string, mimeType: string, prompt: string, opts: { signal?: AbortSignal; requestId?: string } = {}) {
    if (isElectron && window.electronAPI?.ai) {
      // در Electron کل پیکربندی (کلید/provider/baseUrl/model) در main از
      // دیتابیس خوانده می‌شود؛ از اینجا فقط دادهٔ تحلیل فرستاده می‌شود تا
      // renderer نتواند مقصد درخواست (و در نتیجه کلید API) را کنترل کند.
      const requestId = opts.requestId || crypto.randomUUID();
      const onAbort = () => {
        void window.electronAPI?.ai?.cancel?.(requestId);
      };
      if (opts.signal) {
        if (opts.signal.aborted) {
          onAbort();
          return { success: false, aborted: true, error: 'Aborted' };
        }
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
      try {
        const result = await window.electronAPI.ai.analyze({
          base64Image,
          mimeType,
          prompt,
          requestId,
        });
        return result;
      } finally {
        opts.signal?.removeEventListener('abort', onAbort);
      }
    }
    const { callAIVisionFromBrowser } = await import('../lib/aiProvider');
    return callAIVisionFromBrowser(config, base64Image, mimeType, prompt, opts);
  },

  async testConnection(config: import('../lib/aiProvider').AIProviderConfig) {
    if (isElectron && window.electronAPI?.ai) {
      // پیکربندی در main از settings ذخیره‌شده خوانده می‌شود
      return window.electronAPI.ai.testConnection({});
    }
    const { testAIConnectionFromBrowser } = await import('../lib/aiProvider');
    return testAIConnectionFromBrowser(config);
  },
};

// Export Safe Storage utilities — فقط وضعیت؛ رمزنگاری فقط در main انجام می‌شود
export const safeStorageUtils = {
  isElectron,

  async isAvailable(): Promise<boolean> {
    if (!isElectron) return false;
    return await window.electronAPI!.safeStorage.isAvailable();
  },
};

// Export Backup Package utilities (فاز ۰.۵) — بکاپ پوشه‌ای استریمی در دسکتاپ.
// دیالوگ انتخاب پوشه/فایل و کل انتقال فایل در main انجام می‌شود؛ در نسخهٔ وب
// همچنان مسیر کلاسیک exportData (JSON تکی) فعال است.
export const backupUtils = {
  isElectron,

  /** ایجاد بستهٔ بکاپ v3؛ مسیر بسته یا پیغام لغو/خطا برمی‌گردد */
  async exportPackage(defaultPath?: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; legacy?: boolean; error?: string }> {
    if (!isElectron || !window.electronAPI?.backup) {
      return { success: false, error: 'Package backup is only available on desktop' };
    }
    return window.electronAPI.backup.exportPackage(defaultPath ? { defaultPath } : undefined);
  },

  /** بازیابی خودکار: بستهٔ v3 (data.json داخل پوشه) یا JSON کلاسیک v2 */
  async importAuto(): Promise<{ success: boolean; packageImport?: boolean; canceled?: boolean; error?: string }> {
    if (!isElectron || !window.electronAPI?.backup) {
      return { success: false, error: 'Package backup is only available on desktop' };
    }
    return window.electronAPI.backup.importAuto();
  },
};

export * from './types';
export { webAdapter } from './adapter-web';
