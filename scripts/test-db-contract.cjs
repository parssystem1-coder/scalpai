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

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createSqliteHarness() {
  const dir = makeTempDir('scalpai-sqlite-');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  createBaseTables(db);
  runMigrations(db);
  const handlers = createDbHandlers(db, dir, safeStorageMock);
  return {
    label: 'sqlite',
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

function createJsonHarness() {
  const dir = makeTempDir('scalpai-json-');
  const handlers = createJsonDbHandlers(dir, safeStorageMock);
  return {
    label: 'json',
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

  if (tag === 'sqlite') {
    // روی دیسک ذخیره می‌شود؛ لیست باید metadata را به‌صورت object برگرداند
    const list = await assertOk(await q('getGalleryByClient', { clientId: client.id }), `${tag} getGallery`);
    assert.ok(Array.isArray(list) && list.length >= 1);
    const item = list.find((g) => g.id === gallery.id) || list[0];
    assert.ok(item.metadata && typeof item.metadata === 'object', `${tag}: metadata must be object`);
    assert.strictEqual(item.metadata.camera, 'test');
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

  const sqlite = createSqliteHarness();
  const json = createJsonHarness();
  try {
    await runContract(sqlite);
    await runContract(json);
  } finally {
    sqlite.close();
    json.close();
  }

  console.log('ALL_DB_CONTRACT_TESTS_PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
