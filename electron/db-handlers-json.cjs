/**
 * Fallback JSON File Database
 *
 * از این ماژول زمانی استفاده می‌شود که better-sqlite3 (ماژول native) به هر دلیلی
 * بارگذاری نشود — مثلاً چون روی سیستم کاربر ابزارهای build نصب نیست و کامپایل
 * ماژول ناتیو شکست می‌خورد. این پیاده‌سازی هیچ وابستگی native ندارد و همیشه کار
 * می‌کند، بنابراین برنامه هرگز بدون قابلیت ذخیره‌سازی باقی نمی‌ماند.
 *
 * دقیقاً همان متد handleDbQuery(method, params) را با همان امضا و همان
 * خروجی‌های db-handlers.cjs پیاده می‌کند تا main.cjs بدون تغییر بتواند از هرکدام
 * که در دسترس است استفاده کند.
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const {
  hashPasswordScrypt,
  verifyPassword,
  isLegacyPlaintextPassword,
  verifyLegacyPlaintextPassword,
  sanitizeSettings,
  sanitizeSettingsForBackup,
  createBackupEnvelope,
  parseBackupPayload,
  createValueCrypto,
  toListAnalysisRow,
  MIN_PASSWORD_LENGTH,
  SYSTEM_TRAINING_POOL_CLIENT_ID,
  buildSystemTrainingPoolClientRecord,
} = require('./db-common.cjs');
const {
  encryptBuffer,
  decryptBuffer,
  isEncryptedBuffer,
  encryptWithPassword,
  decryptWithPassword,
} = require('./file-crypto.cjs');
const { getPurposeKey } = require('./dek.cjs');
const { AUDIT_EVENTS, setAuditSink, createAuditRecorder } = require('./audit.cjs');

function emptyData() {
  return {
    clients: [],
    gallery: [],
    sessions: [],
    trichologists: [],
    analyses: [],
    trainingSamples: [],
    questionnaireRevisions: [],
    auditLog: [],
    localModelMetadata: null,
    settings: { language: 'fa', theme: 'mint', aiConfidenceThreshold: 0.7 },
  };
}

/**
 * @param {string} userDataPath
 * @param {object} safeStorage - Electron safeStorage module
 */
function createJsonDbHandlers(userDataPath, safeStorage) {
  const dataFile = path.join(userDataPath, 'scalpai-data.json');
  const tmpFile = dataFile + '.tmp';

  let data = emptyData();

  // موج ۲ (C1.4): کل فایل JSON (که تصاویر را هم به‌صورت inline دارد) با کلید
  // مشتق از DEK رمز می‌شود. کلید نباشد → رفتار plaintext قبلی (fail-open مستند).
  function jsonKeyOrNull() {
    return getPurposeKey('json-store');
  }

  // اگر فایل رمزشده باشد ولی کلید در دسترس نباشد، هرگز نباید با دادهٔ خالی
  // بازنویسی‌اش کرد (نابودی داده) — نوشتن مسدود و وضعیت گزارش می‌شود.
  let persistenceBlocked = false;

  function load() {
    try {
      if (fs.existsSync(dataFile)) {
        const rawBytes = fs.readFileSync(dataFile);
        if (isEncryptedBuffer(rawBytes)) {
          const jsonKey = jsonKeyOrNull();
          if (!jsonKey) {
            persistenceBlocked = true;
            console.error('scalpai-data.json is encrypted but the encryption key is unavailable — persistence is DISABLED to protect the encrypted store. Data from the encrypted file will not be visible in this session.');
            data = emptyData();
            return;
          }
          data = { ...emptyData(), ...JSON.parse(decryptBuffer(rawBytes, jsonKey).toString('utf-8')) };
        } else {
          data = { ...emptyData(), ...JSON.parse(rawBytes.toString('utf-8')) };
        }
      } else {
        save();
      }
    } catch (error) {
      console.error('Failed to read scalpai-data.json, starting with empty data:', error);
      data = emptyData();
    }
    // Idempotent: صرف‌نظر از این‌که فایل قبلاً وجود داشته یا تازه ساخته شده،
    // ردیف مشتری سیستمی (استخر آموزشی) باید همیشه موجود باشد.
    if (ensureSystemTrainingPoolClient()) save();
  }

  /**
   * تضمین وجود ردیف مشتری سیستمی در حافظه — idempotent، فایل را خودش ذخیره نمی‌کند.
   * @returns {boolean} true اگر ردیف اضافه/اصلاح شد (یعنی نیاز به save() هست)
   */
  function ensureSystemTrainingPoolClient() {
    if (!Array.isArray(data.clients)) data.clients = [];
    const existing = data.clients.find(c => c.id === SYSTEM_TRAINING_POOL_CLIENT_ID);
    if (existing) return false;
    data.clients.push(buildSystemTrainingPoolClientRecord());
    return true;
  }

  // نوشتن اتمیک: اول در فایل موقت، بعد rename — تا اگر برنامه وسط نوشتن بسته شد،
  // فایل اصلی خراب/نصفه نشود.
  function save() {
    if (persistenceBlocked) {
      // فایل رمزشده با کلید ناموجود — هرگز بازنویسی نکن (دیدن کامنت load)
      return;
    }
    const jsonText = JSON.stringify(data, null, 2);
    const jsonKey = jsonKeyOrNull();
    fs.writeFileSync(tmpFile, jsonKey ? encryptBuffer(Buffer.from(jsonText, 'utf-8'), jsonKey) : jsonText, jsonKey ? undefined : 'utf-8');
    fs.renameSync(tmpFile, dataFile);
  }

  const { encryptValue, decryptValue } = createValueCrypto(safeStorage);

  // موج ۲ (C3.3) — ردپای حسابرسی داخل خود فایل JSON ذخیره می‌شود.
  const appendAuditEntry = (entry) => {
    if (!Array.isArray(data.auditLog)) data.auditLog = [];
    data.auditLog.push(entry);
    // سقف نگه‌داری تا فایل JSON بی‌نهایت رشد نکند (با SQLite حد ۲۰۰۰ در export)
    if (data.auditLog.length > 2000) data.auditLog = data.auditLog.slice(-2000);
    save();
  };
  // recorder محلی برای رویدادهای خود هندلر (بدون تداخل چند نمونهٔ هم‌زمان)…
  const recordEvent = createAuditRecorder(appendAuditEntry);
  // …و sink جهانی برای رویدادهای main-process وقتی این بک‌اند فعال است
  setAuditSink(appendAuditEntry);

  load();

  // قفل ترتیبی نوشتن: handleDbQuery async است و بدون این، دو IPC هم‌زمان
  // می‌توانند mutate + save را درهم کنند و به‌روزرسانی گم شود.
  let writeChain = Promise.resolve();
  function withWriteLock(fn) {
    const run = writeChain.then(fn, fn);
    writeChain = run.then(() => undefined, () => undefined);
    return run;
  }

  return {
    async handleDbQuery(method, params = {}) {
      return withWriteLock(async () => {
      try {
        switch (method) {
          // =============== Clients ===============
          case 'getClients': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const limit = params.limit || 20;
            const offset = params.offset || 0;
            const search = (params.search || '').trim().toLowerCase();
            // ردیف مشتری سیستمی (استخر آموزشی) هرگز در فهرست مشتریان واقعی دیده نمی‌شود
            let list = data.clients.filter(c => !c.isSystemRecord);
            if (search) {
              list = list.filter(c =>
                (c.firstName || '').toLowerCase().includes(search) ||
                (c.lastName || '').toLowerCase().includes(search) ||
                (c.phone || '').toLowerCase().includes(search)
              );
            }
            const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return hasLimit ? sorted.slice(offset, offset + limit) : sorted.slice(offset);
          }

          case 'getClientsCount': {
            const search = (params.search || '').trim().toLowerCase();
            const realClients = data.clients.filter(c => !c.isSystemRecord);
            if (!search) return realClients.length;
            return realClients.filter(c =>
              (c.firstName || '').toLowerCase().includes(search) ||
              (c.lastName || '').toLowerCase().includes(search) ||
              (c.phone || '').toLowerCase().includes(search)
            ).length;
          }

          case 'getClient':
            return data.clients.find(c => c.id === params.id) || null;

          case 'createClient': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const client = { id, ...params, createdAt: now, updatedAt: now };
            data.clients.push(client);
            save();
            return client;
          }

          case 'updateClient': {
            const now = new Date().toISOString();
            const idx = data.clients.findIndex(c => c.id === params.id);
            if (idx === -1) throw new Error('Client not found');
            data.clients[idx] = { ...data.clients[idx], ...params, updatedAt: now };
            save();
            return data.clients[idx];
          }

          case 'deleteClient': {
            // کلاینت سیستمی (استخر آموزشی) هرگز از این مسیر حذف نمی‌شود
            if (params.id === SYSTEM_TRAINING_POOL_CLIENT_ID) {
              throw new Error('System training-pool client cannot be deleted');
            }
            data.gallery = data.gallery.filter(g => g.clientId !== params.id);
            data.sessions = data.sessions.filter(s => s.clientId !== params.id);
            data.analyses = data.analyses.filter(a => a.clientId !== params.id);
            data.trainingSamples = (data.trainingSamples || []).filter(s => s.clientId !== params.id);
            data.questionnaireRevisions = (data.questionnaireRevisions || []).filter(r => r.clientId !== params.id);
            data.clients = data.clients.filter(c => c.id !== params.id);
            save();
            recordEvent(AUDIT_EVENTS.CLIENT_DELETE, 'local-user', { clientId: params.id });
            return { success: true };
          }

          case 'getAuditLog': {
            const limit = Math.min(params.limit || 200, 1000);
            return [...(data.auditLog || [])]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, limit);
          }

          // =============== Gallery ===============
          case 'getGalleryByClient': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const limit = params.limit || 20;
            const offset = params.offset || 0;
            const items = data.gallery
              .filter(g => g.clientId === params.clientId)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return hasLimit ? items.slice(offset, offset + limit) : items.slice(offset);
          }

          case 'getAllGallery': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const limit = params.limit || 20;
            const offset = params.offset || 0;
            // گالری کلاینت سیستمی (استخر آموزشی) از گالری عمومی/همه‌مشتریان مستثناست
            const items = data.gallery
              .filter(g => g.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            return hasLimit ? items.slice(offset, offset + limit) : items.slice(offset);
          }

          case 'getGalleryCount':
            return params.clientId
              ? data.gallery.filter(g => g.clientId === params.clientId).length
              : data.gallery.filter(g => g.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID).length;

          case 'getGalleryPage': {
            let items = data.gallery.filter(g => g.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID);
            if (params.clientId) items = items.filter(g => g.clientId === params.clientId);
            if (params.type) items = items.filter(g => g.type === params.type);
            if (params.search) {
              const q = String(params.search).toLowerCase();
              const clients = new Map(data.clients.map(c => [c.id, c]));
              items = items.filter(g => { const c = clients.get(g.clientId); return c && `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(q); });
            }
            if (params.startDate) items = items.filter(g => g.createdAt >= params.startDate);
            if (params.endDate) items = items.filter(g => g.createdAt <= params.endDate);
            if (params.regionId) items = items.filter(g => g.metadata?.scalpRegion === params.regionId);
            if (params.trichoscopeMode) items = items.filter(g => g.metadata?.trichoscopeMode === params.trichoscopeMode);
            items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const offset = params.offset || 0;
            return params.limit == null ? items.slice(offset) : items.slice(offset, offset + params.limit);
          }

          case 'getGalleryPageCount': {
            let items = data.gallery.filter(g => g.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID);
            if (params.clientId) items = items.filter(g => g.clientId === params.clientId);
            if (params.type) items = items.filter(g => g.type === params.type);
            if (params.search) {
              const q = String(params.search).toLowerCase();
              const clients = new Map(data.clients.map(c => [c.id, c]));
              items = items.filter(g => { const c = clients.get(g.clientId); return c && `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(q); });
            }
            if (params.startDate) items = items.filter(g => g.createdAt >= params.startDate);
            if (params.endDate) items = items.filter(g => g.createdAt <= params.endDate);
            if (params.regionId) items = items.filter(g => g.metadata?.scalpRegion === params.regionId);
            if (params.trichoscopeMode) items = items.filter(g => g.metadata?.trichoscopeMode === params.trichoscopeMode);
            return items.length;
          }

          case 'getTrainingPoolItems': {
            const status = params.status === 'completed' ? 'completed' : 'active';
            let items = data.gallery.filter(g => g.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID && (status === 'completed' ? g.trainingPoolStatus === 'completed' : (!g.trainingPoolStatus || g.trainingPoolStatus === 'active')));
            if (params.startDate) items = items.filter(g => g.createdAt >= params.startDate);
            if (params.endDate) items = items.filter(g => g.createdAt <= params.endDate);
            if (params.regionId) items = items.filter(g => g.metadata?.scalpRegion === params.regionId);
            items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const offset = params.offset || 0;
            return params.limit == null ? items.slice(offset) : items.slice(offset, offset + params.limit);
          }

          case 'getTrainingPoolItemsCount': {
            const status = params.status === 'completed' ? 'completed' : 'active';
            let items = data.gallery.filter(g => g.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID && (status === 'completed' ? g.trainingPoolStatus === 'completed' : (!g.trainingPoolStatus || g.trainingPoolStatus === 'active')));
            if (params.startDate) items = items.filter(g => g.createdAt >= params.startDate);
            if (params.endDate) items = items.filter(g => g.createdAt <= params.endDate);
            if (params.regionId) items = items.filter(g => g.metadata?.scalpRegion === params.regionId);
            return items.length;
          }

          case 'updateTrainingPoolItemStatus': {
            if (!['active', 'completed'].includes(params.status)) throw new Error('Invalid training pool status');
            const item = data.gallery.find(g => g.id === params.id && g.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID);
            if (!item) throw new Error('Training pool item not found');
            item.trainingPoolStatus = params.status;
            save();
            return { success: true };
          }

          // در این نسخهٔ fallback محتوای کامل داخل خود رکورد است (بدون filePath)،
          // پس renderer معمولاً همان url را مستقیم استفاده می‌کند؛ این case فقط
          // برای کامل بودن قرارداد adapter است.
          case 'getGalleryItemDataUrl': {
            const item = data.gallery.find(g => g.id === params.id);
            return item ? item.url : null;
          }

          case 'addGalleryItem': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const item = { id, ...params, trainingPoolStatus: params.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID ? (params.trainingPoolStatus || 'active') : undefined, createdAt: now };
            data.gallery.push(item);
            save();
            return item;
          }

          case 'deleteGalleryItem':
            data.gallery = data.gallery.filter(g => g.id !== params.id);
            save();
            return { success: true };

          // =============== Sessions ===============
          case 'getSessions': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const sorted = [...data.sessions].sort((a, b) =>
              (b.date + b.time).localeCompare(a.date + a.time));
            const offset = params.offset || 0;
            return hasLimit ? sorted.slice(offset, offset + params.limit) : sorted.slice(offset);
          }

          case 'getSessionsCount':
            return data.sessions.length;

          case 'getSessionsByClient':
            return data.sessions
              .filter(s => s.clientId === params.clientId)
              .sort((a, b) => b.date.localeCompare(a.date));

          case 'createSession': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const session = { id, ...params, createdAt: now };
            data.sessions.push(session);
            save();
            return session;
          }

          case 'updateSession': {
            const idx = data.sessions.findIndex(s => s.id === params.id);
            if (idx === -1) throw new Error('Session not found');
            data.sessions[idx] = { ...data.sessions[idx], ...params };
            save();
            return data.sessions[idx];
          }

          case 'deleteSession':
            // پرسشنامهٔ آن مراجعه بدون نوبت بی‌معناست — همراه نوبت حذف می‌شود
            data.questionnaireRevisions = (data.questionnaireRevisions || []).filter(r => r.sessionId !== params.id);
            data.sessions = data.sessions.filter(s => s.id !== params.id);
            save();
            return { success: true };

          // =============== Questionnaire Revisions ===============
          case 'getQuestionnaireRevisionsByClient':
            return (data.questionnaireRevisions || [])
              .filter(r => r.clientId === params.clientId)
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

          case 'getQuestionnaireRevision':
            return (data.questionnaireRevisions || []).find(
              r => r.clientId === params.clientId && r.sessionId === params.sessionId
            ) || null;

          case 'getPreviousFinalQuestionnaireRevision': {
            const list = (data.questionnaireRevisions || [])
              .filter(r =>
                r.clientId === params.clientId &&
                r.status === 'final' &&
                (!params.excludeSessionId || r.sessionId !== params.excludeSessionId)
              )
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return list[0] || null;
          }

          case 'saveQuestionnaireRevision': {
            const now = new Date().toISOString();
            if (!Array.isArray(data.questionnaireRevisions)) data.questionnaireRevisions = [];
            const idx = data.questionnaireRevisions.findIndex(
              r => r.clientId === params.clientId && r.sessionId === params.sessionId
            );
            if (idx >= 0) {
              const existing = data.questionnaireRevisions[idx];
              data.questionnaireRevisions[idx] = {
                ...existing,
                values: params.values || {},
                status: params.status || existing.status,
                changedFields: params.changedFields !== undefined
                  ? (params.changedFields || [])
                  : (existing.changedFields || []),
                updatedAt: now,
              };
              save();
              return data.questionnaireRevisions[idx];
            }
            const revision = {
              id: crypto.randomUUID(),
              clientId: params.clientId,
              sessionId: params.sessionId,
              status: params.status || 'draft',
              values: params.values || {},
              changedFields: params.changedFields || [],
              createdAt: now,
              updatedAt: now,
            };
            data.questionnaireRevisions.push(revision);
            save();
            return revision;
          }

          // =============== Trichologists ===============
          case 'getTrichologists':
            return data.trichologists;

          case 'createTrichologist': {
            const id = crypto.randomUUID();
            const trichologist = { id, ...params };
            data.trichologists.push(trichologist);
            save();
            return trichologist;
          }

          case 'updateTrichologist': {
            const idx = data.trichologists.findIndex(t => t.id === params.id);
            if (idx === -1) throw new Error('Trichologist not found');
            data.trichologists[idx] = { ...data.trichologists[idx], ...params };
            save();
            return data.trichologists[idx];
          }

          case 'deleteTrichologist':
            data.trichologists = data.trichologists.filter(t => t.id !== params.id);
            save();
            return { success: true };

          // =============== Analyses ===============
          case 'getAnalyses': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const sorted = [...data.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
            const offset = params.offset || 0;
            const page = hasLimit ? sorted.slice(offset, offset + params.limit) : sorted.slice(offset);
            // مطابق نسخهٔ SQLite: تصاویر سنگین در پاسخ لیست نمی‌آیند
            return page.map(toListAnalysisRow);
          }

          case 'getAnalysesCount':
            return data.analyses.length;

          case 'getAnalysesByClient':
            return data.analyses
              .filter(a => a.clientId === params.clientId)
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map(toListAnalysisRow);

          case 'getAnalysisAnnotatedImage': {
            const found = data.analyses.find(a => a.id === params.id);
            if (!found) return null;
            return (
              found.aiResults?.annotatedImageBase64 ||
              found.offlineResults?.annotatedImageBase64 ||
              null
            );
          }

          case 'createAnalysis': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const analysis = { id, ...params, createdAt: now, updatedAt: now };
            data.analyses.push(analysis);
            save();
            return analysis;
          }

          case 'updateAnalysis': {
            const now = new Date().toISOString();
            const idx = data.analyses.findIndex(a => a.id === params.id);
            if (idx === -1) throw new Error('Analysis not found');
            data.analyses[idx] = { ...data.analyses[idx], ...params, updatedAt: now };
            save();
            return data.analyses[idx];
          }

          case 'deleteAnalysis':
            data.analyses = data.analyses.filter(a => a.id !== params.id);
            save();
            return { success: true };

          // =============== Settings ===============
          case 'getSettings': {
            // کلید API decrypt نمی‌شود — فقط hasApiKey به renderer می‌رود
            return sanitizeSettings({ ...data.settings });
          }

          case 'updateSettings': {
            const { hasPassword: _hp, hasApiKey: _hak, passwordHash: _ph, ...safeParams } = params;
            const updated = { ...data.settings, ...safeParams };
            if (params.aiApiKey) updated.aiApiKey = encryptValue(params.aiApiKey);
            if (params.password) {
              if (String(params.password).length < MIN_PASSWORD_LENGTH) {
                throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
              }
              updated.passwordHash = hashPasswordScrypt(params.password);
              delete updated.password;
            }
            data.settings = updated;
            save();
            return sanitizeSettings({ ...updated });
          }

          case 'verifyCredentials': {
            const settings = data.settings;
            if (params.username !== settings.username) return false;
            const stored = settings.passwordHash || settings.password;
            if (verifyPassword(params.password, stored)) return true;
            if (isLegacyPlaintextPassword(stored) && verifyLegacyPlaintextPassword(params.password, stored)) {
              settings.passwordHash = hashPasswordScrypt(params.password);
              delete settings.password;
              save();
              return true;
            }
            return false;
          }

          case 'hasCredentials':
            return !!(data.settings.username && (data.settings.passwordHash || data.settings.password));

          // =============== Export/Import ===============
          case 'exportData': {
            const exportable = JSON.parse(JSON.stringify(data));
            exportable.settings = sanitizeSettingsForBackup(exportable.settings || {});
            const envelopeText = JSON.stringify(createBackupEnvelope(exportable), null, 2);
            recordEvent(AUDIT_EVENTS.DATA_EXPORT, 'local-user', { format: params.backupPassword ? 'v4-encrypted' : 'json', passwordProtected: !!params.backupPassword });
            // موج ۲ (C2.4) — همان گزینهٔ پشتیبان رمزدار با پسورد برای بک‌اند JSON
            if (params.backupPassword) {
              return 'scalpai-backup:v4:enc:base64:' + encryptWithPassword(Buffer.from(envelopeText, 'utf-8'), params.backupPassword).toString('base64');
            }
            return envelopeText;
          }

          case 'importData': {
            let rawPayload = params.jsonData;
            // موج ۲ (C2.4) — بکاپ رمزدارِ تولیدشده در همین بک‌اند (envelope JSON رمزشده)
            if (typeof rawPayload === 'string' && rawPayload.startsWith('scalpai-backup:v4:enc:base64:')) {
              if (!params.backupPassword) throw new Error('Backup password required');
              const encBytes = Buffer.from(rawPayload.split('scalpai-backup:v4:enc:base64:')[1], 'base64');
              rawPayload = decryptWithPassword(encBytes, params.backupPassword).toString('utf-8');
            }
            const imported = parseBackupPayload(rawPayload);
            const previousData = data;
            const importedSettings = sanitizeSettingsForBackup(imported.settings || {});
            const nextData = {
              ...emptyData(),
              ...imported,
              settings: {
                ...previousData.settings,
                ...importedSettings,
                password: previousData.settings.password,
                passwordHash: previousData.settings.passwordHash,
                aiApiKey: previousData.settings.aiApiKey,
              },
            };
            try {
              data = nextData;
              // بکاپ ممکن است از نسخهٔ قدیمی‌تر (بدون فیچر استخر آموزشی) باشد؛
              // بعد از جایگزینی کامل clients باید ردیف سیستمی دوباره تضمین شود.
              ensureSystemTrainingPoolClient();
              save();
            } catch (error) {
              data = previousData;
              throw error;
            }
            recordEvent(AUDIT_EVENTS.DATA_IMPORT, 'local-user', { format: 'json', clients: (imported.clients || []).length });
            return { success: true };
          }

          // =============== یادگیری ماشین محلی (Training Samples) ===============
          case 'getTrainingSamples':
            return [...data.trainingSamples].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          case 'saveTrainingSampleAndCompletePoolItem': {
            if (!params.galleryItemId || params.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID) throw new Error('A system training-pool gallery item is required');
            if (data.trainingSamples.some(s => s.galleryItemId === params.galleryItemId)) throw new Error('A training sample already exists for this gallery item');
            const item = data.gallery.find(g => g.id === params.galleryItemId && g.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID);
            if (!item || (item.trainingPoolStatus && item.trainingPoolStatus !== 'active')) throw new Error('Training pool item not found or already completed');
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const sample = { id, ...params, usedInTraining: false, createdAt: now, approvedForTraining: params.approvedForTraining ?? params.labelSource === 'expert' };
            data.trainingSamples.push(sample);
            item.trainingPoolStatus = 'completed';
            try { save(); } catch (error) { data.trainingSamples = data.trainingSamples.filter(s => s.id !== id); item.trainingPoolStatus = 'active'; throw error; }
            return sample;
          }

          case 'addTrainingSample': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const sample = {
              id,
              ...params,
              usedInTraining: false,
              createdAt: now,
              approvedForTraining: params.approvedForTraining ?? params.labelSource === 'expert',
            };
            data.trainingSamples.push(sample);
            save();
            return sample;
          }

          case 'updateTrainingSample': {
            const idx = data.trainingSamples.findIndex(s => s.id === params.id);
            if (idx < 0) throw new Error('Sample not found');
            const prev = data.trainingSamples[idx];
            // فاز ۳٫۱ — baseline پاسخ اولیهٔ AI فقط یک‌بار نوشته می‌شود.
            // (هم‌رفتار با مسیر sqlite تا دو بک‌اند از هم واگرا نشوند.)
            let originalAiLabel = prev.originalAiLabel;
            let originalAiLabelAt = prev.originalAiLabelAt;
            if (!originalAiLabel) {
              if (params.originalAiLabel != null) {
                originalAiLabel = params.originalAiLabel;
                originalAiLabelAt = params.originalAiLabelAt || new Date().toISOString();
              } else if (
                params.labelSource === 'expert'
                && prev.labelSource === 'online_ai'
                && params.label !== undefined
              ) {
                originalAiLabel = prev.label;
                originalAiLabelAt = new Date().toISOString();
              }
            }
            data.trainingSamples[idx] = {
              ...prev,
              ...(originalAiLabel ? { originalAiLabel, originalAiLabelAt } : {}),
              ...(params.approvedForTraining !== undefined
                ? { approvedForTraining: !!params.approvedForTraining }
                : {}),
              ...(params.featureVersion !== undefined
                ? { featureVersion: params.featureVersion }
                : {}),
              ...(params.label !== undefined ? { label: params.label } : {}),
              ...(params.labelSource !== undefined ? { labelSource: params.labelSource } : {}),
              ...(params.confidence !== undefined ? { confidence: params.confidence } : {}),
              ...(params.usedInTraining !== undefined
                ? { usedInTraining: !!params.usedInTraining }
                : {}),
              ...(params.clientId !== undefined ? { clientId: params.clientId || undefined } : {}),
              ...(params.galleryItemId !== undefined
                ? { galleryItemId: params.galleryItemId || undefined }
                : {}),
              ...(params.questionnaireFeatures !== undefined
                ? { questionnaireFeatures: params.questionnaireFeatures || undefined }
                : {}),
              // موج ۱ (W1-4) — بازنویسی فیچرهای بازمحاسبه‌شده از تصویر خام
              ...(params.features !== undefined ? { features: params.features } : {}),
            };
            save();
            return data.trainingSamples[idx];
          }

          case 'deleteTrainingSample':
            data.trainingSamples = data.trainingSamples.filter(s => s.id !== params.id);
            save();
            return { success: true };

          case 'markTrainingSamplesUsed': {
            const ids = new Set(params.ids || []);
            data.trainingSamples = data.trainingSamples.map(s =>
              ids.has(s.id) ? { ...s, usedInTraining: true, modelVersionTrainedWith: params.modelVersion } : s
            );
            save();
            return { success: true };
          }

          case 'getModelMetadata':
            return data.localModelMetadata || null;

          case 'updateModelMetadata': {
            const merged = { ...(data.localModelMetadata || {}), ...params };
            data.localModelMetadata = merged;
            save();
            return merged;
          }

          case 'clearModelMetadata': {
            data.localModelMetadata = null;
            save();
            return { success: true };
          }

          default:
            return { error: 'Unknown method: ' + method };
        }
      } catch (error) {
        console.error('JSON database error:', error);
        return { error: error.message };
      }
      });
    },

    // این نسخه fallback فایل‌ها را جداگانه روی دیسک ذخیره نمی‌کند (تصاویر به‌صورت
    // data URL همراه رکورد گالری ذخیره می‌شوند)، این توابع فقط برای سازگاری با
    // db-handlers.cjs اینجا هستند.
    saveImageToFile: null,
    readImageAsBase64: null,
    deleteImageFile: null,
    encryptValue,
    decryptValue,
    /** موج ۲: وقتی فایل رمزشده ولی کلید ناموجود است true می‌شود (نوشتن مسدود است) */
    getStorageState() {
      return { persistenceBlocked };
    },

    getDecryptedAiApiKey() {
      if (!data.settings.aiApiKey) return null;
      return decryptValue(data.settings.aiApiKey);
    },
  };
}

module.exports = { createJsonDbHandlers };
