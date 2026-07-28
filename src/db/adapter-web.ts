import localforage from 'localforage';
import type { DatabaseAdapter, Client, GalleryItem, Session, Trichologist, Analysis, Settings, TrainingSample, LocalModelMetadata, QuestionnaireRevision } from './types';
import { DEFAULT_AI_CONFIDENCE_THRESHOLD } from '../lib/heuristicConstants';
import { parseStoredJson } from '../lib/safeJson';
import { hashPassword, verifyPassword, stripPasswordFromSettings, isLegacyPlaintextPassword, verifyLegacyPlaintextPassword, MIN_PASSWORD_LENGTH } from '../lib/passwordAuth';
import {
  SYSTEM_TRAINING_POOL_CLIENT_ID,
  buildSystemTrainingPoolClientRecord,
} from '../lib/systemTrainingPool';

const generateId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const clientsStore = localforage.createInstance({ name: 'scalpai', storeName: 'clients' });
const galleryStore = localforage.createInstance({ name: 'scalpai', storeName: 'gallery' });
const sessionsStore = localforage.createInstance({ name: 'scalpai', storeName: 'sessions' });
const trichologistsStore = localforage.createInstance({ name: 'scalpai', storeName: 'trichologists' });
const analysesStore = localforage.createInstance({ name: 'scalpai', storeName: 'analyses' });
const settingsStore = localforage.createInstance({ name: 'scalpai', storeName: 'settings' });
const trainingSamplesStore = localforage.createInstance({ name: 'scalpai', storeName: 'trainingSamples' });
const modelMetadataStore = localforage.createInstance({ name: 'scalpai', storeName: 'modelMetadata' });
const questionnaireRevisionsStore = localforage.createInstance({ name: 'scalpai', storeName: 'questionnaireRevisions' });
const BACKUP_FORMAT = 'scalpai-backup';
const BACKUP_VERSION = 2;
const trainingPoolSaveLocks = new Set<string>();

const defaultSettings: Settings = {
  language: 'fa',
  theme: 'mint',
  aiConfidenceThreshold: DEFAULT_AI_CONFIDENCE_THRESHOLD,
};

async function getAllFromStore<T>(store: LocalForage): Promise<T[]> {
  const items: T[] = [];
  await store.iterate<T, void>((value) => { items.push(value); });
  return items;
}

/**
 * تضمین idempotent وجود ردیف مشتری سیستمی (استخر آموزشی) در clientsStore.
 * صدا زدن مکرر بی‌ضرر است — فقط اگر ردیف نبود آن را می‌سازد.
 */
async function ensureSystemTrainingPoolClient(): Promise<void> {
  const existing = await clientsStore.getItem<Client>(SYSTEM_TRAINING_POOL_CLIENT_ID);
  if (existing) return;
  await clientsStore.setItem(SYSTEM_TRAINING_POOL_CLIENT_ID, buildSystemTrainingPoolClientRecord());
}

function sanitizeSettingsForBackup(settings: Settings): Partial<Settings> {
  const result = { ...settings };
  delete result.password;
  delete result.passwordHash;
  delete result.hasPassword;
  delete result.hasApiKey;
  delete result.aiApiKey;
  return result;
}

function parseBackupPayload(jsonData: string): Record<string, unknown> {
  const parsed = parseStoredJson<Record<string, unknown> | null>(jsonData, null);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup data');
  const data = (parsed as { format?: string; data?: Record<string, unknown> }).format === BACKUP_FORMAT
    ? (parsed as { data: Record<string, unknown> }).data
    : parsed;
  if (!data || typeof data !== 'object') throw new Error('Invalid backup data');
  for (const key of ['clients', 'gallery', 'sessions', 'trichologists', 'analyses']) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      throw new Error(`Invalid backup field: ${key}`);
    }
  }
  if (data.trainingSamples !== undefined && !Array.isArray(data.trainingSamples)) {
    throw new Error('Invalid backup field: trainingSamples');
  }
  if (data.questionnaireRevisions !== undefined && !Array.isArray(data.questionnaireRevisions)) {
    throw new Error('Invalid backup field: questionnaireRevisions');
  }
  return data;
}

export const webAdapter: DatabaseAdapter = {
  async init() {
    const settings = await settingsStore.getItem<Settings>('settings');
    if (!settings) {
      await settingsStore.setItem('settings', defaultSettings);
    }
    // Idempotent — تضمین می‌کند کلاینت سیستمی (استخر آموزشی) همیشه موجود باشد
    await ensureSystemTrainingPoolClient();
  },

  async getClients(params) {
    const all = await getAllFromStore<Client>(clientsStore);
    // ردیف مشتری سیستمی (استخر آموزشی) هرگز در فهرست مشتریان واقعی دیده نمی‌شود
    const realClients = all.filter(c => !c.isSystemRecord);
    const search = (params?.search || '').trim().toLowerCase();
    const filtered = search
      ? realClients.filter(c =>
          (c.firstName || '').toLowerCase().includes(search) ||
          (c.lastName || '').toLowerCase().includes(search) ||
          (c.phone || '').toLowerCase().includes(search)
        )
      : realClients;
    const sorted = filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = params?.offset || 0;
    const limit = params?.limit;
    return limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
  },

  async getClientsCount(search?: string) {
    const all = await getAllFromStore<Client>(clientsStore);
    const realClients = all.filter(c => !c.isSystemRecord);
    const term = (search || '').trim().toLowerCase();
    if (!term) return realClients.length;
    return realClients.filter(c =>
      (c.firstName || '').toLowerCase().includes(term) ||
      (c.lastName || '').toLowerCase().includes(term) ||
      (c.phone || '').toLowerCase().includes(term)
    ).length;
  },

  async getClient(id) {
    return clientsStore.getItem<Client>(id);
  },

  async createClient(data) {
    const client: Client = { ...data, id: generateId(), createdAt: now(), updatedAt: now() };
    await clientsStore.setItem(client.id, client);
    return client;
  },

  async updateClient(id, patch) {
    const client = await clientsStore.getItem<Client>(id);
    if (!client) throw new Error('Client not found');
    const updated = { ...client, ...patch, updatedAt: now() };
    await clientsStore.setItem(id, updated);
    return updated;
  },

  async deleteClient(id) {
    // کلاینت سیستمی (استخر آموزشی) هرگز از این مسیر حذف نمی‌شود
    if (id === SYSTEM_TRAINING_POOL_CLIENT_ID) {
      throw new Error('System training-pool client cannot be deleted');
    }
    // قرارداد دامنه: CLIENT_DELETE_CASCADE در cascadeRules.ts
    // مطابق نسخهٔ SQLite: همهٔ داده‌های وابسته (گالری، جلسات، تحلیل‌ها، نمونه‌های آموزشی) هم حذف
    // می‌شوند تا رکورد یتیم با clientId بلااستفاده باقی نماند.
    const gallery = await this.getGalleryByClient(id);
    for (const item of gallery) await galleryStore.removeItem(item.id);
    const sessions = await this.getSessionsByClient(id);
    for (const session of sessions) await sessionsStore.removeItem(session.id);
    const analyses = await this.getAnalysesByClient(id);
    for (const analysis of analyses) await analysesStore.removeItem(analysis.id);
    const questionnaireRevisions = await this.getQuestionnaireRevisionsByClient(id);
    for (const revision of questionnaireRevisions) await questionnaireRevisionsStore.removeItem(revision.id);
    const trainingSamples = await this.getTrainingSamples();
    for (const sample of trainingSamples) {
      if (sample.clientId === id) await trainingSamplesStore.removeItem(sample.id);
    }
    // خود مشتری در آخر حذف می‌شود تا اگر وسط کار خطا رخ داد، عملیات قابل تکرار باشد
    await clientsStore.removeItem(id);
  },

  async getGalleryByClient(clientId, params) {
    const all = await getAllFromStore<GalleryItem>(galleryStore);
    const filtered = all
      .filter(item => item.clientId === clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = params?.offset || 0;
    const limit = params?.limit;
    return limit ? filtered.slice(offset, offset + limit) : filtered.slice(offset);
  },

  async getAllGallery(params) {
    const all = await getAllFromStore<GalleryItem>(galleryStore);
    // گالری کلاینت سیستمی (استخر آموزشی) از گالری عمومی/همه‌مشتریان مستثناست
    const sorted = all
      .filter(item => item.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = params?.offset || 0;
    const limit = params?.limit;
    return limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
  },

  async getGalleryCount(clientId) {
    const all = await getAllFromStore<GalleryItem>(galleryStore);
    if (clientId) return all.filter(item => item.clientId === clientId).length;
    return all.filter(item => item.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID).length;
  },

  async getGalleryPage(params = {}) {
    const all = await getAllFromStore<GalleryItem>(galleryStore);
    const clients = await getAllFromStore<Client>(clientsStore);
    const byId = new Map(clients.map(client => [client.id, client]));
    let items = all.filter(item => item.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID);
    if (params.clientId) items = items.filter(item => item.clientId === params.clientId);
    if (params.type) items = items.filter(item => item.type === params.type);
    if (params.search) { const q = params.search.toLowerCase(); items = items.filter(item => { const c = byId.get(item.clientId); return c && `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(q); }); }
    if (params.startDate) items = items.filter(item => item.createdAt >= params.startDate!);
    if (params.endDate) items = items.filter(item => item.createdAt <= params.endDate!);
    if (params.regionId) items = items.filter(item => item.metadata?.scalpRegion === params.regionId);
    if (params.trichoscopeMode) items = items.filter(item => item.metadata?.trichoscopeMode === params.trichoscopeMode);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = params.offset || 0;
    return params.limit == null ? items.slice(offset) : items.slice(offset, offset + params.limit);
  },

  async getGalleryPageCount(params = {}) {
    return (await this.getGalleryPage({ ...params })).length;
  },

  async getTrainingPoolItems(params) {
    const all = await getAllFromStore<GalleryItem>(galleryStore);
    let items = all.filter(item => item.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID && (params.status === 'completed' ? item.trainingPoolStatus === 'completed' : (!item.trainingPoolStatus || item.trainingPoolStatus === 'active')));
    if (params.startDate) items = items.filter(item => item.createdAt >= params.startDate!);
    if (params.endDate) items = items.filter(item => item.createdAt <= params.endDate!);
    if (params.regionId) items = items.filter(item => item.metadata?.scalpRegion === params.regionId);
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = params.offset || 0;
    return params.limit == null ? items.slice(offset) : items.slice(offset, offset + params.limit);
  },

  async getTrainingPoolItemsCount(params) {
    return (await this.getTrainingPoolItems({ ...params })).length;
  },

  async updateTrainingPoolItemStatus(id, status) {
    const item = await galleryStore.getItem<GalleryItem>(id);
    if (!item || item.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID) throw new Error('Training pool item not found');
    await galleryStore.setItem(id, { ...item, trainingPoolStatus: status });
  },

  async getGalleryItemDataUrl(id) {
    // در وب محتوای کامل همیشه داخل خود رکورد (IndexedDB) است
    const item = await galleryStore.getItem<GalleryItem>(id);
    return item?.url ?? null;
  },

  async addGalleryItem(clientId, item) {
    const galleryItem: GalleryItem = { ...item, id: generateId(), clientId, trainingPoolStatus: clientId === SYSTEM_TRAINING_POOL_CLIENT_ID ? (item.trainingPoolStatus || 'active') : undefined, createdAt: now() };
    await galleryStore.setItem(galleryItem.id, galleryItem);
    return galleryItem;
  },

  async deleteGalleryItem(id) {
    await galleryStore.removeItem(id);
  },

  async getSessions(params) {
    const all = await getAllFromStore<Session>(sessionsStore);
    const sorted = all.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const offset = params?.offset || 0;
    const limit = params?.limit;
    return limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
  },

  async getSessionsCount() {
    return (await getAllFromStore<Session>(sessionsStore)).length;
  },

  async getSessionsByClient(clientId) {
    const all = await getAllFromStore<Session>(sessionsStore);
    return all
      .filter(s => s.clientId === clientId)
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  async createSession(data) {
    const session: Session = { ...data, id: generateId(), createdAt: now() };
    await sessionsStore.setItem(session.id, session);
    return session;
  },

  async updateSession(id, patch) {
    const session = await sessionsStore.getItem<Session>(id);
    if (!session) throw new Error('Session not found');
    const updated = { ...session, ...patch };
    await sessionsStore.setItem(id, updated);
    return updated;
  },

  async deleteSession(id) {
    // پرسشنامهٔ آن مراجعه بدون نوبت بی‌معناست — همراه نوبت حذف می‌شود
    const all = await getAllFromStore<QuestionnaireRevision>(questionnaireRevisionsStore);
    for (const revision of all) {
      if (revision.sessionId === id) await questionnaireRevisionsStore.removeItem(revision.id);
    }
    await sessionsStore.removeItem(id);
  },

  async getQuestionnaireRevisionsByClient(clientId) {
    const all = await getAllFromStore<QuestionnaireRevision>(questionnaireRevisionsStore);
    return all
      .filter(revision => revision.clientId === clientId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getQuestionnaireRevision(clientId, sessionId) {
    const all = await getAllFromStore<QuestionnaireRevision>(questionnaireRevisionsStore);
    return all.find(revision => revision.clientId === clientId && revision.sessionId === sessionId) ?? null;
  },

  async getPreviousFinalQuestionnaireRevision(clientId, excludeSessionId) {
    const all = await getAllFromStore<QuestionnaireRevision>(questionnaireRevisionsStore);
    return all
      .filter(revision =>
        revision.clientId === clientId &&
        revision.status === 'final' &&
        (!excludeSessionId || revision.sessionId !== excludeSessionId)
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
  },

  async saveQuestionnaireRevision(input) {
    const existing = await this.getQuestionnaireRevision(input.clientId, input.sessionId);
    if (existing) {
      const updated: QuestionnaireRevision = {
        ...existing,
        values: input.values,
        status: input.status ?? existing.status,
        changedFields: input.changedFields !== undefined
          ? input.changedFields
          : (existing.changedFields || []),
        updatedAt: now(),
      };
      await questionnaireRevisionsStore.setItem(updated.id, updated);
      return updated;
    }
    const revision: QuestionnaireRevision = {
      id: generateId(),
      clientId: input.clientId,
      sessionId: input.sessionId,
      status: input.status ?? 'draft',
      values: input.values,
      changedFields: input.changedFields ?? [],
      createdAt: now(),
      updatedAt: now(),
    };
    await questionnaireRevisionsStore.setItem(revision.id, revision);
    return revision;
  },

  async getTrichologists() {
    return getAllFromStore<Trichologist>(trichologistsStore);
  },

  async createTrichologist(data) {
    const trichologist: Trichologist = { ...data, id: generateId() };
    await trichologistsStore.setItem(trichologist.id, trichologist);
    return trichologist;
  },

  async updateTrichologist(id, patch) {
    const item = await trichologistsStore.getItem<Trichologist>(id);
    if (!item) throw new Error('Trichologist not found');
    const updated = { ...item, ...patch };
    await trichologistsStore.setItem(id, updated);
    return updated;
  },

  async deleteTrichologist(id) {
    await trichologistsStore.removeItem(id);
  },

  async getAnalyses(params) {
    const all = await getAllFromStore<Analysis>(analysesStore);
    const sorted = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const offset = params?.offset || 0;
    const limit = params?.limit;
    return limit ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
  },

  async getAnalysesCount() {
    return (await getAllFromStore<Analysis>(analysesStore)).length;
  },

  async getAnalysesByClient(clientId) {
    const all = await getAllFromStore<Analysis>(analysesStore);
    return all
      .filter(a => a.clientId === clientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // در وب داده همین‌جاست و از IPC رد نمی‌شود، پس چیزی strip نشده؛
  // این متد فقط برای یکسان بودن قرارداد با نسخهٔ Electron وجود دارد.
  async getAnalysisAnnotatedImage(id: string) {
    const analysis = await analysesStore.getItem<Analysis>(id);
    if (!analysis) return null;
    return (
      analysis.aiResults?.annotatedImageBase64 ||
      analysis.offlineResults?.annotatedImageBase64 ||
      null
    );
  },

  async createAnalysis(data) {
    const analysis: Analysis = { ...data, id: generateId(), createdAt: now(), updatedAt: now() };
    await analysesStore.setItem(analysis.id, analysis);
    return analysis;
  },

  async updateAnalysis(id, patch) {
    const item = await analysesStore.getItem<Analysis>(id);
    if (!item) throw new Error('Analysis not found');
    const updated = { ...item, ...patch, updatedAt: now() };
    await analysesStore.setItem(id, updated);
    return updated;
  },

  async deleteAnalysis(id) {
    await analysesStore.removeItem(id);
  },

  async getSettings() {
    const settings = await settingsStore.getItem<Settings & { passwordHash?: string }>('settings');
    const raw = settings || defaultSettings;
    return stripPasswordFromSettings(raw) as Settings;
  },

  async updateSettings(patch) {
    const current = await settingsStore.getItem<Settings & { passwordHash?: string }>('settings');
    const merged = { ...(current || defaultSettings), ...patch };

    if (patch.password) {
      if (String(patch.password).length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      merged.passwordHash = await hashPassword(patch.password);
      delete merged.password;
    }

    await settingsStore.setItem('settings', merged);
    return stripPasswordFromSettings(merged) as Settings;
  },

  async verifyCredentials(username, password) {
    const settings = await settingsStore.getItem<Settings & { passwordHash?: string; password?: string }>('settings');
    if (!settings?.username || username !== settings.username) return false;
    const stored = settings.passwordHash || settings.password;
    if (!stored) return false;
    if (await verifyPassword(password, stored)) return true;
    // مهاجرت یک‌بارهٔ پسورد متن‌ساده → pbkdf2
    if (isLegacyPlaintextPassword(stored) && verifyLegacyPlaintextPassword(password, stored)) {
      settings.passwordHash = await hashPassword(password);
      delete settings.password;
      await settingsStore.setItem('settings', settings);
      return true;
    }
    return false;
  },

  async hasCredentials() {
    const settings = await settingsStore.getItem<Settings & { passwordHash?: string; password?: string }>('settings');
    return !!(settings?.username && (settings.passwordHash || settings.password));
  },

  async exportData() {
    const settings = await this.getSettings();
    // توجه: از getAllFromStore خام (نه this.getClients()/this.getAllGallery()) استفاده
    // می‌شود تا کلاینت سیستمی و گالری/نمونه‌های آموزشی وابسته هم در بکاپ کامل باشند —
    // درست مثل db-handlers.cjs (SQLite) که فیلتری روی exportData اعمال نمی‌کند.
    const data = {
      clients: await getAllFromStore<Client>(clientsStore),
      gallery: await getAllFromStore<GalleryItem>(galleryStore),
      sessions: await this.getSessions(),
      trichologists: await this.getTrichologists(),
      analyses: await this.getAnalyses(),
      settings: sanitizeSettingsForBackup(settings),
      trainingSamples: await this.getTrainingSamples(),
      localModelMetadata: await this.getModelMetadata(),
      questionnaireRevisions: await getAllFromStore<QuestionnaireRevision>(questionnaireRevisionsStore),
    };
    return JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: now(),
      data,
    }, null, 2);
  },

  async importData(jsonData) {
    const data = parseBackupPayload(jsonData);
    const previous = {
      clients: await getAllFromStore<Client>(clientsStore),
      gallery: await getAllFromStore<GalleryItem>(galleryStore),
      sessions: await getAllFromStore<Session>(sessionsStore),
      trichologists: await getAllFromStore<Trichologist>(trichologistsStore),
      analyses: await getAllFromStore<Analysis>(analysesStore),
      trainingSamples: await this.getTrainingSamples(),
      localModelMetadata: await this.getModelMetadata(),
      questionnaireRevisions: await getAllFromStore<QuestionnaireRevision>(questionnaireRevisionsStore),
      settings: await settingsStore.getItem<Settings & { passwordHash?: string; password?: string }>('settings'),
    };

    const restoreStore = async <T extends { id: string }>(store: LocalForage, values: T[]) => {
      await store.clear();
      for (const value of values) await store.setItem(value.id, value);
    };
    interface BackupData {
      clients?: Client[];
      gallery?: GalleryItem[];
      sessions?: Session[];
      trichologists?: Trichologist[];
      analyses?: Analysis[];
      trainingSamples?: TrainingSample[];
      localModelMetadata?: LocalModelMetadata | null;
      questionnaireRevisions?: QuestionnaireRevision[];
      settings?: (Settings & { passwordHash?: string; password?: string }) | null;
    }
    const applyData = async (source: BackupData, preserveSecrets: boolean) => {
      await restoreStore(clientsStore, source.clients || []);
      await restoreStore(galleryStore, source.gallery || []);
      await restoreStore(sessionsStore, source.sessions || []);
      await restoreStore(trichologistsStore, source.trichologists || []);
      await restoreStore(analysesStore, source.analyses || []);
      await restoreStore(trainingSamplesStore, source.trainingSamples || []);
      await restoreStore(questionnaireRevisionsStore, source.questionnaireRevisions || []);

      if (source.localModelMetadata) await modelMetadataStore.setItem('metadata', source.localModelMetadata);
      else await modelMetadataStore.removeItem('metadata');

      const currentSettings = previous.settings || defaultSettings;
      const importedSettings = sanitizeSettingsForBackup((source.settings || {}) as Settings);
      await settingsStore.setItem('settings', preserveSecrets ? {
        ...currentSettings,
        ...importedSettings,
        password: currentSettings.password,
        passwordHash: currentSettings.passwordHash,
        aiApiKey: currentSettings.aiApiKey,
      } : source.settings);
    };

    try {
      await applyData(data as BackupData, true);
    } catch (error) {
      await applyData(previous, false);
      throw error;
    } finally {
      // بکاپ ممکن است از نسخهٔ قدیمی‌تر (بدون ردیف سیستمی) باشد؛ restoreStore
      // کل clientsStore را جایگزین می‌کند، پس این ردیف باید دوباره تضمین شود —
      // چه بازیابی موفق شده باشد چه به حالت قبلی برگردیم.
      await ensureSystemTrainingPoolClient();
    }
  },

  async getTrainingSamples() {
    const all = await getAllFromStore<import('./types').TrainingSample>(trainingSamplesStore);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async saveTrainingSampleAndCompletePoolItem(data) {
    if (!data.galleryItemId || data.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID) throw new Error('A system training-pool gallery item is required');
    if (trainingPoolSaveLocks.has(data.galleryItemId)) throw new Error('This training-pool item is already being saved');
    trainingPoolSaveLocks.add(data.galleryItemId);
    try {
    const existingSamples = await getAllFromStore<TrainingSample>(trainingSamplesStore);
    if (existingSamples.some(sample => sample.galleryItemId === data.galleryItemId)) throw new Error('A training sample already exists for this gallery item');
    const item = await galleryStore.getItem<GalleryItem>(data.galleryItemId);
    if (!item || item.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID || (item.trainingPoolStatus && item.trainingPoolStatus !== 'active')) throw new Error('Training pool item not found or already completed');
    const sample: import('./types').TrainingSample = {
      ...data,
      id: generateId(),
      createdAt: now(),
      usedInTraining: false,
      approvedForTraining: data.approvedForTraining ?? data.labelSource === 'expert',
    };
    await trainingSamplesStore.setItem(sample.id, sample);
    try {
      await galleryStore.setItem(item.id, { ...item, trainingPoolStatus: 'completed' });
    } catch (error) {
      await trainingSamplesStore.removeItem(sample.id);
      throw error;
    }
    return sample;
    } finally {
      trainingPoolSaveLocks.delete(data.galleryItemId);
    }
  },

  async addTrainingSample(data) {
    const sample: import('./types').TrainingSample = {
      ...data,
      id: generateId(),
      createdAt: now(),
      usedInTraining: false,
      approvedForTraining: data.approvedForTraining ?? data.labelSource === 'expert',
    };
    await trainingSamplesStore.setItem(sample.id, sample);
    return sample;
  },

  async updateTrainingSample(id, patch) {
    const sample = await trainingSamplesStore.getItem<import('./types').TrainingSample>(id);
    if (!sample) throw new Error('Sample not found');
    // فاز ۳٫۱ — baseline پاسخ اولیهٔ AI فقط یک‌بار نوشته می‌شود
    // (هم‌رفتار با مسیرهای sqlite و json).
    let originalAiLabel = sample.originalAiLabel;
    let originalAiLabelAt = sample.originalAiLabelAt;
    if (!originalAiLabel) {
      if (patch.originalAiLabel != null) {
        originalAiLabel = patch.originalAiLabel;
        originalAiLabelAt = patch.originalAiLabelAt || new Date().toISOString();
      } else if (
        patch.labelSource === 'expert'
        && sample.labelSource === 'online_ai'
        && patch.label !== undefined
      ) {
        originalAiLabel = sample.label;
        originalAiLabelAt = new Date().toISOString();
      }
    }
    const next = {
      ...sample,
      ...patch,
      ...(originalAiLabel ? { originalAiLabel, originalAiLabelAt } : {}),
    };
    await trainingSamplesStore.setItem(id, next);
    return next;
  },

  async deleteTrainingSample(id) {
    await trainingSamplesStore.removeItem(id);
  },

  async markTrainingSamplesUsed(ids, modelVersion) {
    for (const id of ids) {
      const sample = await trainingSamplesStore.getItem<import('./types').TrainingSample>(id);
      if (sample) {
        await trainingSamplesStore.setItem(id, { ...sample, usedInTraining: true, modelVersionTrainedWith: modelVersion });
      }
    }
  },

  async getModelMetadata() {
    return (await modelMetadataStore.getItem<import('./types').LocalModelMetadata>('metadata')) ?? null;
  },

  async updateModelMetadata(patch) {
    const existing = (await modelMetadataStore.getItem<import('./types').LocalModelMetadata>('metadata')) ?? ({} as import('./types').LocalModelMetadata);
    const merged = { ...existing, ...patch } as import('./types').LocalModelMetadata;
    await modelMetadataStore.setItem('metadata', merged);
    return merged;
  },

  async clearModelMetadata() {
    await modelMetadataStore.removeItem('metadata');
  },
};
