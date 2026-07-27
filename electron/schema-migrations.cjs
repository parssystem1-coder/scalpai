/**
 * schema-migrations.cjs — مهاجرت نسخه‌دار اسکیمای SQLite
 * -----------------------------------------------------------------------
 * به‌جای try/catch خام روی ALTER TABLE، نسخهٔ فعلی در جدول schema_version
 * نگه داشته می‌شود و migrationها به‌ترتیب اجرا می‌شوند.
 */

/** آخرین نسخهٔ اسکیما پس از اعمال همهٔ migrationها */
const SCHEMA_VERSION = 8;

const {
  buildSystemTrainingPoolClientRecord,
  ensureSystemTrainingPoolClientSqlite,
} = require('./db-common.cjs');

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 */
function columnExists(db, table, column) {
  // نام جدول/ستون از کد ثابت می‌آید نه از ورودی کاربر
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} table
 * @param {string} column
 * @param {string} typeSql
 */
function addColumnIfMissing(db, table, column, typeSql) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getSchemaVersion(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL
    )
  `);
  const row = db.prepare('SELECT version FROM schema_version WHERE id = 1').get();
  if (row) return row.version;

  // دیتابیس قدیمی بدون جدول نسخه: اگر جداول اصلی وجود دارند نسخه را ۱ فرض کن
  // تا migrationهای بعدی (نسخه ۲+) اجرا شوند؛ در غیر این صورت ۰ = نصب تازه.
  const hasClients = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'",
  ).get();
  const initial = hasClients ? 1 : 0;
  db.prepare('INSERT INTO schema_version (id, version) VALUES (1, ?)').run(initial);
  return initial;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} version
 */
function setSchemaVersion(db, version) {
  db.prepare(`
    INSERT INTO schema_version (id, version) VALUES (1, ?)
    ON CONFLICT(id) DO UPDATE SET version = excluded.version
  `).run(version);
}

/**
 * تعریف migrationها: هر کدام از version-1 به version می‌برد.
 * @type {Array<{ version: number, up: (db: import('better-sqlite3').Database) => void }>}
 */
const MIGRATIONS = [
  {
    version: 2,
    up(db) {
      addColumnIfMissing(db, 'gallery', 'filePath', 'TEXT');
      addColumnIfMissing(db, 'analyses', 'offlineResults', 'TEXT');
      addColumnIfMissing(db, 'training_samples', 'approvedForTraining', 'INTEGER');
      addColumnIfMissing(db, 'training_samples', 'featureVersion', 'TEXT');

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_clients_createdAt ON clients(createdAt);
        CREATE INDEX IF NOT EXISTS idx_gallery_client ON gallery(clientId, createdAt);
        CREATE INDEX IF NOT EXISTS idx_gallery_createdAt ON gallery(createdAt);
        CREATE INDEX IF NOT EXISTS idx_sessions_client ON sessions(clientId, date);
        CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date, time);
        CREATE INDEX IF NOT EXISTS idx_analyses_client ON analyses(clientId, createdAt);
        CREATE INDEX IF NOT EXISTS idx_analyses_createdAt ON analyses(createdAt);
        CREATE INDEX IF NOT EXISTS idx_training_samples_createdAt ON training_samples(createdAt);
      `);
    },
  },
  {
    version: 3,
    up(db) {
      addColumnIfMissing(db, 'analyses', 'sessionId', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_analyses_session ON analyses(sessionId, createdAt);
      `);
    },
  },
  {
    version: 4,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS questionnaire_revisions (
          id TEXT PRIMARY KEY,
          clientId TEXT NOT NULL,
          sessionId TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'final')),
          valuesJson TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY(clientId) REFERENCES clients(id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_qrev_session ON questionnaire_revisions(sessionId);
        CREATE INDEX IF NOT EXISTS idx_qrev_client ON questionnaire_revisions(clientId, updatedAt);
      `);
    },
  },
  {
    version: 5,
    up(db) {
      addColumnIfMissing(db, 'questionnaire_revisions', 'changedFieldsJson', 'TEXT');
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_qrev_client_status
          ON questionnaire_revisions(clientId, status, updatedAt);
      `);
    },
  },
  {
    version: 6,
    up(db) {
      addColumnIfMissing(db, 'training_samples', 'questionnaireFeatures', 'TEXT');
    },
  },
  {
    version: 7,
    up(db) {
      // ستون تفکیک ردیف‌های سیستمی (مثل کلاینت استخر آموزشی) از مشتریان واقعی
      addColumnIfMissing(db, 'clients', 'isSystemRecord', 'INTEGER');
      ensureSystemTrainingPoolClientSqlite(db);
    },
  },
  {
    version: 8,
    up(db) {
      addColumnIfMissing(db, 'gallery', 'trainingPoolStatus', 'TEXT');
      db.prepare("UPDATE gallery SET trainingPoolStatus = 'active' WHERE clientId = 'system-training-pool' AND trainingPoolStatus IS NULL").run();
      db.exec('CREATE INDEX IF NOT EXISTS idx_gallery_training_pool ON gallery(clientId, trainingPoolStatus, createdAt);');
    },
  },
];

/**
 * ایجاد جداول پایه با اسکیمای کامل فعلی (برای نصب تازه).
 * CREATE IF NOT EXISTS ستون‌های جدید را به جدول قدیمی اضافه نمی‌کند —
 * آن کار با runMigrations انجام می‌شود.
 * @param {import('better-sqlite3').Database} db
 */
function createBaseTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      gender TEXT CHECK(gender IN ('male', 'female')),
      birthDate TEXT,
      notes TEXT,
      isSystemRecord INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gallery (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      type TEXT CHECK(type IN ('photo', 'video')),
      url TEXT NOT NULL,
      thumbnail TEXT,
      filename TEXT,
      metadata TEXT,
      filePath TEXT,
      trainingPoolStatus TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(clientId) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      trichologistId TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      status TEXT CHECK(status IN ('scheduled', 'completed', 'cancelled')),
      notes TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(clientId) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS trichologists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT,
      phone TEXT,
      email TEXT,
      description TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      sessionId TEXT,
      trichologistId TEXT,
      type TEXT,
      galleryItemId TEXT,
      medicalQuestionnaire TEXT,
      observations TEXT,
      recommendations TEXT,
      treatmentPlan TEXT,
      aiResults TEXT,
      offlineResults TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(clientId) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS questionnaire_revisions (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      sessionId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'final')),
      valuesJson TEXT NOT NULL,
      changedFieldsJson TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(clientId) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS training_samples (
      id TEXT PRIMARY KEY,
      clientId TEXT,
      galleryItemId TEXT,
      imageThumbnail TEXT,
      features TEXT NOT NULL,
      label TEXT NOT NULL,
      labelSource TEXT CHECK(labelSource IN ('online_ai', 'expert', 'offline_heuristic')),
      confidence REAL,
      usedInTraining INTEGER DEFAULT 0,
      modelVersionTrainedWith INTEGER,
      createdAt TEXT NOT NULL,
      approvedForTraining INTEGER,
      featureVersion TEXT,
      questionnaireFeatures TEXT
    );
  `);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  let current = getSchemaVersion(db);
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const tx = db.transaction(() => {
      migration.up(db);
      setSchemaVersion(db, migration.version);
    });
    tx();
    current = migration.version;
    console.log(`Schema migrated to version ${migration.version}`);
  }
  if (current < SCHEMA_VERSION) {
    // اگر migration تعریف‌نشده‌ای مانده، حداقل نسخه را هم‌تراز کن
    setSchemaVersion(db, SCHEMA_VERSION);
  }
}

module.exports = {
  SCHEMA_VERSION,
  createBaseTables,
  runMigrations,
  columnExists,
  addColumnIfMissing,
};
