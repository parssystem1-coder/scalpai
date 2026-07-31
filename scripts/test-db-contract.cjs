/**
 * تست قرارداد DatabaseAdapter روی دو backend الکترون (SQLite + JSON).
 * اجرا: node scripts/test-db-contract.cjs
 *
 * هدف: جلوگیری از drift بین handlerها (cascade حذف، settings UPSERT،
 * ستون‌های training، تم پیش‌فرض، و …).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

// mock ماژول electron قبل از load کردن db-handlers
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      nativeImage: {
        createFromPath: () => ({
          isEmpty: () => true,
          getSize: () => ({ width: 0, height: 0 }),
          resize: () => ({ toJPEG: () => Buffer.alloc(0) }),
        }),
        // موج ۲ (C2): مسیر رمزگشایی‌شده از بافر می‌خواند نه از مسیر فایل
        createFromBuffer: () => ({
          isEmpty: () => true,
          getSize: () => ({ width: 0, height: 0 }),
          resize: () => ({ toJPEG: () => Buffer.alloc(0) }),
        }),
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

const Database = require('better-sqlite3');
const { createDbHandlers } = require('../electron/db-handlers.cjs');
const { createJsonDbHandlers } = require('../electron/db-handlers-json.cjs');
const { createBaseTables, runMigrations, SCHEMA_VERSION } = require('../electron/schema-migrations.cjs');
const { hashPassword, verifyPassword, parseStoredJson } = require('../electron/db-common.cjs');
// موج ۲ (C1.5): قرارداد روی «هر دو حالت» رمزشده/رمزنشده اجرا می‌شود — لایهٔ رمز
// باید برای کل قرارداد شفاف باشد (هیچ assertionی نباید تغییر کند).
const { initDek, _resetForTests } = require('../electron/dek.cjs');
const { FILE_MAGIC, decryptWithPassword } = require('../electron/file-crypto.cjs');

/**
 * فاز ۱ (AUD-9) — پسورد قراردادی این تست برای حالت‌های رمزنگاری‌شده.
 * از این پس وقتی لایهٔ رمز فعال است، ساختن بکاپ بدون پسورد ممنوع است، چون کلید
 * تصاویر داخل خودِ بسته می‌رود و فایل بی‌پسورد معادل دادهٔ باز است.
 */
const CONTRACT_BACKUP_PASSWORD = 'contract-mandatory-pass-123';
const V4_PREFIX = 'scalpai-backup:v4:enc:base64:';
const V3_PREFIX = 'scalpai-backup:v3:base64:';

/**
 * قرارداد cascade از فایل دامنه خوانده می‌شود (نه کپی دستی).
 * چون فایل TypeScript است و این اسکریپت با node خام اجرا می‌شود، فقط
 * لیست رشته‌ها را از متن استخراج می‌کنیم — کافی است چون یک آرایهٔ ثابت است.
 */
const CLIENT_DELETE_CASCADE = (() => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'cascadeRules.ts'), 'utf8');
  const block = src.match(/CLIENT_DELETE_CASCADE = \[([\s\S]*?)\]/);
  if (!block) throw new Error('CLIENT_DELETE_CASCADE در cascadeRules.ts پیدا نشد');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();

const safeStorageMock = {
  isEncryptionAvailable: () => false,
};

/**
 * mock فعال safeStorage برای اجرای حالت رمزشده: wrap/unwrap قطعی (deterministic)
 * تا DEK ساخته‌شده در یک harness در همان اجرا قابل باز شدن باشد.
 */
const safeStorageMockEnabled = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(`mockwrap:${String(text)}`, 'utf-8').toString('base64'),
  decryptString: (buffer) => {
    const raw = Buffer.from(buffer).toString('utf-8');
    if (!raw.startsWith('mockwrap:')) throw new Error('mock unwrap failed');
    return raw.slice('mockwrap:'.length);
  },
};

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createSqliteHarness(label = 'sqlite', safeStorage = safeStorageMock) {
  const dir = makeTempDir('scalpai-sqlite-');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createBaseTables(db);
  runMigrations(db);
  const handlers = createDbHandlers(db, dir, safeStorage);
  return {
    label,
    backend: 'sqlite',
    dir,
    async query(method, params = {}) {
      return handlers.handleDbQuery(method, params);
    },
    close() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

function createJsonHarness(label = 'json', safeStorage = safeStorageMock) {
  const dir = makeTempDir('scalpai-json-');
  const handlers = createJsonDbHandlers(dir, safeStorage);
  return {
    label,
    backend: 'json',
    dir,
    async query(method, params = {}) {
      return handlers.handleDbQuery(method, params);
    },
    close() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function assertOk(result, msg) {
  if (result && typeof result === 'object' && result.error) {
    throw new Error(`${msg}: ${result.error}`);
  }
  return result;
}

async function runContract(harness) {
  const q = harness.query.bind(harness);
  const tag = harness.label;
  const isSqlite = harness.backend === 'sqlite';
  const isEncryptedMode = tag.endsWith('-encrypted');

  /**
   * فاز ۱ (AUD-9): در حالت رمزنگاری‌شده، هر export باید پسورد داشته باشد.
   * این helper پارامترها را متناسب با حالت تکمیل می‌کند تا بقیهٔ قراردادهای
   * تست (مدل، round-trip، audit) بدون بازنویسی معنادار بمانند.
   */
  const withMandatoryPassword = (params = {}) =>
    (isEncryptedMode ? { ...params, backupPassword: CONTRACT_BACKUP_PASSWORD } : params);

  /**
   * خروجی export را به شکل قابل مصرف برای importData/بازرسی برمی‌گرداند.
   * در حالت رمزنگاری‌شده خروجی یک پاکت v4 است؛ این‌جا با همان پسورد باز
   * می‌شود تا assertionهای ساختاری (ZIP/JSON) دقیقاً مثل قبل کار کنند.
   */
  const unwrapExport = (payload, label) => {
    if (!isEncryptedMode) return payload;
    assert.ok(
      typeof payload === 'string' && payload.startsWith(V4_PREFIX),
      `${tag}: ${label} در حالت رمزنگاری‌شده باید پاکت v4 باشد`,
    );
    const bytes = Buffer.from(payload.slice(V4_PREFIX.length), 'base64');
    const inner = decryptWithPassword(bytes, CONTRACT_BACKUP_PASSWORD);
    // بک‌اند sqlite داخل پاکت یک ZIP دارد، بک‌اند JSON یک متن envelope
    return isSqlite ? V3_PREFIX + inner.toString('base64') : inner.toString('utf-8');
  };

  /**
   * فاز ۱ (AUD-9) — قرارداد جدید و صریح: با رمزنگاری فعال، export بدون پسورد
   * باید رد شود. این آزمون منفی است؛ اگر روزی گیت برداشته شود همین‌جا قرمز
   * می‌شود. در حالت غیر رمزنگاری‌شده رفتار قبلی باید دست‌نخورده بماند.
   */
  const gateProbe = await q('exportData', {});
  if (isEncryptedMode) {
    assert.ok(
      gateProbe && typeof gateProbe === 'object' && String(gateProbe.error || '').includes('backup-password-required'),
      `${tag}: با رمزنگاری فعال، exportData بدون پسورد باید backup-password-required بدهد`,
    );
    const fileGateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-gate-'));
    try {
      const gateFileProbe = await q('exportDataToFile', {
        targetPath: path.join(fileGateDir, 'no-password.zip'),
      });
      assert.ok(
        gateFileProbe && typeof gateFileProbe === 'object' && String(gateFileProbe.error || '').includes('backup-password-required'),
        `${tag}: مسیر فایل‌محور هم بدون پسورد باید رد شود`,
      );
      assert.strictEqual(
        fs.readdirSync(fileGateDir).length,
        0,
        `${tag}: گیت باید قبل از نوشتن هر بایتی روی دیسک عمل کند`,
      );
    } finally {
      fs.rmSync(fileGateDir, { recursive: true, force: true });
    }
  } else {
    assert.strictEqual(
      typeof gateProbe,
      'string',
      `${tag}: بدون رمزنگاری، export بدون پسورد باید مثل قبل کار کند (سازگاری عقب‌رو)`,
    );
  }

  // --- settings default theme ---
  const settings = await assertOk(await q('getSettings'), `${tag} getSettings`);
  assert.strictEqual(settings.theme, 'mint', `${tag}: default theme must be mint`);

  // --- create client + related rows ---
  const client = await assertOk(await q('createClient', {
    firstName: 'Ali',
    lastName: 'Test',
    phone: '0912',
    email: null,
    gender: 'male',
    birthDate: null,
    notes: null,
  }), `${tag} createClient`);

  const session = await assertOk(await q('createSession', {
    clientId: client.id,
    trichologistId: null,
    date: '2024-01-01',
    time: '10:00',
    status: 'scheduled',
    notes: null,
  }), `${tag} createSession`);

  const analysis = await assertOk(await q('createAnalysis', {
    clientId: client.id,
    trichologistId: null,
    type: 'ai',
    galleryItemId: null,
    medicalQuestionnaire: {},
    observations: [],
    recommendations: '',
    treatmentPlan: '',
    aiResults: null,
    offlineResults: null,
  }), `${tag} createAnalysis`);

  // --- تصاویر annotate‌شده نباید در پاسخ‌های لیستی بیایند ---
  // این تصاویر چند صد کیلوبایت تا چند مگابایت‌اند و اگر در لیست حمل شوند،
  // با رشد داده‌های کلینیک هر fetchAnalyses کل حافظه را پر می‌کند.
  const BIG_IMAGE = 'data:image/png;base64,' + 'A'.repeat(2048);
  const withImage = await assertOk(await q('createAnalysis', {
    clientId: client.id,
    trichologistId: null,
    type: 'offline',
    galleryItemId: null,
    medicalQuestionnaire: {},
    observations: [],
    recommendations: '',
    treatmentPlan: '',
    aiResults: null,
    offlineResults: { lesions: [], annotatedImageBase64: BIG_IMAGE },
  }), `${tag} createAnalysis with image`);

  const listed = await assertOk(await q('getAnalyses'), `${tag} getAnalyses`);
  const listedRow = listed.find(a => a.id === withImage.id);
  assert.ok(listedRow, `${tag}: analysis present in list`);
  assert.strictEqual(
    listedRow.offlineResults.annotatedImageBase64,
    undefined,
    `${tag}: annotatedImageBase64 must be stripped from list payload`,
  );
  assert.strictEqual(
    listedRow.offlineResults.hasAnnotatedImage,
    true,
    `${tag}: hasAnnotatedImage flag must be set instead`,
  );

  const analysesByClient = await assertOk(
    await q('getAnalysesByClient', { clientId: client.id }),
    `${tag} getAnalysesByClient`,
  );
  const byClientRow = analysesByClient.find(a => a.id === withImage.id);
  assert.strictEqual(
    byClientRow.offlineResults.annotatedImageBase64,
    undefined,
    `${tag}: annotatedImageBase64 stripped in getAnalysesByClient too`,
  );

  // ...ولی باید on-demand کامل برگردد
  const fullImage = await assertOk(
    await q('getAnalysisAnnotatedImage', { id: withImage.id }),
    `${tag} getAnalysisAnnotatedImage`,
  );
  assert.strictEqual(fullImage, BIG_IMAGE, `${tag}: on-demand image must match original`);

  const missingImage = await q('getAnalysisAnnotatedImage', { id: analysis.id });
  assert.strictEqual(missingImage, null, `${tag}: analysis without image returns null`);

  await assertOk(await q('deleteAnalysis', { id: withImage.id }), `${tag} cleanup image analysis`);

  const sample = await assertOk(await q('addTrainingSample', {
    clientId: client.id,
    galleryItemId: null,
    imageThumbnail: null,
    features: { brightness: 1 },
    label: { oiliness: 10 },
    labelSource: 'expert',
    confidence: 0.9,
    featureVersion: 'v3',
    approvedForTraining: true,
  }), `${tag} addTrainingSample`);
  assert.strictEqual(sample.approvedForTraining, true, `${tag}: approvedForTraining`);
  assert.strictEqual(sample.featureVersion, 'v3', `${tag}: featureVersion`);

  // موج ۱ (W1-4) — بازنویسی فیچرهای بازمحاسبه‌شده باید در هر دو بک‌اند round-trip شود
  const recomputedFeatures = { brightness: 42, whiteFlakeRatio: 0.2, hairCoverageRatio: 0.6 };
  const patchedSample = await assertOk(await q('updateTrainingSample', {
    id: sample.id,
    features: recomputedFeatures,
    featureVersion: 'v4.2-otsu-scalp-mask',
  }), `${tag} updateTrainingSample(features)`);
  assert.deepStrictEqual(patchedSample.features, recomputedFeatures, `${tag}: features round-trip`);
  assert.strictEqual(patchedSample.featureVersion, 'v4.2-otsu-scalp-mask', `${tag}: featureVersion bump round-trip`);

  // --- questionnaire revisions: upsert + read + cascade ---
  const revision = await assertOk(await q('saveQuestionnaireRevision', {
    clientId: client.id,
    sessionId: session.id,
    values: { chiefComplaint: 'hair loss', medications: 'none' },
  }), `${tag} saveQuestionnaireRevision (create)`);
  assert.strictEqual(revision.status, 'draft', `${tag}: new revision defaults to draft`);

  const revisionUpdated = await assertOk(await q('saveQuestionnaireRevision', {
    clientId: client.id,
    sessionId: session.id,
    values: { chiefComplaint: 'hair loss', medications: 'minoxidil' },
  }), `${tag} saveQuestionnaireRevision (upsert)`);
  assert.strictEqual(revisionUpdated.id, revision.id, `${tag}: upsert must reuse the same row`);
  assert.strictEqual(revisionUpdated.values.medications, 'minoxidil', `${tag}: upsert values`);

  const finalized = await assertOk(await q('saveQuestionnaireRevision', {
    clientId: client.id,
    sessionId: session.id,
    values: {
      medications: { selected: ['minoxidil'], other: '' },
      stressLevel: 'high',
    },
    status: 'final',
    changedFields: ['medications', 'stressLevel'],
  }), `${tag} saveQuestionnaireRevision (finalize)`);
  assert.strictEqual(finalized.status, 'final', `${tag}: final status`);
  assert.deepStrictEqual(finalized.changedFields, ['medications', 'stressLevel'], `${tag}: changedFields`);

  const previousFinal = await assertOk(await q('getPreviousFinalQuestionnaireRevision', {
    clientId: client.id,
    excludeSessionId: 'other-session',
  }), `${tag} getPreviousFinalQuestionnaireRevision`);
  assert.ok(previousFinal, `${tag}: previous final exists`);
  assert.strictEqual(previousFinal.id, finalized.id, `${tag}: previous final id`);

  const excluded = await assertOk(await q('getPreviousFinalQuestionnaireRevision', {
    clientId: client.id,
    excludeSessionId: session.id,
  }), `${tag} getPreviousFinal excluded`);
  assert.strictEqual(excluded, null, `${tag}: exclude current session`);

  const revisionRead = await assertOk(await q('getQuestionnaireRevision', {
    clientId: client.id,
    sessionId: session.id,
  }), `${tag} getQuestionnaireRevision`);
  assert.ok(revisionRead, `${tag}: revision must be readable`);
  assert.ok(typeof revisionRead.values === 'object', `${tag}: values must be object, not JSON string`);
  assert.deepStrictEqual(revisionRead.changedFields, ['medications', 'stressLevel'], `${tag}: read changedFields`);

  const byClient = await assertOk(await q('getQuestionnaireRevisionsByClient', {
    clientId: client.id,
  }), `${tag} getQuestionnaireRevisionsByClient`);
  assert.strictEqual(byClient.length, 1, `${tag}: one revision per session`);

  // gallery with metadata object
  const gallery = await assertOk(await q('addGalleryItem', {
    clientId: client.id,
    type: 'photo',
    url: 'data:image/png;base64,aaaa',
    thumbnail: null,
    filename: 'x.png',
    metadata: { camera: 'test', zoom: 2, scalpRegion: 'frontal', trichoscopeMode: 'NL' },
  }), `${tag} addGalleryItem`);

  if (isSqlite) {
    // روی دیسک ذخیره می‌شود؛ لیست باید metadata را به‌صورت object برگرداند
    const list = await assertOk(await q('getGalleryByClient', { clientId: client.id }), `${tag} getGallery`);
    assert.ok(Array.isArray(list) && list.length >= 1);
    const item = list.find((g) => g.id === gallery.id) || list[0];
    assert.ok(item.metadata && typeof item.metadata === 'object', `${tag}: metadata must be object`);
    assert.strictEqual(item.metadata.camera, 'test');

    if (isEncryptedMode) {
      // موج ۲ (DoD): تصویر تازه باید *رمزشده* روی دیسک باشد (هدر SCPA) ولی
      // خواندن شفاف همان دادهٔ اصلی را برگرداند.
      assert.ok(item.filePath && fs.existsSync(item.filePath), `${tag}: media file must exist on disk`);
      const head = Buffer.alloc(FILE_MAGIC.length);
      const fd = fs.openSync(item.filePath, 'r');
      fs.readSync(fd, head, 0, FILE_MAGIC.length, 0);
      fs.closeSync(fd);
      assert.ok(head.equals(FILE_MAGIC), `${tag}: new media file must be stored ENCRYPTED (SCPA magic)`);
      const roundTrip = await assertOk(await q('getGalleryItemDataUrl', { id: gallery.id }), `${tag} getGalleryItemDataUrl (encrypted)`);
      assert.ok(
        typeof roundTrip === 'string' && roundTrip.startsWith('data:image/png;base64,'),
        `${tag}: encrypted media must transparently decrypt to a data URL`,
      );
    }
  }

  // --- server-side gallery query + atomic training-pool transition ---
  const queriedGallery = await assertOk(await q('getGalleryPage', {
    clientId: client.id,
    type: 'photo',
    search: 'Ali',
    limit: 10,
    offset: 0,
  }), `${tag} getGalleryPage`);
  assert.ok(queriedGallery.some(item => item.id === gallery.id), `${tag}: gallery page filters`);
  const filteredGallery = await assertOk(await q('getGalleryPage', { clientId: client.id, regionId: 'frontal', trichoscopeMode: 'NL', limit: 10 }), `${tag} gallery metadata filters`);
  assert.ok(filteredGallery.some(item => item.id === gallery.id), `${tag}: region/lens filters`);
  const queriedCount = await assertOk(await q('getGalleryPageCount', { clientId: client.id, type: 'photo', search: 'Ali' }), `${tag} getGalleryPageCount`);
  assert.ok(queriedCount >= 1, `${tag}: gallery page count`);
  const trainingPoolGallery = await assertOk(await q('addGalleryItem', {
    clientId: 'system-training-pool',
    type: 'photo',
    url: 'data:image/png;base64,bbbb',
    thumbnail: null,
    filename: 'pool.png',
    metadata: { scalpRegion: 'frontal', trichoscopeMode: 'NL' },
  }), `${tag} add training pool gallery`);
  const atomicSample = await assertOk(await q('saveTrainingSampleAndCompletePoolItem', {
    clientId: 'system-training-pool',
    galleryItemId: trainingPoolGallery.id,
    features: { brightness: 1 },
    label: { oiliness: 10 },
    labelSource: 'expert',
    confidence: 1,
    featureVersion: 'v3',
    approvedForTraining: true,
  }), `${tag} atomic training save`);
  assert.strictEqual(atomicSample.galleryItemId, trainingPoolGallery.id);
  const activePool = await assertOk(await q('getTrainingPoolItems', { status: 'active' }), `${tag} active pool after atomic save`);
  assert.ok(!activePool.some(item => item.id === trainingPoolGallery.id), `${tag}: completed item must leave active pool`);
  const completedPool = await assertOk(await q('getTrainingPoolItems', { status: 'completed' }), `${tag} completed pool after atomic save`);
  assert.ok(completedPool.some(item => item.id === trainingPoolGallery.id), `${tag}: completed item must enter gallery`);
  const duplicate = await q('saveTrainingSampleAndCompletePoolItem', {
    clientId: 'system-training-pool', galleryItemId: trainingPoolGallery.id,
    features: {}, label: {}, labelSource: 'expert', approvedForTraining: true,
  });
  assert.ok(duplicate && duplicate.error, `${tag}: duplicate training sample must be rejected`);

  // --- cascade delete ---
  // قرارداد از src/db/cascadeRules.ts خوانده می‌شود، نه دستی نوشته شده.
  // قبلاً آن فایل هیچ مصرف‌کننده‌ای نداشت — یعنی صرفاً یک کامنت بود و اگر
  // موجودیت جدیدی اضافه می‌شد، هیچ چیزی cascade نشدنش را نمی‌گرفت.
  await assertOk(await q('deleteClient', { id: client.id }), `${tag} deleteClient`);

  /** بررسی هر موجودیت وابسته پس از حذف مشتری */
  const cascadeChecks = {
    sessions: async () => {
      const rows = await assertOk(await q('getSessions'), `${tag} getSessions after delete`);
      assert.ok(!rows.some((s) => s.id === session.id), `${tag}: session cascade`);
    },
    analyses: async () => {
      const rows = await assertOk(await q('getAnalyses'), `${tag} getAnalyses after delete`);
      assert.ok(!rows.some((a) => a.id === analysis.id), `${tag}: analysis cascade`);
    },
    gallery: async () => {
      const rows = await assertOk(
        await q('getGalleryByClient', { clientId: client.id }),
        `${tag} gallery after delete`,
      );
      assert.strictEqual(rows.length, 0, `${tag}: gallery cascade`);
    },
    trainingSamples: async () => {
      const rows = await assertOk(await q('getTrainingSamples'), `${tag} getTrainingSamples after delete`);
      assert.ok(!rows.some((s) => s.id === sample.id), `${tag}: training sample cascade`);
    },
    questionnaireRevisions: async () => {
      const rows = await assertOk(
        await q('getQuestionnaireRevisionsByClient', { clientId: client.id }),
        `${tag} revisions after delete`,
      );
      assert.strictEqual(rows.length, 0, `${tag}: questionnaire revision cascade`);
    },
  };

  const uncovered = CLIENT_DELETE_CASCADE.filter((entity) => !cascadeChecks[entity]);
  assert.strictEqual(
    uncovered.length,
    0,
    `${tag}: موجودیت‌های CLIENT_DELETE_CASCADE بدون تست: ${uncovered.join(', ')} ` +
      '— برای هرکدام یک بررسی به cascadeChecks اضافه کنید',
  );

  for (const entity of CLIENT_DELETE_CASCADE) {
    await cascadeChecks[entity]();
  }

  // --- audit trail (موج ۲ / C3.3) ---
  // حذف مشتریِ بالا باید رد حسابرسی داشته باشد؛ export/import هم رویداد دارند.
  const auditAfterDelete = await assertOk(await q('getAuditLog', {}), `${tag} getAuditLog`);
  assert.ok(
    auditAfterDelete.some((r) => r.event === 'client.delete'),
    `${tag}: audit_log must contain client.delete after deleteClient`,
  );
  const exported = unwrapExport(
    await assertOk(await q('exportData', withMandatoryPassword({})), `${tag} exportData`),
    'exportData',
  );
  assert.strictEqual(typeof exported, 'string', `${tag}: exportData returns a string payload`);
  const auditAfterExport = await assertOk(await q('getAuditLog', {}), `${tag} getAuditLog after export`);
  assert.ok(
    auditAfterExport.some((r) => r.event === 'data.export'),
    `${tag}: audit_log must contain data.export after exportData`,
  );
  await assertOk(await q('importData', { jsonData: exported }), `${tag} importData self-backup`);
  const auditAfterImport = await assertOk(await q('getAuditLog', {}), `${tag} getAuditLog after import`);
  assert.ok(
    auditAfterImport.some((r) => r.event === 'data.import'),
    `${tag}: audit_log must contain data.import after importData`,
  );

  // --- موج ۳ (O3): مدل داخل بکاپ در هر دو بک‌اند + round-trip به‌عنوان challenger ---
  const sampleBundle = {
    modelTopology: { className: 'Sequential', config: { layers: [{ class_name: 'Dense' }] } },
    weightSpecs: [{ name: 'dense/kernel', shape: [2, 2], dtype: 'float32' }],
    weightDataBase64: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64'),
    featureVersion: 'test-feature-v1',
    metadata: { version: 2, trainedAt: '2026-01-01T00:00:00.000Z', sampleCount: 10 },
  };
  const exportedWithModel = unwrapExport(
    await assertOk(await q('exportData', withMandatoryPassword({ modelBundle: sampleBundle })), `${tag} exportData + modelBundle`),
    'exportData + modelBundle',
  );
  assert.strictEqual(typeof exportedWithModel, 'string', `${tag}: exportData با مدل هم رشته برمی‌گرداند`);

  // اثبات حضور مدل داخل آرشیو/پاکت — برای sqlite داخل ZIP: model.json + model.weights.bin
  if (harness.backend === 'sqlite') {
    assert.ok(exportedWithModel.startsWith('scalpai-backup:v3:base64:'), `${tag}: sqlite export باید v3 zip باشد`);
    const zipBuffer = Buffer.from(exportedWithModel.slice('scalpai-backup:v3:base64:'.length), 'base64');
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(zipBuffer);
    const modelJsonEntry = zip.getEntry('model.json');
    const modelWeightsEntry = zip.getEntry('model.weights.bin');
    assert.ok(modelJsonEntry, `${tag}: model.json داخل ZIP هست`);
    assert.ok(modelWeightsEntry, `${tag}: model.weights.bin داخل ZIP هست`);
    const modelDoc = JSON.parse(modelJsonEntry.getData().toString('utf8'));
    assert.strictEqual(modelDoc.format, 'scalpai-model-bundle', `${tag}: قالب model.json`);
    assert.strictEqual(modelDoc.featureVersion, 'test-feature-v1', `${tag}: featureVersion داخل model.json`);
    assert.deepStrictEqual(modelDoc.modelTopology, sampleBundle.modelTopology, `${tag}: topology ۱:۱`);
    assert.deepStrictEqual(modelDoc.weightSpecs, sampleBundle.weightSpecs, `${tag}: weightSpecs ۱:۱`);
    assert.deepStrictEqual(modelDoc.metadata, sampleBundle.metadata, `${tag}: metadata ۱:۱`);
    assert.ok(
      modelWeightsEntry.getData().equals(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])),
      `${tag}: بایت‌های وزن در model.weights.bin ۱:۱`,
    );
  } else {
    // بک‌اند JSON: مدل به‌صورت ساختاری در envelope می‌آید
    const envelope = JSON.parse(exportedWithModel);
    assert.ok(envelope.data.modelBundle, `${tag}: modelBundle در envelope JSON هست`);
    assert.strictEqual(envelope.data.modelBundle.weightDataBase64, sampleBundle.weightDataBase64, `${tag}: وزن‌ها ۱:۱ در JSON`);
  }

  // import: مدل به‌عنوان challenger برگردانده می‌شود (۱:۱) و audit پرچم modelIncluded دارد
  const importReport = await assertOk(await q('importData', { jsonData: exportedWithModel }), `${tag} importData + model`);
  assert.ok(importReport && importReport.success === true, `${tag}: importData گزارش success برمی‌گرداند`);
  assert.ok(importReport.importedModel, `${tag}: importedModel برگردانده شد`);
  assert.deepStrictEqual(importReport.importedModel.modelTopology, sampleBundle.modelTopology, `${tag}: topology وارداتی ۱:۱`);
  assert.deepStrictEqual(importReport.importedModel.weightSpecs, sampleBundle.weightSpecs, `${tag}: weightSpecs وارداتی ۱:۱`);
  assert.strictEqual(importReport.importedModel.weightDataBase64, sampleBundle.weightDataBase64, `${tag}: وزن‌های وارداتی ۱:۱`);
  assert.strictEqual(importReport.importedModel.featureVersion, 'test-feature-v1', `${tag}: featureVersion وارداتی`);
  assert.deepStrictEqual(importReport.importedModel.metadata, sampleBundle.metadata, `${tag}: metadata وارداتی ۱:۱`);
  const auditAfterModelImport = await assertOk(await q('getAuditLog', {}), `${tag} audit after model import`);
  // نکته: با رویدادهای هم‌میلی‌ثانیه ترتیب دقیق تضمینی نیست، پس قرارداد این است:
  // «حداقل یک data.import با modelIncluded:true باید ثبت شده باشد»، نه «آخرین رویداد».
  assert.ok(
    auditAfterModelImport.some(
      (r) => r.event === 'data.import' && String(r.detail || '').includes('"modelIncluded":true'),
    ),
    `${tag}: رد حسابرسی باید حداقل یک data.import با modelIncluded:true داشته باشد`,
  );

  // سازگاری عقب‌رو: بکاپ بدون مدل → importedModel تهی است (نه خطا)
  const exportedNoModel = unwrapExport(
    await assertOk(await q('exportData', withMandatoryPassword({})), `${tag} exportData بدون مدل`),
    'exportData بدون مدل',
  );
  const importNoModel = await assertOk(await q('importData', { jsonData: exportedNoModel }), `${tag} import بدون مدل`);
  assert.ok(importNoModel && importNoModel.success === true, `${tag}: import بدون مدل موفق`);
  assert.strictEqual(importNoModel.importedModel ?? null, null, `${tag}: importedModel باید null باشد`);

  // --- موج ۳ (O2): exportDataToFile — خروجی فایل‌محور روی دیسک ---
  const fsOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-contract-out-'));
  try {
    const targetPath = path.join(fsOutDir, `contract-${harness.backend}.zip`);
    const fileResult = await assertOk(
      await q('exportDataToFile', withMandatoryPassword({ targetPath, modelBundle: sampleBundle })),
      `${tag} exportDataToFile`,
    );
    assert.strictEqual(fileResult.success, true, `${tag}: exportDataToFile موفق`);
    assert.strictEqual(fileResult.filePath, targetPath, `${tag}: filePath برگشتی همان مقصد است`);
    assert.ok(fs.existsSync(targetPath), `${tag}: فایل روی دیسک ساخته شده`);
    assert.strictEqual(fileResult.bytes, fs.statSync(targetPath).size, `${tag}: bytes = اندازهٔ واقعی`);
    assert.strictEqual(
      fileResult.passwordProtected,
      isEncryptedMode,
      `${tag}: فاز ۱ (AUD-9) — با رمزنگاری فعال خروجی همیشه passwordProtected است`,
    );

    if (isEncryptedMode) {
      // فاز ۱ (AUD-9): فایل روی دیسک باید پاکت رمزدار v4 باشد، نه ZIP/JSON خام.
      // یعنی حتی اگر کسی فایل را برداشت، بدون پسورد کاربر بی‌ارزش است.
      const encHead = fs.readFileSync(targetPath, 'utf-8').slice(0, V4_PREFIX.length);
      assert.strictEqual(encHead, V4_PREFIX, `${tag}: فایل باید پاکت v4 رمزدار باشد`);
      const payload = unwrapExport(fs.readFileSync(targetPath, 'utf-8'), 'exportDataToFile');
      const roundTrip = await assertOk(
        await q('importData', { jsonData: payload }),
        `${tag} import از فایل رمزدار exportDataToFile`,
      );
      assert.ok(roundTrip.importedModel, `${tag}: مدل از فایل رمزدار هم round-trip می‌شود`);
      assert.strictEqual(
        roundTrip.importedModel.weightDataBase64,
        sampleBundle.weightDataBase64,
        `${tag}: وزن‌ها از فایل رمزدار هم ۱:۱`,
      );
    } else if (harness.backend === 'sqlite') {
      // جادوی ZIP (PK\x03\x04) — نشانهٔ فایل آرشیو واقعی نه رشتهٔ JSON
      const head = fs.readFileSync(targetPath).subarray(0, 4);
      assert.ok(head[0] === 0x50 && head[1] === 0x4b, `${tag}: خروجی sqlite با جادوی PK شروع می‌شود (ZIP واقعی)`);
      // رفت‌وبرگشت: همان فایل از دیسک به importData برمی‌گردد و مدل را هم می‌آورد
      const zipBase64 = fs.readFileSync(targetPath).toString('base64');
      const roundTrip = await assertOk(
        await q('importData', { jsonData: `${V3_PREFIX}${zipBase64}` }),
        `${tag} import از فایل exportDataToFile`,
      );
      assert.ok(roundTrip.importedModel, `${tag}: مدل از فایل دیسک هم round-trip می‌شود`);
      assert.strictEqual(roundTrip.importedModel.weightDataBase64, sampleBundle.weightDataBase64, `${tag}: وزن‌ها از فایل هم ۱:۱`);
    } else {
      // بک‌اند JSON: خروجی فایل، متن JSON envelope است
      const text = fs.readFileSync(targetPath, 'utf-8');
      assert.ok(text.startsWith('{'), `${tag}: خروجی فایل JSON است`);
      const roundTrip = await assertOk(await q('importData', { jsonData: text }), `${tag} import از فایل JSON`);
      assert.ok(roundTrip.importedModel, `${tag}: مدل از فایل JSON هم round-trip می‌شود`);
    }
    assert.strictEqual(
      fs.readdirSync(fsOutDir).filter((f) => f.includes('.part-')).length,
      0,
      `${tag}: فایل موقت .part باقی نمانده`,
    );

    // مسیر رمزدار v4 هم فایل می‌شود و فقط با پسورد درست باز می‌شود
    const encTarget = path.join(fsOutDir, `contract-${harness.backend}.zip.enc`);
    const encResult = await assertOk(
      await q('exportDataToFile', { targetPath: encTarget, backupPassword: 'contract-pass-123' }),
      `${tag} exportDataToFile رمزدار`,
    );
    assert.strictEqual(encResult.passwordProtected, true, `${tag}: passwordProtected=true`);
    const encText = fs.readFileSync(encTarget, 'utf-8');
    assert.ok(encText.startsWith('scalpai-backup:v4:enc:base64:'), `${tag}: فایل v4 با prefix درست`);
    const encImport = await assertOk(
      await q('importData', { jsonData: encText, backupPassword: 'contract-pass-123' }),
      `${tag} import فایل v4 با پسورد درست`,
    );
    assert.strictEqual(encImport.success, true, `${tag}: import v4 موفق`);
    // پسورد اشتباه باید خطا بدهد (نه دادهٔ خراب) — handleDbQuery خطا می‌اندازد به
    // شکل { error } برمی‌گرداند؛ رمزگشایی قبل از هر نوشتاری روی DB شکست می‌خورد.
    const wrongOut = await q('importData', { jsonData: encText, backupPassword: 'wrong-password' });
    assert.ok(
      wrongOut && typeof wrongOut === 'object' && wrongOut.error,
      `${tag}: پسورد اشتباه برای v4 رد می‌شود (باید error برگردد)`,
    );
  } finally {
    fs.rmSync(fsOutDir, { recursive: true, force: true });
  }

  // --- settings UPSERT when row missing (sqlite) / always works (json) ---
  const updated = await assertOk(await q('updateSettings', { language: 'en' }), `${tag} updateSettings`);
  assert.strictEqual(updated.language, 'en');
  const again = await assertOk(await q('getSettings'), `${tag} getSettings after update`);
  assert.strictEqual(again.language, 'en');

  // --- password hash format is pbkdf2 (cross-platform) ---
  await assertOk(await q('updateSettings', { username: 'admin', password: 'password123' }), `${tag} set password`);
  const ok = await assertOk(await q('verifyCredentials', { username: 'admin', password: 'password123' }), `${tag} verify`);
  assert.strictEqual(ok, true, `${tag}: credentials verify`);
  const bad = await assertOk(await q('verifyCredentials', { username: 'admin', password: 'wrong-pass' }), `${tag} verify bad`);
  assert.strictEqual(bad, false);

  if (isEncryptedMode && harness.backend === 'json') {
    // موج ۲ (C1.4): کل فایل فروشگاه JSON باید رمزشده روی دیسک باشد، در حالی که
    // همهٔ assertionهای بالا بدون هیچ تغییری سبز شده‌اند (شفافیت لایهٔ رمز).
    const raw = fs.readFileSync(path.join(harness.dir, 'scalpai-data.json'));
    assert.ok(
      raw.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC),
      `${tag}: JSON store file must be encrypted at rest (SCPA magic)`,
    );
  }

  console.log(`OK contract (${tag})`);
}

async function testSchemaMigrations() {
  const db = new Database(':memory:');
  // شبیه‌سازی دیتابیس قدیمی بدون ستون‌های جدید
  db.exec(`
    CREATE TABLE clients (id TEXT PRIMARY KEY, firstName TEXT, lastName TEXT, phone TEXT, email TEXT, gender TEXT, birthDate TEXT, notes TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE gallery (id TEXT PRIMARY KEY, clientId TEXT, type TEXT, url TEXT, thumbnail TEXT, filename TEXT, metadata TEXT, createdAt TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, clientId TEXT, trichologistId TEXT, date TEXT, time TEXT, status TEXT, notes TEXT, createdAt TEXT);
    CREATE TABLE trichologists (id TEXT PRIMARY KEY, name TEXT, specialty TEXT, phone TEXT, email TEXT, description TEXT, active INTEGER);
    CREATE TABLE analyses (id TEXT PRIMARY KEY, clientId TEXT, trichologistId TEXT, type TEXT, galleryItemId TEXT, medicalQuestionnaire TEXT, observations TEXT, recommendations TEXT, treatmentPlan TEXT, aiResults TEXT, createdAt TEXT, updatedAt TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE training_samples (id TEXT PRIMARY KEY, clientId TEXT, galleryItemId TEXT, imageThumbnail TEXT, features TEXT, label TEXT, labelSource TEXT, confidence REAL, usedInTraining INTEGER, modelVersionTrainedWith INTEGER, createdAt TEXT);
  `);
  createBaseTables(db); // IF NOT EXISTS — ساختار قدیمی را عوض نمی‌کند
  runMigrations(db);

  const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  assert.ok(cols('gallery').includes('filePath'));
  assert.ok(cols('analyses').includes('offlineResults'));
  assert.ok(cols('training_samples').includes('approvedForTraining'));
  assert.ok(cols('training_samples').includes('featureVersion'));
  assert.ok(
    cols('training_samples').includes('questionnaireFeatures'),
    'questionnaireFeatures column must exist after migration v6',
  );
  const hasQuestionnaireTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='questionnaire_revisions'",
  ).get();
  assert.ok(hasQuestionnaireTable, 'questionnaire_revisions table must exist after migration');
  const qCols = cols('questionnaire_revisions');
  assert.ok(qCols.includes('changedFieldsJson'), 'changedFieldsJson column must exist after migration v5');
  const ver = db.prepare('SELECT version FROM schema_version WHERE id = 1').get();
  assert.strictEqual(ver.version, SCHEMA_VERSION);
  db.close();
  console.log('OK schema migrations');
}

function testPasswordHashAlignment() {
  const hashed = hashPassword('secret-pass-99');
  assert.ok(hashed.startsWith('pbkdf2:'), 'new hashes must be pbkdf2');
  assert.strictEqual(verifyPassword('secret-pass-99', hashed), true);
  assert.strictEqual(verifyPassword('wrong', hashed), false);

  // legacy scrypt still verifies on Electron side
  const crypto = require('crypto');
  const salt = crypto.randomBytes(16);
  const scryptHash = crypto.scryptSync('legacy-pass', salt, 64);
  const stored = `scrypt:${salt.toString('base64')}:${scryptHash.toString('base64')}`;
  assert.strictEqual(verifyPassword('legacy-pass', stored), true);
  console.log('OK password hash alignment (pbkdf2 write, scrypt verify legacy)');
}

function testParseStoredJson() {
  assert.deepStrictEqual(parseStoredJson('{"a":1}', {}), { a: 1 });
  assert.deepStrictEqual(parseStoredJson({ a: 2 }, {}), { a: 2 });
  assert.deepStrictEqual(parseStoredJson('not-json', { fallback: true }), { fallback: true });
  console.log('OK parseStoredJson');
}

async function main() {
  testParseStoredJson();
  testPasswordHashAlignment();
  await testSchemaMigrations();

  // حالت ۱ — بدون لایهٔ رمز (رفتار legacy؛ safeStorage unavailable)
  _resetForTests();
  const sqlite = createSqliteHarness();
  const json = createJsonHarness();
  try {
    await runContract(sqlite);
    await runContract(json);
  } finally {
    sqlite.close();
    json.close();
  }

  // حالت ۲ — با لایهٔ رمز فعال (موج ۲ / DoD: «روی هر دو حالت»): DEK از طریق
  // mock فعال safeStorage ساخته می‌شود و *همان* قرارداد بدون هیچ تغییری باید
  // سبز بماند — علاوه بر دو assertion رمزنگاری (فایل تصویر/JSON روی دیسک).
  _resetForTests();
  const dekDir = makeTempDir('scalpai-dek-');
  const dekInit = initDek(safeStorageMockEnabled, dekDir);
  assert.strictEqual(dekInit.status, 'active', 'mock DEK must activate');
  const sqliteEnc = createSqliteHarness('sqlite-encrypted', safeStorageMockEnabled);
  const jsonEnc = createJsonHarness('json-encrypted', safeStorageMockEnabled);
  try {
    await runContract(sqliteEnc);
    await runContract(jsonEnc);
  } finally {
    sqliteEnc.close();
    jsonEnc.close();
    _resetForTests();
    fs.rmSync(dekDir, { recursive: true, force: true });
  }

  console.log('ALL_DB_CONTRACT_TESTS_PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
