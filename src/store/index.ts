import { create } from 'zustand';
import { toast } from 'sonner';
import { db, Client, GalleryItem, Session, Trichologist, Analysis, Settings, PaginationParams, TrainingSample, TrainingSampleUpdatePatch, LocalModelMetadata, ImportBackupReport } from '../db';
import type { LocalModelBackupBundle } from '../lib/modelBundle';
import { DEFAULT_AI_CONFIDENCE_THRESHOLD } from '../lib/heuristicConstants';
import { errorMessage, withToastMutation, prependItem, replaceById, removeById } from './mutationHelpers';

const PAGE_SIZE = 20;

/** جلوگیری از اعمال پاسخ‌های کهنهٔ fetch وقتی چند درخواست هم‌پوشان اجرا می‌شوند */
function createFetchGeneration() {
  let gen = 0;
  return {
    next() {
      gen += 1;
      return gen;
    },
    isCurrent(token: number) {
      return token === gen;
    },
  };
}

const clientsFetchGen = createFetchGeneration();
const managedClientsFetchGen = createFetchGeneration();
const galleryFetchGen = createFetchGeneration();
const sessionsFetchGen = createFetchGeneration();
const analysesFetchGen = createFetchGeneration();
const trichologistsFetchGen = createFetchGeneration();
const samplesFetchGen = createFetchGeneration();
const settingsFetchGen = createFetchGeneration();

/** session idهایی که تاریخ خالی‌شان یک‌بار به DB نوشته شده تا هر fetch دوباره write نکند */
const persistedMissingSessionDates = new Set<string>();

function sessionDateFromCreatedAt(createdAt: string): string {
  const d = new Date(createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// =============== Clients Store ===============
// نکتهٔ معماری: دو مجموعه دادهٔ جدا برای دو مصرف متفاوت نگه می‌داریم:
//  - `clients` : لیست کامل مشتری‌ها (بدون سقف ۲۰ تایی) — برای انتخابگرهای مشتری
//    در صفحات گالری/جلسات/تحلیل هوش‌مصنوعی/تحلیل آفلاین/تحلیل متخصص/داشبورد،
//    که باید بتوانند هر مشتری‌ای را (نه فقط ۲۰ تای اول) پیدا و انتخاب کنند.
//  - `managedClients` + صفحه‌بندی واقعی (page/pageSize/total/search) — مخصوص
//    صفحهٔ «مشتریان» (مدیریت/فهرست) که قرار است صفحه‌به‌صفحه نمایش داده شود.
interface ClientsState {
  clients: Client[];
  loading: boolean;
  error: string | null;

  managedClients: Client[];
  managedLoading: boolean;
  managedTotal: number;
  managedPage: number;
  managedPageSize: number;
  managedSearch: string;

  fetchClients: () => Promise<void>;
  fetchManagedClients: (page?: number, search?: string) => Promise<void>;
  setManagedSearch: (search: string) => void;
  goToManagedPage: (page: number) => Promise<void>;

  addClient: (data: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Client>;
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
}

export const useClientsStore = create<ClientsState>((set, get) => ({
  clients: [],
  loading: false,
  error: null,

  managedClients: [],
  managedLoading: false,
  managedTotal: 0,
  managedPage: 1,
  managedPageSize: PAGE_SIZE,
  managedSearch: '',

  // لیست کامل مشتری‌ها، بدون هیچ سقفی — برای انتخابگرهای مشتری در صفحات دیگر.
  fetchClients: async () => {
    const token = clientsFetchGen.next();
    set({ loading: true, error: null });
    try {
      const clients = await db.getClients();
      if (!clientsFetchGen.isCurrent(token)) return;
      set({ clients: Array.isArray(clients) ? clients : [], loading: false });
    } catch (err) {
      if (!clientsFetchGen.isCurrent(token)) return;
      const message = errorMessage(err);
      set({ error: message, loading: false });
      toast.error(`خطا در بارگذاری مشتریان: ${message}`);
    }
  },

  // صفحه‌بندی واقعی مخصوص صفحهٔ «مشتریان». جستجو هم سمت دیتابیس انجام می‌شود
  // (نه فقط روی همان صفحهٔ بارگذاری‌شده)، وگرنه جستجوی مشتری‌ای که در صفحات
  // بعدی است چیزی پیدا نمی‌کرد.
  fetchManagedClients: async (page = get().managedPage, search = get().managedSearch) => {
    const token = managedClientsFetchGen.next();
    set({ managedLoading: true, error: null });
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * PAGE_SIZE;
    const params: PaginationParams = { limit: PAGE_SIZE, offset, search: search || undefined };

    try {
      const result = await db.getClients(params);
      const managedClients = Array.isArray(result) ? result : [];
      const managedTotal = await db.getClientsCount(search || undefined);
      if (!managedClientsFetchGen.isCurrent(token)) return;
      const maxPage = Math.max(1, Math.ceil(managedTotal / PAGE_SIZE));

      // اگر صفحهٔ درخواستی دیگر معتبر نیست (مثلاً بعد از حذف آخرین آیتم صفحهٔ آخر)،
      // به آخرین صفحهٔ معتبر برمی‌گردیم.
      if (managedClients.length === 0 && safePage > maxPage) {
        set({ managedLoading: false });
        return get().fetchManagedClients(maxPage, search);
      }

      set({ managedClients, managedTotal, managedPage: safePage, managedSearch: search, managedLoading: false });
    } catch (err) {
      if (!managedClientsFetchGen.isCurrent(token)) return;
      const message = errorMessage(err);
      set({ error: message, managedLoading: false });
      toast.error(`خطا در بارگذاری مشتریان: ${message}`);
    }
  },

  setManagedSearch: (search) => {
    // با تغییر عبارت جستجو، همیشه به صفحهٔ اول برمی‌گردیم
    get().fetchManagedClients(1, search);
  },

  goToManagedPage: async (page) => {
    await get().fetchManagedClients(page, get().managedSearch);
  },

  addClient: async (data) => {
    try {
      const client = await db.createClient(data);
      set({ clients: [client, ...get().clients] });
      // مشتری جدید همیشه ابتدای لیست قرار می‌گیرد (createdAt DESC)، پس صفحهٔ اول
      // فهرست مدیریت را هم دوباره می‌خوانیم تا هم دیده شود و هم شمارش درست بماند.
      await get().fetchManagedClients(1, get().managedSearch);
      return client;
    } catch (err) {
      const message = errorMessage(err);
      toast.error(`ذخیره مشتری ناموفق بود: ${message}`);
      throw err;
    }
  },

  updateClient: async (id, patch) => {
    try {
      const updated = await db.updateClient(id, patch);
      set({
        clients: get().clients.map(c => c.id === id ? updated : c),
        managedClients: get().managedClients.map(c => c.id === id ? updated : c),
      });
    } catch (err) {
      const message = errorMessage(err);
      toast.error(`ویرایش مشتری ناموفق بود: ${message}`);
      throw err;
    }
  },

  deleteClient: async (id) => {
    try {
      await db.deleteClient(id);
      set({ clients: get().clients.filter(c => c.id !== id) });
      // دیتابیس داده‌های وابسته (جلسات/تحلیل‌ها/گالری) را cascade حذف کرده؛
      // state سایر storeها را هم هم‌گام می‌کنیم تا رکوردهای حذف‌شده تا
      // بارگذاری بعدی روی صفحه‌های دیگر باقی نمانند.
      useSessionsStore.setState(state => ({ sessions: state.sessions.filter(s => s.clientId !== id) }));
      useAnalysesStore.setState(state => ({ analyses: state.analyses.filter(a => a.clientId !== id) }));
      useGalleryStore.setState(state => ({ items: state.items.filter(i => i.clientId !== id) }));
      useTrainingSamplesStore.setState(state => ({
        samples: state.samples.filter(s => s.clientId !== id),
      }));
      // صفحهٔ فعلی فهرست مدیریت را دوباره می‌خوانیم تا آیتم بعدی جای خالی را پر کند
      // و صفحه‌بندی درست بماند.
      await get().fetchManagedClients(get().managedPage, get().managedSearch);
    } catch (err) {
      const message = errorMessage(err);
      toast.error(`حذف مشتری ناموفق بود: ${message}`);
      throw err;
    }
  },
}));

// =============== Gallery Store with Pagination ===============
interface GalleryState {
  items: GalleryItem[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  currentClientId: string | null;
  /** بارگذاری یک صفحهٔ مشخص — دیگر آیتم‌ها را روی هم انباشته نمی‌کند */
  fetchPage: (page?: number) => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  /** سازگاری با داشبورد و فراخوانی‌های قدیمی */
  fetchAll: (reset?: boolean) => Promise<void>;
  fetchByClient: (clientId: string, params?: PaginationParams) => Promise<GalleryItem[]>;
  addItem: (
    clientId: string,
    item: Omit<GalleryItem, 'id' | 'createdAt'>,
    skipGlobalRefresh?: boolean,
  ) => Promise<GalleryItem>;
  deleteItem: (id: string) => Promise<void>;
}

export const useGalleryStore = create<GalleryState>((set, get) => ({
  items: [],
  loading: false,
  total: 0,
  page: 1,
  pageSize: PAGE_SIZE,
  currentClientId: null,

  fetchPage: async (page = get().page) => {
    const token = galleryFetchGen.next();
    set({ loading: true, currentClientId: null });
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * PAGE_SIZE;
    const params: PaginationParams = { limit: PAGE_SIZE, offset };

    try {
      const result = await db.getAllGallery(params);
      const items = Array.isArray(result) ? result : [];
      const total = await db.getGalleryCount();
      if (!galleryFetchGen.isCurrent(token)) return;
      const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (items.length === 0 && safePage > maxPage) {
        set({ loading: false });
        return get().fetchPage(maxPage);
      }

      set({
        items,
        total,
        page: safePage,
        pageSize: PAGE_SIZE,
        loading: false,
      });
    } catch (err) {
      if (!galleryFetchGen.isCurrent(token)) return;
      toast.error(`خطا در بارگذاری گالری: ${errorMessage(err)}`);
      set({ loading: false });
    }
  },

  goToPage: async (page) => {
    await get().fetchPage(page);
  },

  fetchAll: async (_reset = true) => {
    await get().fetchPage(1);
  },

  fetchByClient: async (clientId, params) => {
    set({ currentClientId: clientId });
    try {
      return await db.getGalleryByClient(clientId, params);
    } catch (err) {
      toast.error(`خطا در بارگذاری گالری مشتری: ${errorMessage(err)}`);
      return [];
    }
  },

  addItem: async (clientId, item, skipGlobalRefresh) => {
    try {
      const newItem = await db.addGalleryItem(clientId, item);
      // آپلود در استخر تصاویر آموزشی (کلاینت سیستمی) نباید صفحهٔ گالری عمومی
      // (items/total/page سراسری) را رفرش/ریست کند — وگرنه اگر گالری اصلی
      // باز باشد، بی‌دلیل به صفحهٔ ۱ برمی‌گردد و یک کوئری اضافه می‌زند.
      if (!skipGlobalRefresh) {
        await get().fetchPage(1);
      }
      return newItem;
    } catch (err) {
      toast.error(`ذخیره تصویر ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  deleteItem: async (id) => {
    try {
      await db.deleteGalleryItem(id);
      const { page, items } = get();
      if (items.length <= 1 && page > 1) {
        await get().fetchPage(page - 1);
      } else {
        await get().fetchPage(page);
      }
    } catch (err) {
      toast.error(`حذف تصویر ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },
}));

// =============== Sessions Store ===============
interface SessionsState {
  sessions: Session[];
  loading: boolean;
  fetchSessions: () => Promise<void>;
  addSession: (data: Omit<Session, 'id' | 'createdAt'>) => Promise<Session>;
  updateSession: (id: string, patch: Partial<Session>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  loading: false,

  fetchSessions: async () => {
    const token = sessionsFetchGen.next();
    set({ loading: true });
    try {
      const result = await db.getSessions();
      if (!sessionsFetchGen.isCurrent(token)) return;
      let sessions = Array.isArray(result) ? result : [];

      // جلسات بدون تاریخ: در حافظه پر می‌شود؛ نوشتن به DB فقط یک‌بار برای هر id
      const needPersist = sessions.filter(
        s => !s.date?.trim() && s.createdAt && !persistedMissingSessionDates.has(s.id),
      );
      for (const s of needPersist) {
        const date = sessionDateFromCreatedAt(s.createdAt);
        persistedMissingSessionDates.add(s.id);
        void db.updateSession(s.id, { date }).catch(() => {
          persistedMissingSessionDates.delete(s.id);
        });
      }

      sessions = sessions.map(s => {
        if (s.date?.trim()) return s;
        if (!s.createdAt) return s;
        return { ...s, date: sessionDateFromCreatedAt(s.createdAt) };
      });

      if (!sessionsFetchGen.isCurrent(token)) return;
      set({ sessions });
    } catch (err) {
      if (!sessionsFetchGen.isCurrent(token)) return;
      toast.error(`خطا در بارگذاری جلسات: ${errorMessage(err)}`);
    } finally {
      if (sessionsFetchGen.isCurrent(token)) set({ loading: false });
    }
  },

  addSession: async (data) => {
    return withToastMutation('ذخیره جلسه ناموفق بود', async () => {
      const payload = { ...data };
      if (!payload.date?.trim()) {
        const d = new Date();
        payload.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      const session = await db.createSession(payload);
      set({ sessions: prependItem(get().sessions, session) });
      return session;
    });
  },

  updateSession: async (id, patch) => {
    await withToastMutation('ویرایش جلسه ناموفق بود', async () => {
      const updated = await db.updateSession(id, patch);
      set({ sessions: replaceById(get().sessions, id, updated) });
    });
  },

  deleteSession: async (id) => {
    await withToastMutation('حذف جلسه ناموفق بود', async () => {
      await db.deleteSession(id);
      set({ sessions: removeById(get().sessions, id) });
    });
  },
}));

// =============== Trichologists Store ===============
interface TrichologistsState {
  trichologists: Trichologist[];
  loading: boolean;
  fetchTrichologists: () => Promise<void>;
  addTrichologist: (data: Omit<Trichologist, 'id'>) => Promise<Trichologist>;
  updateTrichologist: (id: string, patch: Partial<Trichologist>) => Promise<void>;
  deleteTrichologist: (id: string) => Promise<void>;
}

export const useTrichologistsStore = create<TrichologistsState>((set, get) => ({
  trichologists: [],
  loading: false,

  fetchTrichologists: async () => {
    const token = trichologistsFetchGen.next();
    set({ loading: true });
    try {
      const result = await db.getTrichologists();
      if (!trichologistsFetchGen.isCurrent(token)) return;
      const trichologists = Array.isArray(result) ? result : [];
      set({ trichologists });
    } catch (err) {
      if (!trichologistsFetchGen.isCurrent(token)) return;
      toast.error(`خطا در بارگذاری متخصصان: ${errorMessage(err)}`);
    } finally {
      if (trichologistsFetchGen.isCurrent(token)) set({ loading: false });
    }
  },

  addTrichologist: async (data) => {
    try {
      const trichologist = await db.createTrichologist(data);
      set({ trichologists: [...get().trichologists, trichologist] });
      return trichologist;
    } catch (err) {
      toast.error(`ذخیره متخصص ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  updateTrichologist: async (id, patch) => {
    try {
      const updated = await db.updateTrichologist(id, patch);
      set({ trichologists: get().trichologists.map(t => t.id === id ? updated : t) });
    } catch (err) {
      toast.error(`ویرایش متخصص ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  deleteTrichologist: async (id) => {
    try {
      await db.deleteTrichologist(id);
      set({ trichologists: get().trichologists.filter(t => t.id !== id) });
    } catch (err) {
      toast.error(`حذف متخصص ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },
}));

// =============== Analyses Store ===============
interface AnalysesState {
  analyses: Analysis[];
  loading: boolean;
  fetchAnalyses: () => Promise<void>;
  addAnalysis: (data: Omit<Analysis, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Analysis>;
  updateAnalysis: (id: string, patch: Partial<Analysis>) => Promise<void>;
  deleteAnalysis: (id: string) => Promise<void>;
}

export const useAnalysesStore = create<AnalysesState>((set, get) => ({
  analyses: [],
  loading: false,

  fetchAnalyses: async () => {
    const token = analysesFetchGen.next();
    set({ loading: true });
    try {
      const result = await db.getAnalyses();
      if (!analysesFetchGen.isCurrent(token)) return;
      const analyses = Array.isArray(result) ? result : [];
      set({ analyses });
    } catch (err) {
      if (!analysesFetchGen.isCurrent(token)) return;
      toast.error(`خطا در بارگذاری تحلیل‌ها: ${errorMessage(err)}`);
    } finally {
      if (analysesFetchGen.isCurrent(token)) set({ loading: false });
    }
  },

  addAnalysis: async (data) => {
    return withToastMutation('ذخیره تحلیل ناموفق بود', async () => {
      const analysis = await db.createAnalysis(data);
      set({ analyses: prependItem(get().analyses, analysis) });
      return analysis;
    });
  },

  updateAnalysis: async (id, patch) => {
    await withToastMutation('ویرایش تحلیل ناموفق بود', async () => {
      const updated = await db.updateAnalysis(id, patch);
      set({ analyses: replaceById(get().analyses, id, updated) });
    });
  },

  deleteAnalysis: async (id) => {
    await withToastMutation('حذف تحلیل ناموفق بود', async () => {
      await db.deleteAnalysis(id);
      set({ analyses: removeById(get().analyses, id) });
    });
  },
}));

// =============== Training Samples Store (یادگیری ماشین محلی) ===============
interface TrainingSamplesState {
  samples: TrainingSample[];
  modelMetadata: LocalModelMetadata | null;
  loading: boolean;
  fetchSamples: () => Promise<void>;
  addSample: (data: Omit<TrainingSample, 'id' | 'createdAt' | 'usedInTraining'>) => Promise<TrainingSample>;
  saveSampleAndCompletePoolItem: (data: Omit<TrainingSample, 'id' | 'createdAt' | 'usedInTraining'>) => Promise<TrainingSample>;
  updateSample: (id: string, patch: TrainingSampleUpdatePatch) => Promise<void>;
  deleteSample: (id: string) => Promise<void>;
  markSamplesUsed: (ids: string[], modelVersion: number) => Promise<void>;
  fetchModelMetadata: () => Promise<void>;
  saveModelMetadata: (patch: Partial<LocalModelMetadata>) => Promise<void>;
  clearModelMetadata: () => Promise<void>;
}

export const useTrainingSamplesStore = create<TrainingSamplesState>((set, get) => ({
  samples: [],
  modelMetadata: null,
  loading: false,

  fetchSamples: async () => {
    const token = samplesFetchGen.next();
    set({ loading: true });
    try {
      const result = await db.getTrainingSamples();
      if (!samplesFetchGen.isCurrent(token)) return;
      set({ samples: Array.isArray(result) ? result : [] });
    } catch (err) {
      if (!samplesFetchGen.isCurrent(token)) return;
      toast.error(`خطا در بارگذاری نمونه‌های آموزشی: ${errorMessage(err)}`);
    } finally {
      if (samplesFetchGen.isCurrent(token)) set({ loading: false });
    }
  },

  addSample: async (data) => {
    try {
      const sample = await db.addTrainingSample(data);
      set({ samples: [sample, ...get().samples] });
      return sample;
    } catch (err) {
      const message = errorMessage(err);
      toast.error(`افزودن نمونهٔ آموزشی ناموفق بود: ${message}`);
      throw err;
    }
  },

  saveSampleAndCompletePoolItem: async (data) => {
    try {
      const sample = await db.saveTrainingSampleAndCompletePoolItem(data);
      set({ samples: [sample, ...get().samples] });
      return sample;
    } catch (err) {
      toast.error(`ذخیره نمونه و تکمیل تصویر ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  updateSample: async (id, patch) => {
    try {
      const updated = await db.updateTrainingSample(id, patch);
      set({
        samples: get().samples.map(s => (s.id === id ? { ...s, ...updated } : s)),
      });
    } catch (err) {
      toast.error(`به‌روزرسانی نمونه ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  deleteSample: async (id) => {
    try {
      await db.deleteTrainingSample(id);
      set({ samples: get().samples.filter(s => s.id !== id) });
    } catch (err) {
      toast.error(`حذف نمونهٔ آموزشی ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  markSamplesUsed: async (ids, modelVersion) => {
    try {
      await db.markTrainingSamplesUsed(ids, modelVersion);
      set({
        samples: get().samples.map(s =>
          ids.includes(s.id) ? { ...s, usedInTraining: true, modelVersionTrainedWith: modelVersion } : s
        ),
      });
    } catch (err) {
      console.warn('markTrainingSamplesUsed failed:', errorMessage(err));
    }
  },

  fetchModelMetadata: async () => {
    try {
      const meta = await db.getModelMetadata();
      set({ modelMetadata: meta });
    } catch (err) {
      console.warn('fetchModelMetadata failed:', errorMessage(err));
    }
  },

  saveModelMetadata: async (patch) => {
    try {
      const meta = await db.updateModelMetadata(patch);
      set({ modelMetadata: meta });
    } catch (err) {
      toast.error(`ذخیرهٔ اطلاعات مدل ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  clearModelMetadata: async () => {
    try {
      await db.clearModelMetadata();
      set({ modelMetadata: null });
    } catch (err) {
      console.warn('clearModelMetadata failed:', errorMessage(err));
    }
  },
}));

// =============== Settings Store ===============
interface SettingsState {
  settings: Settings;
  loading: boolean;
  fetchSettings: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** موج ۲ (C2.4): backupPassword فقط در Electron اثر دارد؛ موج ۳ (O3): modelBundle اختیاری */
  exportData: (options?: { backupPassword?: string; modelBundle?: LocalModelBackupBundle | null }) => Promise<string>;
  /** موج ۳: گزارش بازیابی برمی‌گردد (importedModel → پارک چلنجر در UI) */
  importData: (json: string, options?: { backupPassword?: string }) => Promise<ImportBackupReport>;
}

const DEFAULT_SETTINGS: Settings = { language: 'fa', theme: 'mint', aiConfidenceThreshold: DEFAULT_AI_CONFIDENCE_THRESHOLD };

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loading: false,

  fetchSettings: async () => {
    const token = settingsFetchGen.next();
    set({ loading: true });
    try {
      let settings = await db.getSettings();
      if (!settingsFetchGen.isCurrent(token)) return;

      if (!settings || typeof settings !== 'object') {
        set({ settings: DEFAULT_SETTINGS });
        return;
      }

      // Migration: تبدیل تم‌های قدیمی به mint
      if ((settings.theme as string) === 'light') {
        settings = { ...settings, theme: 'mint' };
        await db.updateSettings({ theme: 'mint' });
      }

      if (!settingsFetchGen.isCurrent(token)) return;
      set({ settings });
    } catch (err) {
      if (!settingsFetchGen.isCurrent(token)) return;
      // اگر دیتابیس در دسترس نباشد حداقل تنظیمات پیش‌فرض را نشان بده تا برنامه بالا بیاید،
      // ولی خطا را هم به کاربر اطلاع بده چون یعنی هیچ‌چیزی ذخیره نمی‌شود.
      set({ settings: DEFAULT_SETTINGS });
      toast.error(`اتصال به پایگاه داده برقرار نشد: ${errorMessage(err)}`);
    } finally {
      if (settingsFetchGen.isCurrent(token)) set({ loading: false });
    }
  },

  updateSettings: async (patch) => {
    try {
      const updated = await db.updateSettings(patch);
      set({ settings: updated });
    } catch (err) {
      toast.error(`ذخیره تنظیمات ناموفق بود: ${errorMessage(err)}`);
      throw err;
    }
  },

  exportData: async (options) => {
    return db.exportData(options);
  },

  importData: async (json, options) => {
    const report = await db.importData(json, options);
    await get().fetchSettings();
    return report;
  },
}));
