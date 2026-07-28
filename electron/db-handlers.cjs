/**
 * Database Handlers Module
 * جداسازی هندلرهای دیتابیس از main.cjs برای تمیزی کد.
 * منطق مشترک با نسخهٔ fallback (JSON) در db-common.cjs نگهداری می‌شود.
 */

const { logger } = require('./logger.cjs');

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
// nativeImage فقط برای تولید thumbnail لازم است؛ در محیط تست (بدون باینری
// Electron) نبودش نباید کل ماژول را از کار بیندازد.
let nativeImage = null;
try { ({ nativeImage } = require('electron')); } catch { /* غیر-Electron: thumbnail تولید نمی‌شود */ }
const {
  hashPasswordScrypt,
  verifyPassword,
  isLegacyPlaintextPassword,
  verifyLegacyPlaintextPassword,
  sanitizeSettings,
  sanitizeSettingsForBackup,
  createBackupEnvelope,
  parseBackupPayload,
  parseStoredJson,
  parseDataUrl,
  mimeForExtension,
  createValueCrypto,
  toListAnalysisRow,
  MIN_PASSWORD_LENGTH,
  SYSTEM_TRAINING_POOL_CLIENT_ID,
  ensureSystemTrainingPoolClientSqlite,
} = require('./db-common.cjs');
const {
  packageDirName,
  copyFileStreaming,
  parseBackupPackage,
  createPackageEnvelope,
  extractAnnotatedImage,
  readAsBase64DataUrl,
  MEDIA_DIR_NAME,
} = require('./backup-package.cjs');

/**
 * ایجاد هندلرهای دیتابیس
 * @param {import('better-sqlite3').Database} db
 * @param {string} userDataPath
 * @param {object} safeStorage - Electron safeStorage module
 * @returns {object}
 */
function createDbHandlers(db, userDataPath, safeStorage) {
  // پوشه تصاویر/ویدیوها
  const imagesPath = path.join(userDataPath, 'images');
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }

  const { encryptValue, decryptValue } = createValueCrypto(safeStorage);

  /**
   * ذخیره تصویر یا ویدیو (data URL) در فایل سیستم
   * @param {string} base64Data - data URL
   * @param {string} clientId
   * @returns {string} مسیر فایل ذخیره شده
   */
  function saveImageToFile(base64Data, clientId) {
    const parsed = parseDataUrl(base64Data);
    if (!parsed) throw new Error('Invalid media data URL');

    // جلوگیری از path traversal: clientId از renderer یا فایل بکاپ می‌آید و
    // ممکن است دستکاری شده باشد (مثل «../..»)؛ پوشهٔ مقصد باید دقیقاً زیر
    // پوشهٔ images بماند.
    const clientImagesPath = path.resolve(imagesPath, String(clientId || ''));
    if (!clientImagesPath.startsWith(imagesPath + path.sep)) {
      throw new Error('Invalid client id for media storage');
    }
    if (!fs.existsSync(clientImagesPath)) {
      fs.mkdirSync(clientImagesPath, { recursive: true });
    }

    const uniqueFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${parsed.extension}`;
    const filePath = path.join(clientImagesPath, uniqueFilename);

    fs.writeFileSync(filePath, parsed.base64, 'base64');

    return filePath;
  }

  /**
   * نام فایل امن برای رکورد در بستهٔ بکاپ (شناسه‌ها به‌جز کاراکتر امن پاک‌سازی می‌شوند)
   * @param {string} id
   */
  function safeFileBase(id) {
    return String(id || 'item').replace(/[^a-zA-Z0-9-_]/g, '_');
  }

  /**
   * کپی یک فایل رسانه از مسیر موجود (مثلاً داخل بستهٔ بکاپ v3) به پوشهٔ images.
   * همان قواعد saveImageToFile: دفاع در برابر path traversal از طریق clientId
   * و نام فایل یکتا. استریم‌محور: مناسب ویدیوهای بزرگ.
   * @param {string} srcPath
   * @param {string} clientId
   * @param {string} extension
   * @returns {string} مسیر فایل ذخیره‌شده
   */
  function saveMediaFileFromPath(srcPath, clientId, extension) {
    const clientImagesPath = path.resolve(imagesPath, String(clientId || ''));
    if (!clientImagesPath.startsWith(imagesPath + path.sep)) {
      throw new Error('Invalid client id for media storage');
    }
    if (!fs.existsSync(clientImagesPath)) {
      fs.mkdirSync(clientImagesPath, { recursive: true });
    }
    const ext = String(extension || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const uniqueFilename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const filePath = path.join(clientImagesPath, uniqueFilename);
    fs.copyFileSync(srcPath, filePath);
    return filePath;
  }

  /**
   * خواندن تصویر/ویدیو از فایل سیستم و تبدیل به data URL
   * @param {string} filePath
   * @returns {string|null}
   */
  function readImageAsBase64(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        const mimeType = mimeForExtension(path.extname(filePath).slice(1));
        return `data:${mimeType};base64,${data.toString('base64')}`;
      }
    } catch (error) {
      logger.error('Error reading media file:', error);
    }
    return null;
  }

  const THUMB_MAX_DIMENSION = 320;

  /**
   * تولید thumbnail برای عکس‌های قدیمی که بدون thumbnail ذخیره شده‌اند
   * (آپلودهای جدید thumbnail را در renderer می‌سازند). نتیجه در دیتابیس
   * cache می‌شود تا فقط یک بار تولید شود.
   * @param {{ id: string, filePath: string }} row
   * @returns {string|null} data URL کوچک یا null اگر فرمت پشتیبانی نشود
   */
  function generateAndCacheThumbnail(row) {
    try {
      if (!fs.existsSync(row.filePath)) return null;
      if (!nativeImage) return null;
      const image = nativeImage.createFromPath(row.filePath);
      if (image.isEmpty()) return null;
      const { width, height } = image.getSize();
      if (!width || !height) return null;
      const resized = width >= height
        ? image.resize({ width: Math.min(THUMB_MAX_DIMENSION, width) })
        : image.resize({ height: Math.min(THUMB_MAX_DIMENSION, height) });
      const thumb = `data:image/jpeg;base64,${resized.toJPEG(72).toString('base64')}`;
      db.prepare('UPDATE gallery SET thumbnail = ? WHERE id = ?').run(thumb, row.id);
      return thumb;
    } catch (error) {
      logger.error('Thumbnail generation failed:', error);
      return null;
    }
  }

  /**
   * آماده‌سازی یک ردیف گالری برای لیست: به‌جای محتوای کامل (که ممکن است
   * چند مگابایت باشد) فقط thumbnail سبک در url گذاشته می‌شود. محتوای کامل
   * از طریق getGalleryItemDataUrl به‌صورت on-demand خوانده می‌شود.
   */
  function toListGalleryRow(row) {
    const metadata = parseStoredJson(row.metadata, row.metadata && typeof row.metadata === 'object' ? row.metadata : {});
    // ردیف legacy که کل محتوا در خود url است (بدون فایل روی دیسک)
    if (!row.filePath) return { ...row, metadata };
    if (row.thumbnail) return { ...row, metadata, url: row.thumbnail };
    if (row.type === 'photo') {
      const thumb = generateAndCacheThumbnail(row);
      if (thumb) return { ...row, metadata, thumbnail: thumb, url: thumb };
      // فرمتی که nativeImage پشتیبانی نمی‌کند — fallback به محتوای کامل
      const full = readImageAsBase64(row.filePath);
      return { ...row, metadata, url: full || '' };
    }
    // ویدیو بدون thumbnail: ارسال کل ویدیو برای یک لیست منطقی نیست؛
    // UI برای url خالی placeholder نشان می‌دهد.
    return { ...row, metadata, url: '' };
  }

  /**
   * حذف فایل تصویر/ویدیو
   * @param {string} filePath
   */
  function deleteImageFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      logger.error('Error deleting media file:', error);
    }
  }

  /**
   * هستهٔ مشترک مهاجرت بکاپ (فاز ۰.۵): importData (v2) و importDataPackage (v3)
   * فقط در «ساخت ردیف‌های گالری» فرق می‌کنند؛ تراکنش/تنظیمات/پاکسازی فایل
   * اینجاست. prepareGallery داخل try صدا زده می‌شود تا خطای کپی فایل هم
   * منجر به پاکسازی createdFiles شود.
   * @param {object} data — payload بکاپ
   * @param {(createdFiles: string[]) => Array} prepareGallery — سازندهٔ ردیف‌های گالری آماده (filePath جدید)
   */
  function dropOrphanRows(rows, label, clientIds) {
    const kept = (rows || []).filter(r => clientIds.has(r.clientId));
    const dropped = (rows || []).length - kept.length;
    if (dropped > 0) logger.warn(`importData: dropped ${dropped} orphan ${label} row(s) referencing missing clients`);
    return kept;
  }

  function executeImport(data, prepareGallery) {
    const previousGallery = db.prepare('SELECT filePath FROM gallery WHERE filePath IS NOT NULL').all();
    const createdFiles = [];
    const clientIds = new Set((data.clients || []).map(c => c.id));
    try {
      const importedGallery = prepareGallery(createdFiles);
      const sessionRows = dropOrphanRows(data.sessions, 'sessions', clientIds);
      const analysisRowsToImport = dropOrphanRows(data.analyses, 'analyses', clientIds);
      const questionnaireRowsToImport = dropOrphanRows(data.questionnaireRevisions, 'questionnaire_revisions', clientIds);
      const currentSettingsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
      const currentSettings = currentSettingsRow ? JSON.parse(currentSettingsRow.value) : {};
      const importedSettings = sanitizeSettingsForBackup(data.settings || {});
      const settingsToStore = {
        ...currentSettings,
        ...importedSettings,
        password: currentSettings.password,
        passwordHash: currentSettings.passwordHash,
        aiApiKey: currentSettings.aiApiKey,
      };

      const importTransaction = db.transaction(() => {
        db.exec('DELETE FROM analyses; DELETE FROM questionnaire_revisions; DELETE FROM sessions; DELETE FROM gallery; DELETE FROM clients; DELETE FROM trichologists; DELETE FROM training_samples;');
        db.prepare('DELETE FROM settings WHERE key = ?').run('localModelMetadata');

        for (const client of data.clients || []) {
          db.prepare(`
            INSERT INTO clients (id, firstName, lastName, phone, email, gender, birthDate, notes, isSystemRecord, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            client.id, client.firstName, client.lastName, client.phone, client.email,
            client.gender, client.birthDate, client.notes,
            client.isSystemRecord ? 1 : (client.id === SYSTEM_TRAINING_POOL_CLIENT_ID ? 1 : 0),
            client.createdAt, client.updatedAt,
          );
        }
        // بکاپ ممکن است از نسخهٔ قدیمی‌تر (بدون ردیف سیستمی) باشد؛ بعد از
        // پاکسازی و بازسازی کامل جدول clients، وجود آن دوباره تضمین می‌شود.
        ensureSystemTrainingPoolClientSqlite(db);
        for (const item of importedGallery) {
          db.prepare(`
            INSERT INTO gallery (id, clientId, type, url, thumbnail, filename, metadata, filePath, trainingPoolStatus, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            item.id, item.clientId, item.type, item.url, item.thumbnail, item.filename,
            JSON.stringify(parseStoredJson(item.metadata, {})), item.filePath,
            item.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID ? (item.trainingPoolStatus || 'active') : null,
            item.createdAt,
          );
        }
        for (const session of sessionRows) {
          db.prepare(`
            INSERT INTO sessions (id, clientId, trichologistId, date, time, status, notes, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            session.id, session.clientId, session.trichologistId, session.date,
            session.time, session.status, session.notes, session.createdAt,
          );
        }
        for (const tri of data.trichologists || []) {
          db.prepare(`
            INSERT INTO trichologists (id, name, specialty, phone, email, description, active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            tri.id, tri.name, tri.specialty, tri.phone, tri.email, tri.description, tri.active ? 1 : 0,
          );
        }
        for (const revision of questionnaireRowsToImport) {
          db.prepare(`
            INSERT INTO questionnaire_revisions (id, clientId, sessionId, status, valuesJson, changedFieldsJson, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            revision.id || crypto.randomUUID(), revision.clientId, revision.sessionId,
            revision.status === 'final' ? 'final' : 'draft',
            JSON.stringify(parseStoredJson(revision.values, {})),
            JSON.stringify(parseStoredJson(revision.changedFields, [])),
            revision.createdAt || new Date().toISOString(),
            revision.updatedAt || new Date().toISOString(),
          );
        }
        for (const analysis of analysisRowsToImport) {
          db.prepare(`INSERT INTO analyses (id, clientId, sessionId, trichologistId, type, galleryItemId, medicalQuestionnaire, observations, recommendations, treatmentPlan, aiResults, offlineResults, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            analysis.id, analysis.clientId, analysis.sessionId || null, analysis.trichologistId, analysis.type, analysis.galleryItemId,
            JSON.stringify(parseStoredJson(analysis.medicalQuestionnaire, {})),
            JSON.stringify(parseStoredJson(analysis.observations, [])),
            analysis.recommendations, analysis.treatmentPlan,
            JSON.stringify(parseStoredJson(analysis.aiResults, null)),
            JSON.stringify(parseStoredJson(analysis.offlineResults, null)),
            analysis.createdAt, analysis.updatedAt
          );
        }
        for (const sample of data.trainingSamples || []) {
          // approvedForTraining/featureVersion هم باید round-trip شوند؛
          // برای بکاپ‌های قدیمی بدون این فیلدها، همان قاعدهٔ addTrainingSample
          // اعمال می‌شود (نمونهٔ خبره = تأییدشده).
          const approved = sample.approvedForTraining != null
            ? (sample.approvedForTraining ? 1 : 0)
            : (sample.labelSource === 'expert' ? 1 : 0);
          db.prepare(`
            INSERT INTO training_samples (id, clientId, galleryItemId, imageThumbnail, features, label, labelSource, confidence, usedInTraining, modelVersionTrainedWith, createdAt, approvedForTraining, featureVersion, questionnaireFeatures)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            sample.id, sample.clientId || null, sample.galleryItemId || null, sample.imageThumbnail || null,
            JSON.stringify(parseStoredJson(sample.features, {})), JSON.stringify(parseStoredJson(sample.label, {})), sample.labelSource || null,
            sample.confidence ?? null, sample.usedInTraining ? 1 : 0, sample.modelVersionTrainedWith ?? null,
            sample.createdAt || new Date().toISOString(),
            approved, sample.featureVersion || null,
            sample.questionnaireFeatures != null ? JSON.stringify(sample.questionnaireFeatures) : null,
          );
        }
        if (data.localModelMetadata) {
          db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('localModelMetadata', JSON.stringify(data.localModelMetadata));
        }
        db.prepare(`
          INSERT INTO settings (key, value) VALUES ('settings', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(JSON.stringify(settingsToStore));
      });
      importTransaction();
    } catch (error) {
      for (const filePath of createdFiles) deleteImageFile(filePath);
      throw error;
    }
    for (const item of previousGallery) deleteImageFile(item.filePath);
    return { success: true };
  };

  function mapQuestionnaireRevisionRow(row) {
    return {
      id: row.id,
      clientId: row.clientId,
      sessionId: row.sessionId,
      status: row.status,
      values: parseStoredJson(row.valuesJson, {}),
      changedFields: parseStoredJson(row.changedFieldsJson, []),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  return {
    /**
     * پردازش متدهای دیتابیس
     * @param {string} method
     * @param {object} params
     * @returns {any}
     */
    async handleDbQuery(method, params = {}) {
      if (!db) return { error: 'Database not initialized' };

      try {
        switch (method) {
          // =============== Clients ===============
          case 'getClients': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const limit = params.limit || 20;
            const offset = params.offset || 0;
            const search = (params.search || '').trim();
            // ردیف مشتری سیستمی (استخر آموزشی) هرگز در فهرست مشتریان واقعی دیده نمی‌شود
            if (search) {
              const like = `%${search}%`;
              const sql = 'SELECT * FROM clients WHERE (isSystemRecord IS NULL OR isSystemRecord = 0) AND (firstName LIKE ? OR lastName LIKE ? OR phone LIKE ?) ORDER BY createdAt DESC'
                + (hasLimit ? ' LIMIT ? OFFSET ?' : '');
              return hasLimit
                ? db.prepare(sql).all(like, like, like, limit, offset)
                : db.prepare(sql).all(like, like, like);
            }
            const sql = 'SELECT * FROM clients WHERE (isSystemRecord IS NULL OR isSystemRecord = 0) ORDER BY createdAt DESC' + (hasLimit ? ' LIMIT ? OFFSET ?' : '');
            return hasLimit ? db.prepare(sql).all(limit, offset) : db.prepare(sql).all();
          }

          case 'getClientsCount': {
            const search = (params.search || '').trim();
            if (search) {
              const like = `%${search}%`;
              const result = db.prepare(
                'SELECT COUNT(*) as count FROM clients WHERE (isSystemRecord IS NULL OR isSystemRecord = 0) AND (firstName LIKE ? OR lastName LIKE ? OR phone LIKE ?)'
              ).get(like, like, like);
              return result.count;
            }
            const result = db.prepare(
              'SELECT COUNT(*) as count FROM clients WHERE (isSystemRecord IS NULL OR isSystemRecord = 0)'
            ).get();
            return result.count;
          }

          case 'getClient':
            return db.prepare('SELECT * FROM clients WHERE id = ?').get(params.id);

          case 'createClient': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO clients (id, firstName, lastName, phone, email, gender, birthDate, notes, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, params.firstName, params.lastName, params.phone, params.email, params.gender, params.birthDate, params.notes, now, now);
            return { id, ...params, createdAt: now, updatedAt: now };
          }

          case 'updateClient': {
            const now = new Date().toISOString();
            const existingClient = db.prepare('SELECT * FROM clients WHERE id = ?').get(params.id);
            if (!existingClient) throw new Error('Client not found');
            const merged = { ...existingClient, ...params };
            db.prepare(`
              UPDATE clients SET firstName=?, lastName=?, phone=?, email=?, gender=?, birthDate=?, notes=?, updatedAt=?
              WHERE id=?
            `).run(merged.firstName, merged.lastName, merged.phone, merged.email, merged.gender, merged.birthDate, merged.notes, now, params.id);
            return { ...merged, updatedAt: now };
          }

          case 'deleteClient': {
            // کلاینت سیستمی (استخر آموزشی) هرگز از این مسیر حذف نمی‌شود — همراهش
            // تمام عکس‌ها/نمونه‌های آموزشی مشترک هم پاک می‌شدند.
            if (params.id === SYSTEM_TRAINING_POOL_CLIENT_ID) {
              throw new Error('System training-pool client cannot be deleted');
            }
            // ترتیب مهم است: اول ردیف‌ها داخل یک تراکنش اتمیک حذف می‌شوند و فایل‌ها
            // فقط بعد از موفقیت تراکنش پاک می‌شوند. قبلاً اگر حذف دیتابیس وسط کار
            // شکست می‌خورد، فایل‌ها از دست رفته بودند ولی رکوردها باقی می‌ماندند.
            const galleryItems = db.prepare('SELECT filePath FROM gallery WHERE clientId = ? AND filePath IS NOT NULL').all(params.id);

            const deleteClientTx = db.transaction((clientId) => {
              db.prepare('DELETE FROM gallery WHERE clientId = ?').run(clientId);
              db.prepare('DELETE FROM sessions WHERE clientId = ?').run(clientId);
              db.prepare('DELETE FROM analyses WHERE clientId = ?').run(clientId);
              db.prepare('DELETE FROM training_samples WHERE clientId = ?').run(clientId);
              db.prepare('DELETE FROM questionnaire_revisions WHERE clientId = ?').run(clientId);
              db.prepare('DELETE FROM clients WHERE id = ?').run(clientId);
            });
            deleteClientTx(params.id);

            for (const item of galleryItems) {
              deleteImageFile(item.filePath);
            }
            // حذف پوشه مشتری — فقط اگر مسیر resolve‌شده واقعاً زیر پوشهٔ images بماند
            // (تا id دستکاری‌شده مثل «..» نتواند پوشهٔ دیگری را پاک کند)
            const clientImagesPath = path.resolve(imagesPath, String(params.id));
            if (clientImagesPath.startsWith(imagesPath + path.sep) && fs.existsSync(clientImagesPath)) {
              fs.rmSync(clientImagesPath, { recursive: true, force: true });
            }
            return { success: true };
          }

          // =============== Gallery ===============
          case 'getGalleryByClient': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const limit = params.limit || 20;
            const offset = params.offset || 0;
            const sql = 'SELECT * FROM gallery WHERE clientId = ? ORDER BY createdAt DESC' + (hasLimit ? ' LIMIT ? OFFSET ?' : '');
            const rows = hasLimit
              ? db.prepare(sql).all(params.clientId, limit, offset)
              : db.prepare(sql).all(params.clientId);
            return rows.map(toListGalleryRow);
          }

          case 'getAllGallery': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const limit = params.limit || 20;
            const offset = params.offset || 0;
            // گالری کلاینت سیستمی (استخر آموزشی) از گالری عمومی/همه‌مشتریان مستثناست
            const sql = 'SELECT * FROM gallery WHERE clientId != ? ORDER BY createdAt DESC' + (hasLimit ? ' LIMIT ? OFFSET ?' : '');
            const rows = hasLimit
              ? db.prepare(sql).all(SYSTEM_TRAINING_POOL_CLIENT_ID, limit, offset)
              : db.prepare(sql).all(SYSTEM_TRAINING_POOL_CLIENT_ID);
            return rows.map(toListGalleryRow);
          }

          case 'getGalleryCount': {
            const result = params.clientId
              ? db.prepare('SELECT COUNT(*) as count FROM gallery WHERE clientId = ?').get(params.clientId)
              : db.prepare('SELECT COUNT(*) as count FROM gallery WHERE clientId != ?').get(SYSTEM_TRAINING_POOL_CLIENT_ID);
            return result.count;
          }

          case 'getGalleryPage': {
            const clauses = ['g.clientId != ?'];
            const values = [SYSTEM_TRAINING_POOL_CLIENT_ID];
            if (params.clientId) { clauses.push('g.clientId = ?'); values.push(params.clientId); }
            if (params.type) { clauses.push('g.type = ?'); values.push(params.type); }
            if (params.search) { clauses.push('(c.firstName LIKE ? OR c.lastName LIKE ? OR c.phone LIKE ?)'); const like = `%${params.search}%`; values.push(like, like, like); }
            if (params.startDate) { clauses.push('g.createdAt >= ?'); values.push(params.startDate); }
            if (params.endDate) { clauses.push('g.createdAt <= ?'); values.push(params.endDate); }
            if (params.regionId) { clauses.push('g.metadata LIKE ?'); values.push(`%"scalpRegion":"${params.regionId}"%`); }
            if (params.trichoscopeMode) { clauses.push('g.metadata LIKE ?'); values.push(`%"trichoscopeMode":"${params.trichoscopeMode}"%`); }
            const hasLimit = params.limit !== undefined && params.limit !== null;
            let sql = `SELECT g.* FROM gallery g LEFT JOIN clients c ON c.id = g.clientId WHERE ${clauses.join(' AND ')} ORDER BY g.createdAt DESC`;
            if (hasLimit) { sql += ' LIMIT ? OFFSET ?'; values.push(params.limit, params.offset || 0); }
            return db.prepare(sql).all(...values).map(toListGalleryRow);
          }

          case 'getGalleryPageCount': {
            const clauses = ['g.clientId != ?'];
            const values = [SYSTEM_TRAINING_POOL_CLIENT_ID];
            if (params.clientId) { clauses.push('g.clientId = ?'); values.push(params.clientId); }
            if (params.type) { clauses.push('g.type = ?'); values.push(params.type); }
            if (params.search) { clauses.push('(c.firstName LIKE ? OR c.lastName LIKE ? OR c.phone LIKE ?)'); const like = `%${params.search}%`; values.push(like, like, like); }
            if (params.startDate) { clauses.push('g.createdAt >= ?'); values.push(params.startDate); }
            if (params.endDate) { clauses.push('g.createdAt <= ?'); values.push(params.endDate); }
            if (params.regionId) { clauses.push('g.metadata LIKE ?'); values.push(`%"scalpRegion":"${params.regionId}"%`); }
            if (params.trichoscopeMode) { clauses.push('g.metadata LIKE ?'); values.push(`%"trichoscopeMode":"${params.trichoscopeMode}"%`); }
            return db.prepare(`SELECT COUNT(*) as count FROM gallery g LEFT JOIN clients c ON c.id = g.clientId WHERE ${clauses.join(' AND ')}`).get(...values).count;
          }

          case 'getTrainingPoolItems': {
            const status = params.status === 'completed' ? 'completed' : 'active';
            const clauses = ['clientId = ?', status === 'active' ? "(trainingPoolStatus IS NULL OR trainingPoolStatus = 'active')" : 'trainingPoolStatus = ?'];
            const values = [SYSTEM_TRAINING_POOL_CLIENT_ID];
            if (status === 'completed') values.push(status);
            if (params.startDate) { clauses.push('createdAt >= ?'); values.push(params.startDate); }
            if (params.endDate) { clauses.push('createdAt <= ?'); values.push(params.endDate); }
            if (params.regionId) { clauses.push("metadata LIKE ?"); values.push(`%"scalpRegion":"${params.regionId}"%`); }
            const hasLimit = params.limit !== undefined && params.limit !== null;
            let sql = `SELECT * FROM gallery WHERE ${clauses.join(' AND ')} ORDER BY createdAt DESC`;
            if (hasLimit) { sql += ' LIMIT ? OFFSET ?'; values.push(params.limit, params.offset || 0); }
            return db.prepare(sql).all(...values).map(toListGalleryRow);
          }

          case 'getTrainingPoolItemsCount': {
            const status = params.status === 'completed' ? 'completed' : 'active';
            const clauses = ['clientId = ?', status === 'active' ? "(trainingPoolStatus IS NULL OR trainingPoolStatus = 'active')" : 'trainingPoolStatus = ?'];
            const values = [SYSTEM_TRAINING_POOL_CLIENT_ID];
            if (status === 'completed') values.push(status);
            if (params.startDate) { clauses.push('createdAt >= ?'); values.push(params.startDate); }
            if (params.endDate) { clauses.push('createdAt <= ?'); values.push(params.endDate); }
            if (params.regionId) { clauses.push('metadata LIKE ?'); values.push(`%"scalpRegion":"${params.regionId}"%`); }
            return db.prepare(`SELECT COUNT(*) as count FROM gallery WHERE ${clauses.join(' AND ')}`).get(...values).count;
          }

          case 'updateTrainingPoolItemStatus': {
            if (!['active', 'completed'].includes(params.status)) throw new Error('Invalid training pool status');
            const result = db.prepare('UPDATE gallery SET trainingPoolStatus = ? WHERE id = ? AND clientId = ?').run(params.status, params.id, SYSTEM_TRAINING_POOL_CLIENT_ID);
            if (!result.changes) throw new Error('Training pool item not found');
            return { success: true };
          }

          case 'getGalleryItemDataUrl': {
            const row = db.prepare('SELECT url, filePath FROM gallery WHERE id = ?').get(params.id);
            if (!row) return null;
            if (row.filePath) {
              const full = readImageAsBase64(row.filePath);
              if (full) return full;
            }
            return row.url && row.url.startsWith('data:') ? row.url : null;
          }

          case 'addGalleryItem': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();

            let url = params.url;
            let filePath = null;

            // ذخیره تصویر/ویدیو در فایل سیستم به جای دیتابیس
            if (params.url && params.url.startsWith('data:')) {
              filePath = saveImageToFile(params.url, params.clientId);
              url = `file://${filePath}`; // ذخیره مسیر به جای base64
            }

            db.prepare(`
              INSERT INTO gallery (id, clientId, type, url, thumbnail, filename, metadata, filePath, trainingPoolStatus, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, params.clientId, params.type, url, params.thumbnail, params.filename, JSON.stringify(params.metadata || {}), filePath,
              params.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID ? (params.trainingPoolStatus || 'active') : null, now);

            // بازگرداندن URL اصلی برای نمایش فوری
            return { id, ...params, url: params.url, filePath, trainingPoolStatus: params.clientId === SYSTEM_TRAINING_POOL_CLIENT_ID ? (params.trainingPoolStatus || 'active') : undefined, createdAt: now };
          }

          case 'deleteGalleryItem': {
            // حذف فایل تصویر
            const item = db.prepare('SELECT * FROM gallery WHERE id = ?').get(params.id);
            if (item && item.filePath) {
              deleteImageFile(item.filePath);
            }
            db.prepare('DELETE FROM gallery WHERE id = ?').run(params.id);
            return { success: true };
          }

          // =============== Sessions ===============
          case 'getSessions': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const sql = 'SELECT * FROM sessions ORDER BY date DESC, time DESC' + (hasLimit ? ' LIMIT ? OFFSET ?' : '');
            return hasLimit
              ? db.prepare(sql).all(params.limit, params.offset || 0)
              : db.prepare(sql).all();
          }

          case 'getSessionsCount':
            return db.prepare('SELECT COUNT(*) as count FROM sessions').get().count;

          case 'getSessionsByClient':
            return db.prepare('SELECT * FROM sessions WHERE clientId = ? ORDER BY date DESC').all(params.clientId);

          case 'createSession': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO sessions (id, clientId, trichologistId, date, time, status, notes, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, params.clientId, params.trichologistId, params.date, params.time, params.status, params.notes, now);
            return { id, ...params, createdAt: now };
          }

          case 'updateSession': {
            const existingSession = db.prepare('SELECT * FROM sessions WHERE id = ?').get(params.id);
            if (!existingSession) throw new Error('Session not found');
            const merged = { ...existingSession, ...params };
            db.prepare(`
              UPDATE sessions SET clientId=?, trichologistId=?, date=?, time=?, status=?, notes=?
              WHERE id=?
            `).run(merged.clientId, merged.trichologistId, merged.date, merged.time, merged.status, merged.notes, params.id);
            return merged;
          }

          case 'deleteSession': {
            const deleteSessionTx = db.transaction((sessionId) => {
              // پرسشنامهٔ آن مراجعه بدون نوبت بی‌معناست — همراه نوبت حذف می‌شود
              db.prepare('DELETE FROM questionnaire_revisions WHERE sessionId = ?').run(sessionId);
              db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
            });
            deleteSessionTx(params.id);
            return { success: true };
          }

          // =============== Questionnaire Revisions ===============
          case 'getQuestionnaireRevisionsByClient': {
            const rows = db.prepare(
              'SELECT * FROM questionnaire_revisions WHERE clientId = ? ORDER BY updatedAt DESC'
            ).all(params.clientId);
            return rows.map(mapQuestionnaireRevisionRow);
          }

          case 'getQuestionnaireRevision': {
            const row = db.prepare(
              'SELECT * FROM questionnaire_revisions WHERE clientId = ? AND sessionId = ?'
            ).get(params.clientId, params.sessionId);
            return row ? mapQuestionnaireRevisionRow(row) : null;
          }

          case 'getPreviousFinalQuestionnaireRevision': {
            // آخرین final به‌جز نوبت جاری — برای Diff و پیش‌بارگذاری مراجعهٔ جدید
            const rows = params.excludeSessionId
              ? db.prepare(`
                  SELECT * FROM questionnaire_revisions
                  WHERE clientId = ? AND status = 'final' AND sessionId != ?
                  ORDER BY updatedAt DESC LIMIT 1
                `).all(params.clientId, params.excludeSessionId)
              : db.prepare(`
                  SELECT * FROM questionnaire_revisions
                  WHERE clientId = ? AND status = 'final'
                  ORDER BY updatedAt DESC LIMIT 1
                `).all(params.clientId);
            return rows[0] ? mapQuestionnaireRevisionRow(rows[0]) : null;
          }

          case 'saveQuestionnaireRevision': {
            const now = new Date().toISOString();
            const valuesJson = JSON.stringify(params.values || {});
            const existing = db.prepare(
              'SELECT * FROM questionnaire_revisions WHERE clientId = ? AND sessionId = ?'
            ).get(params.clientId, params.sessionId);
            if (existing) {
              const status = params.status || existing.status;
              const changedFieldsJson = params.changedFields !== undefined
                ? JSON.stringify(params.changedFields || [])
                : existing.changedFieldsJson;
              db.prepare(
                'UPDATE questionnaire_revisions SET valuesJson = ?, status = ?, changedFieldsJson = ?, updatedAt = ? WHERE id = ?'
              ).run(valuesJson, status, changedFieldsJson, now, existing.id);
              return mapQuestionnaireRevisionRow({
                ...existing,
                status,
                valuesJson,
                changedFieldsJson,
                updatedAt: now,
              });
            }
            const id = crypto.randomUUID();
            const status = params.status || 'draft';
            const changedFieldsJson = params.changedFields !== undefined
              ? JSON.stringify(params.changedFields || [])
              : null;
            db.prepare(`
              INSERT INTO questionnaire_revisions (id, clientId, sessionId, status, valuesJson, changedFieldsJson, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, params.clientId, params.sessionId, status, valuesJson, changedFieldsJson, now, now);
            return {
              id,
              clientId: params.clientId,
              sessionId: params.sessionId,
              status,
              values: params.values || {},
              changedFields: params.changedFields || [],
              createdAt: now,
              updatedAt: now,
            };
          }

          // =============== Trichologists ===============
          case 'getTrichologists': {
            const rows = db.prepare('SELECT * FROM trichologists').all();
            return rows.map(r => ({ ...r, active: !!r.active }));
          }

          case 'createTrichologist': {
            const id = crypto.randomUUID();
            db.prepare(`
              INSERT INTO trichologists (id, name, specialty, phone, email, description, active)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(id, params.name, params.specialty, params.phone, params.email, params.description, params.active ? 1 : 0);
            return { id, ...params };
          }

          case 'updateTrichologist': {
            const existingTrichologist = db.prepare('SELECT * FROM trichologists WHERE id = ?').get(params.id);
            if (!existingTrichologist) throw new Error('Trichologist not found');
            const merged = { ...existingTrichologist, active: !!existingTrichologist.active, ...params };
            db.prepare(`
              UPDATE trichologists SET name=?, specialty=?, phone=?, email=?, description=?, active=?
              WHERE id=?
            `).run(merged.name, merged.specialty, merged.phone, merged.email, merged.description, merged.active ? 1 : 0, params.id);
            return merged;
          }

          case 'deleteTrichologist':
            db.prepare('DELETE FROM trichologists WHERE id = ?').run(params.id);
            return { success: true };

          // =============== Analyses ===============
          case 'getAnalyses': {
            const hasLimit = params.limit !== undefined && params.limit !== null;
            const sql = 'SELECT * FROM analyses ORDER BY createdAt DESC' + (hasLimit ? ' LIMIT ? OFFSET ?' : '');
            const rows = hasLimit
              ? db.prepare(sql).all(params.limit, params.offset || 0)
              : db.prepare(sql).all();
            // تصاویر annotate‌شده حذف می‌شوند — با getAnalysisAnnotatedImage خوانده می‌شوند
            return rows.map(r => toListAnalysisRow({
              ...r,
              medicalQuestionnaire: parseStoredJson(r.medicalQuestionnaire, undefined),
              observations: parseStoredJson(r.observations, undefined),
              aiResults: parseStoredJson(r.aiResults, undefined),
              offlineResults: parseStoredJson(r.offlineResults, undefined),
            }));
          }

          case 'getAnalysesCount':
            return db.prepare('SELECT COUNT(*) as count FROM analyses').get().count;

          case 'getAnalysesByClient': {
            const rows = db.prepare('SELECT * FROM analyses WHERE clientId = ? ORDER BY createdAt DESC').all(params.clientId);
            return rows.map(r => toListAnalysisRow({
              ...r,
              medicalQuestionnaire: parseStoredJson(r.medicalQuestionnaire, undefined),
              observations: parseStoredJson(r.observations, undefined),
              aiResults: parseStoredJson(r.aiResults, undefined),
              offlineResults: parseStoredJson(r.offlineResults, undefined),
            }));
          }

          /**
           * تصویر annotate‌شدهٔ یک تحلیل — on-demand.
           * لیست‌ها فقط پرچم hasAnnotatedImage دارند تا payload سبک بماند.
           */
          case 'getAnalysisAnnotatedImage': {
            const row = db.prepare('SELECT aiResults, offlineResults FROM analyses WHERE id = ?').get(params.id);
            if (!row) return null;
            const ai = parseStoredJson(row.aiResults, null);
            if (ai && ai.annotatedImageBase64) return ai.annotatedImageBase64;
            const off = parseStoredJson(row.offlineResults, null);
            if (off && off.annotatedImageBase64) return off.annotatedImageBase64;
            return null;
          }

          case 'createAnalysis': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            db.prepare(`
              INSERT INTO analyses (id, clientId, sessionId, trichologistId, type, galleryItemId, medicalQuestionnaire, observations, recommendations, treatmentPlan, aiResults, offlineResults, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              id, params.clientId, params.sessionId || null, params.trichologistId, params.type, params.galleryItemId,
              JSON.stringify(params.medicalQuestionnaire || {}),
              JSON.stringify(params.observations || []),
              params.recommendations, params.treatmentPlan,
              JSON.stringify(params.aiResults || null),
              JSON.stringify(params.offlineResults || null),
              now, now
            );
            return { id, ...params, createdAt: now, updatedAt: now };
          }

          case 'updateAnalysis': {
            const now = new Date().toISOString();
            const existingRow = db.prepare('SELECT * FROM analyses WHERE id = ?').get(params.id);
            if (!existingRow) throw new Error('Analysis not found');
            const existingParsed = {
              ...existingRow,
              medicalQuestionnaire: parseStoredJson(existingRow.medicalQuestionnaire, {}),
              observations: parseStoredJson(existingRow.observations, []),
              aiResults: parseStoredJson(existingRow.aiResults, null),
              offlineResults: parseStoredJson(existingRow.offlineResults, null),
            };
            const merged = { ...existingParsed, ...params };
            db.prepare(`
              UPDATE analyses SET medicalQuestionnaire=?, observations=?, recommendations=?, treatmentPlan=?, aiResults=?, offlineResults=?, updatedAt=?
              WHERE id=?
            `).run(
              JSON.stringify(merged.medicalQuestionnaire || {}),
              JSON.stringify(merged.observations || []),
              merged.recommendations, merged.treatmentPlan,
              JSON.stringify(merged.aiResults || null),
              JSON.stringify(merged.offlineResults || null),
              now, params.id
            );
            return { ...merged, updatedAt: now };
          }

          case 'deleteAnalysis':
            db.prepare('DELETE FROM analyses WHERE id = ?').run(params.id);
            return { success: true };

          // =============== Settings (با رمزنگاری API Key) ===============
          case 'getSettings': {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
            if (!row) return { language: 'fa', theme: 'mint', aiConfidenceThreshold: 0.7, hasPassword: false, hasApiKey: false };

            const settings = JSON.parse(row.value);
            // کلید API را decrypt نمی‌کنیم — فقط hasApiKey به renderer می‌رود
            return sanitizeSettings(settings);
          }

          case 'updateSettings': {
            const current = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
            const currentSettings = current ? JSON.parse(current.value) : {};
            // فیلدهای مشتق‌شده از renderer نباید در دیتابیس ذخیره شوند
            const { hasPassword: _hp, hasApiKey: _hak, passwordHash: _ph, ...safeParams } = params;
            const updated = { ...currentSettings, ...safeParams };

            if (params.aiApiKey) {
              updated.aiApiKey = encryptValue(params.aiApiKey);
            }

            if (params.password) {
              if (String(params.password).length < MIN_PASSWORD_LENGTH) {
                throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
              }
              updated.passwordHash = hashPasswordScrypt(params.password);
              delete updated.password;
            }

            // UPSERT: اگر ردیف settings به هر دلیلی وجود نداشته باشد، UPDATE خالی
            // «موفق» گزارش می‌شد ولی چیزی ذخیره نمی‌شد.
            db.prepare(`
              INSERT INTO settings (key, value) VALUES ('settings', ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `).run(JSON.stringify(updated));
            return sanitizeSettings({ ...updated });
          }

          case 'verifyCredentials': {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
            if (!row) return false;
            const settings = JSON.parse(row.value);
            if (params.username !== settings.username) return false;
            const stored = settings.passwordHash || settings.password;

            if (verifyPassword(params.password, stored)) return true;

            // مهاجرت یک‌بارهٔ پسورد متن‌سادهٔ legacy → scrypt
            if (isLegacyPlaintextPassword(stored) && verifyLegacyPlaintextPassword(params.password, stored)) {
              settings.passwordHash = hashPasswordScrypt(params.password);
              delete settings.password;
              db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(settings), 'settings');
              return true;
            }
            return false;
          }

          case 'hasCredentials': {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
            if (!row) return false;
            const settings = JSON.parse(row.value);
            return !!(settings.username && (settings.passwordHash || settings.password));
          }

          // =============== Export/Import ===============
          case 'exportData': {
            const rawSettings = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('settings')?.value || '{}');
            const trainingSamplesRows = db.prepare('SELECT * FROM training_samples').all().map(r => ({
              ...r,
              features: parseStoredJson(r.features, {}),
              label: parseStoredJson(r.label, {}),
              questionnaireFeatures: parseStoredJson(r.questionnaireFeatures, undefined),
              usedInTraining: !!r.usedInTraining,
            }));
            const modelMetadataRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('localModelMetadata');
            const galleryRows = db.prepare('SELECT * FROM gallery').all().map(item => {
              // محتوای رسانه (عکس یا ویدیو) به‌صورت data URL داخل بکاپ قرار می‌گیرد
              // تا فایل بکاپ به‌تنهایی قابل انتقال به سیستم دیگر باشد.
              const imageData = item.filePath
                ? readImageAsBase64(item.filePath)
                : (item.url?.startsWith('data:') ? item.url : null);
              const { filePath, ...portableItem } = item;
              return {
                ...portableItem,
                metadata: parseStoredJson(item.metadata, {}),
                imageData,
              };
            });
            const analysisRows = db.prepare('SELECT * FROM analyses').all().map(analysis => ({
              ...analysis,
              medicalQuestionnaire: parseStoredJson(analysis.medicalQuestionnaire, {}),
              observations: parseStoredJson(analysis.observations, []),
              aiResults: parseStoredJson(analysis.aiResults, null),
              offlineResults: parseStoredJson(analysis.offlineResults, null),
            }));
            const questionnaireRows = db.prepare('SELECT * FROM questionnaire_revisions').all().map(mapQuestionnaireRevisionRow);
            const data = {
              clients: db.prepare('SELECT * FROM clients').all(),
              gallery: galleryRows,
              sessions: db.prepare('SELECT * FROM sessions').all(),
              trichologists: db.prepare('SELECT * FROM trichologists').all(),
              analyses: analysisRows,
              settings: sanitizeSettingsForBackup(rawSettings),
              trainingSamples: trainingSamplesRows,
              localModelMetadata: modelMetadataRow ? JSON.parse(modelMetadataRow.value) : null,
              questionnaireRevisions: questionnaireRows,
            };
            return JSON.stringify(createBackupEnvelope(data), null, 2);
          }

          // =============== بکاپ نسخهٔ ۳: بستهٔ پوشه‌ای استریمی (فاز ۰.۵) ===============
          /**
           * exportData کلاسیک (v2) همهٔ رسانه را base64 داخل یک رشتهٔ JSON
           * یک‌باره در حافظهٔ main می‌ساخت — با دادهٔ واقعی کلینیک (صدها عکس
           * چندمگابایتی + ویدیو) تضمین‌شده به کرش می‌انجامد. این مسیر رسانه را
           * به‌صورت فایل خام در media/ با کپی استریمی می‌نویسد و data.json فقط
           * فرادادهٔ سبک است. خروجی JSON کلاسیک (exportData) برای سازگاری عقب‌رو
           * و نسخهٔ وب دست‌نخورده می‌ماند.
           */
          case 'exportBackupPackage': {
            const baseDir = params.baseDir;
            if (!baseDir || typeof baseDir !== 'string' || !fs.existsSync(baseDir)) {
              return { error: 'Backup directory does not exist' };
            }
            const pkgDir = path.join(baseDir, packageDirName());
            const mediaDir = path.join(pkgDir, MEDIA_DIR_NAME);
            try {
              fs.mkdirSync(mediaDir, { recursive: true });

              // — گالری: فایل رسانهٔ روی دیسک → کپی استریمی به media/<id>.<ext>
              const packageGallery = [];
              for (const item of db.prepare('SELECT * FROM gallery').all()) {
                const { filePath, ...portable } = item;
                let mediaFile = null;
                if (filePath && fs.existsSync(filePath)) {
                  const ext = path.extname(filePath).slice(1) || 'bin';
                  mediaFile = `${MEDIA_DIR_NAME}/${safeFileBase(item.id)}.${ext}`;
                  await copyFileStreaming(filePath, path.join(mediaDir, `${safeFileBase(item.id)}.${ext}`));
                }
                // thumbnail هم یک کش base64 (حجم کم ولی با صدها ردیف انباشته
                // می‌شود) — آن هم فایل جدا می‌شود تا data.json واقعاً سبک بماند.
                // برای ویدیوها thumbnail بازتولید خودکار ندارد، پس حذفش نمی‌کنیم.
                let thumbnailRef = null;
                const parsedThumb = item.thumbnail ? parseDataUrl(item.thumbnail) : null;
                if (parsedThumb) {
                  const thumbName = `thumb-gallery-${safeFileBase(item.id)}.${parsedThumb.extension}`;
                  fs.writeFileSync(path.join(mediaDir, thumbName), Buffer.from(parsedThumb.base64, 'base64'));
                  thumbnailRef = `${MEDIA_DIR_NAME}/${thumbName}`;
                }
                packageGallery.push({
                  ...portable,
                  metadata: parseStoredJson(item.metadata, {}),
                  // محتوای legacyِ بدون فایل (data URL در url) همچنان inline می‌ماند
                  url: item.url?.startsWith('data:') ? item.url : null,
                  thumbnail: thumbnailRef ? null : item.thumbnail,
                  mediaFile,
                  thumbnailRef,
                });
              }

              // — تحلیل‌ها: تصویر annotate‌شدهٔ base64 → فایل PNG مستقل در media/
              const packageAnalyses = db.prepare('SELECT * FROM analyses').all().map(row => ({
                ...row,
                medicalQuestionnaire: parseStoredJson(row.medicalQuestionnaire, {}),
                observations: parseStoredJson(row.observations, []),
                aiResults: parseStoredJson(row.aiResults, null),
                offlineResults: parseStoredJson(row.offlineResults, null),
              })).map((analysis) => {
                const aiExtract = extractAnnotatedImage(analysis.aiResults, `analysis-${safeFileBase(analysis.id)}-ai`);
                if (aiExtract.buffer) {
                  fs.writeFileSync(path.join(mediaDir, aiExtract.mediaFileName), aiExtract.buffer);
                }
                const offlineExtract = extractAnnotatedImage(analysis.offlineResults, `analysis-${safeFileBase(analysis.id)}-offline`);
                if (offlineExtract.buffer) {
                  fs.writeFileSync(path.join(mediaDir, offlineExtract.mediaFileName), offlineExtract.buffer);
                }
                return { ...analysis, aiResults: aiExtract.result, offlineResults: offlineExtract.result };
              });

              // — نمونه‌های آموزشی: thumbnail → فایل مستقل در media/
              const packageSamples = db.prepare('SELECT * FROM training_samples').all().map(r => ({
                ...r,
                features: parseStoredJson(r.features, {}),
                label: parseStoredJson(r.label, {}),
                questionnaireFeatures: parseStoredJson(r.questionnaireFeatures, undefined),
                usedInTraining: !!r.usedInTraining,
              })).map((sample) => {
                const parsedThumb = sample.imageThumbnail ? parseDataUrl(sample.imageThumbnail) : null;
                if (!parsedThumb) return sample;
                const fileName = `thumb-${safeFileBase(sample.id)}.${parsedThumb.extension}`;
                const { imageThumbnail, ...rest } = sample;
                fs.writeFileSync(
                  path.join(mediaDir, fileName),
                  Buffer.from(parsedThumb.base64, 'base64'),
                );
                return { ...rest, thumbnailRef: `${MEDIA_DIR_NAME}/${fileName}` };
              });

              const rawSettings = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('settings')?.value || '{}');
              const modelMetadataRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('localModelMetadata');
              const data = {
                clients: db.prepare('SELECT * FROM clients').all(),
                gallery: packageGallery,
                sessions: db.prepare('SELECT * FROM sessions').all(),
                trichologists: db.prepare('SELECT * FROM trichologists').all(),
                analyses: packageAnalyses,
                settings: sanitizeSettingsForBackup(rawSettings),
                trainingSamples: packageSamples,
                localModelMetadata: modelMetadataRow ? JSON.parse(modelMetadataRow.value) : null,
                questionnaireRevisions: db.prepare('SELECT * FROM questionnaire_revisions').all().map(mapQuestionnaireRevisionRow),
              };
              fs.writeFileSync(
                path.join(pkgDir, 'data.json'),
                JSON.stringify(createPackageEnvelope(data), null, 2),
              );
              return { path: pkgDir, name: path.basename(pkgDir) };
            } catch (error) {
              // بستهٔ نیمه‌تمام نباید به‌اشتباه «بکاپ کامل» تلقی شود — در خطا پاک می‌شود
              try { fs.rmSync(pkgDir, { recursive: true, force: true }); } catch { /* ignore */ }
              throw error;
            }
          }

          case 'importData': {
            const data = parseBackupPayload(params.jsonData);
            const clientIds = new Set((data.clients || []).map(c => c.id));
            return executeImport(data, (createdFiles) => {
              return dropOrphanRows(data.gallery, 'gallery', clientIds).map(item => {
                const imageData = item.imageData || (item.url?.startsWith('data:') ? item.url : null);
                if (!imageData) return { ...item, filePath: null };
                const filePath = saveImageToFile(imageData, item.clientId);
                createdFiles.push(filePath);
                return { ...item, url: `file://${filePath}`, filePath };
              });
            });
          }

          // =============== واردکردن بستهٔ پوشه‌ای v3 (فاز ۰.۵) ===============
          // رسانه از media/ با کپی استریمی (نه base64 در حافظه) به images برمی‌گردد.
          case 'importDataPackage': {
            const pkg = parseBackupPackage(params.dataJsonPath);
            const data = pkg.data;
            const clientIds = new Set((data.clients || []).map(c => c.id));

            // تصاویر annotate‌شده و thumbnailها از media به ستون TEXT (data URL)
            // برمی‌گردند — همان فرمتی که بقیهٔ برنامه انتظار دارد. mime از
            // پسوند واقعی فایل گرفته می‌شود تا jpeg/png هر دو درست برگردند.
            const readMediaAsDataUrl = (ref) => {
              const src = pkg.resolveMedia(ref);
              return readAsBase64DataUrl(src, mimeForExtension(path.extname(src).slice(1)));
            };
            const restoreAnnotated = (resultObj) => {
              if (!resultObj || typeof resultObj !== 'object' || !resultObj.annotatedImageRef) return resultObj;
              const { annotatedImageRef, ...rest } = resultObj;
              return {
                ...rest,
                annotatedImageBase64: readMediaAsDataUrl(annotatedImageRef),
              };
            };
            if (Array.isArray(data.analyses)) {
              data.analyses = data.analyses.map(analysis => ({
                ...analysis,
                aiResults: restoreAnnotated(analysis.aiResults),
                offlineResults: restoreAnnotated(analysis.offlineResults),
              }));
            }
            if (Array.isArray(data.trainingSamples)) {
              data.trainingSamples = data.trainingSamples.map(sample => {
                if (!sample.thumbnailRef) return sample;
                const { thumbnailRef, ...rest } = sample;
                return {
                  ...rest,
                  imageThumbnail: readMediaAsDataUrl(thumbnailRef),
                };
              });
            }

            return executeImport(data, (createdFiles) => {
              return dropOrphanRows(data.gallery, 'gallery', clientIds).map(item => {
                const { mediaFile, thumbnailRef, ...rest } = item;
                const thumbnail = thumbnailRef ? readMediaAsDataUrl(thumbnailRef) : (rest.thumbnail ?? null);
                if (!mediaFile) return { ...rest, thumbnail, filePath: null };
                const src = pkg.resolveMedia(mediaFile);
                const ext = path.extname(mediaFile).slice(1) || 'bin';
                const filePath = saveMediaFileFromPath(src, item.clientId, ext);
                createdFiles.push(filePath);
                return { ...rest, thumbnail, url: `file://${filePath}`, filePath };
              });
            });
          }

          // =============== یادگیری ماشین محلی (Training Samples) ===============
          case 'getTrainingSamples': {
            const rows = db.prepare('SELECT * FROM training_samples ORDER BY createdAt DESC').all();
            return rows.map(r => ({
              ...r,
              features: parseStoredJson(r.features, {}),
              label: parseStoredJson(r.label, {}),
              questionnaireFeatures: parseStoredJson(r.questionnaireFeatures, undefined),
              usedInTraining: !!r.usedInTraining,
              approvedForTraining: r.approvedForTraining == null
                ? r.labelSource === 'expert'
                : !!r.approvedForTraining,
              featureVersion: r.featureVersion || undefined,
            }));
          }

          case 'saveTrainingSampleAndCompletePoolItem': {
            if (!params.galleryItemId || params.clientId !== SYSTEM_TRAINING_POOL_CLIENT_ID) throw new Error('A system training-pool gallery item is required');
            const existing = db.prepare('SELECT id FROM training_samples WHERE galleryItemId = ? LIMIT 1').get(params.galleryItemId);
            if (existing) throw new Error('A training sample already exists for this gallery item');
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const approved = params.approvedForTraining != null ? (params.approvedForTraining ? 1 : 0) : (params.labelSource === 'expert' ? 1 : 0);
            const saveTx = db.transaction(() => {
              db.prepare(`INSERT INTO training_samples (id, clientId, galleryItemId, imageThumbnail, features, label, labelSource, confidence, usedInTraining, modelVersionTrainedWith, createdAt, approvedForTraining, featureVersion, questionnaireFeatures) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)`).run(
                id, params.clientId, params.galleryItemId, params.imageThumbnail || null, JSON.stringify(params.features || {}), JSON.stringify(params.label || {}), params.labelSource, params.confidence ?? null, now, approved, params.featureVersion || null, params.questionnaireFeatures != null ? JSON.stringify(params.questionnaireFeatures) : null,
              );
              const result = db.prepare("UPDATE gallery SET trainingPoolStatus = 'completed' WHERE id = ? AND clientId = ? AND (trainingPoolStatus IS NULL OR trainingPoolStatus = 'active')").run(params.galleryItemId, SYSTEM_TRAINING_POOL_CLIENT_ID);
              if (!result.changes) throw new Error('Training pool item not found or already completed');
            });
            saveTx();
            return { id, ...params, usedInTraining: false, createdAt: now, approvedForTraining: !!approved };
          }

          case 'addTrainingSample': {
            const id = crypto.randomUUID();
            const now = new Date().toISOString();
            const approved = params.approvedForTraining != null
              ? (params.approvedForTraining ? 1 : 0)
              : (params.labelSource === 'expert' ? 1 : 0);
            db.prepare(`
              INSERT INTO training_samples (
                id, clientId, galleryItemId, imageThumbnail, features, label, labelSource,
                confidence, usedInTraining, modelVersionTrainedWith, createdAt,
                approvedForTraining, featureVersion, questionnaireFeatures
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)
            `).run(
              id,
              params.clientId || null,
              params.galleryItemId || null,
              params.imageThumbnail || null,
              JSON.stringify(params.features || {}),
              JSON.stringify(params.label || {}),
              params.labelSource,
              params.confidence ?? null,
              now,
              approved,
              params.featureVersion || null,
              params.questionnaireFeatures != null ? JSON.stringify(params.questionnaireFeatures) : null,
            );
            return {
              id,
              ...params,
              usedInTraining: false,
              createdAt: now,
              approvedForTraining: !!approved,
            };
          }

          case 'updateTrainingSample': {
            const row = db.prepare('SELECT * FROM training_samples WHERE id = ?').get(params.id);
            if (!row) throw new Error('Sample not found');
            const approved = params.approvedForTraining != null
              ? (params.approvedForTraining ? 1 : 0)
              : row.approvedForTraining;
            const featureVersion = params.featureVersion !== undefined
              ? params.featureVersion
              : row.featureVersion;
            const labelJson = params.label !== undefined
              ? JSON.stringify(params.label)
              : row.label;
            const labelSource = params.labelSource !== undefined
              ? params.labelSource
              : row.labelSource;
            const confidence = params.confidence !== undefined
              ? params.confidence
              : row.confidence;
            const usedInTraining = params.usedInTraining != null
              ? (params.usedInTraining ? 1 : 0)
              : row.usedInTraining;
            const clientId = params.clientId !== undefined
              ? (params.clientId || null)
              : row.clientId;
            const galleryItemId = params.galleryItemId !== undefined
              ? (params.galleryItemId || null)
              : row.galleryItemId;
            const questionnaireFeaturesJson = params.questionnaireFeatures !== undefined
              ? (params.questionnaireFeatures != null ? JSON.stringify(params.questionnaireFeatures) : null)
              : row.questionnaireFeatures;
            db.prepare(`
              UPDATE training_samples
              SET approvedForTraining = ?, featureVersion = ?, label = ?, labelSource = ?,
                  confidence = ?, usedInTraining = ?, clientId = ?, galleryItemId = ?,
                  questionnaireFeatures = ?
              WHERE id = ?
            `).run(
              approved,
              featureVersion || null,
              labelJson,
              labelSource,
              confidence ?? null,
              usedInTraining,
              clientId,
              galleryItemId,
              questionnaireFeaturesJson,
              params.id,
            );
            const updated = db.prepare('SELECT * FROM training_samples WHERE id = ?').get(params.id);
            return {
              ...updated,
              features: parseStoredJson(updated.features, {}),
              label: parseStoredJson(updated.label, {}),
              questionnaireFeatures: parseStoredJson(updated.questionnaireFeatures, undefined),
              usedInTraining: !!updated.usedInTraining,
              approvedForTraining: !!updated.approvedForTraining,
              featureVersion: updated.featureVersion || undefined,
              clientId: updated.clientId || undefined,
              galleryItemId: updated.galleryItemId || undefined,
            };
          }

          case 'deleteTrainingSample':
            db.prepare('DELETE FROM training_samples WHERE id = ?').run(params.id);
            return { success: true };

          case 'markTrainingSamplesUsed': {
            const ids = params.ids || [];
            const stmt = db.prepare('UPDATE training_samples SET usedInTraining = 1, modelVersionTrainedWith = ? WHERE id = ?');
            const tx = db.transaction((idList) => {
              for (const sampleId of idList) stmt.run(params.modelVersion, sampleId);
            });
            tx(ids);
            return { success: true };
          }

          case 'getModelMetadata': {
            const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('localModelMetadata');
            return row ? JSON.parse(row.value) : null;
          }

          case 'updateModelMetadata': {
            const existingRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('localModelMetadata');
            const existing = existingRow ? JSON.parse(existingRow.value) : {};
            const merged = { ...existing, ...params };
            if (existingRow) {
              db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(JSON.stringify(merged), 'localModelMetadata');
            } else {
              db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('localModelMetadata', JSON.stringify(merged));
            }
            return merged;
          }

          case 'clearModelMetadata': {
            db.prepare('DELETE FROM settings WHERE key = ?').run('localModelMetadata');
            return { success: true };
          }

          default:
            return { error: 'Unknown method: ' + method };
        }
      } catch (error) {
        logger.error('Database error:', error);
        return { error: error.message };
      }
    },

    // متدهای کمکی
    saveImageToFile,
    readImageAsBase64,
    deleteImageFile,
    encryptValue,
    decryptValue,

    /** فقط برای main process — کلید API را برای ai:analyze/testConnection می‌خواند */
    getDecryptedAiApiKey() {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('settings');
      if (!row) return null;
      const settings = JSON.parse(row.value);
      if (!settings.aiApiKey) return null;
      return decryptValue(settings.aiApiKey);
    },
  };
}

module.exports = { createDbHandlers };
