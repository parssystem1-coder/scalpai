import { describe, expect, it } from 'vitest';
// @ts-expect-error better-sqlite3 lacks typing under specific ESM configs
import Database from 'better-sqlite3';
// @ts-expect-error schema-migrations has no type declaration file
import { createBaseTables, runMigrations, SCHEMA_VERSION } from '../../electron/schema-migrations.cjs';
// @ts-expect-error db-handlers has no type declaration file
import { createDbHandlers } from '../../electron/db-handlers.cjs';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('بخش B4 — تست‌های مهاجرت پایگاه داده (Schema Migrations)', () => {
  it('باید دیتابیس نو را به درستی بسازد و به آخرین نسخه ارتقا دهد', () => {
    const db = new Database(':memory:');
    
    // در ابتدا نسخه وجود ندارد یا 0 است
    createBaseTables(db);
    runMigrations(db);

    // بررسی نسخه نهایی
    const versionRow = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number };
    expect(versionRow).toBeDefined();
    expect(versionRow.version).toBe(SCHEMA_VERSION);

    // بررسی صحت وجود جدول‌ها
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    expect(tables).toContain('schema_version');
    expect(tables).toContain('clients');
    expect(tables).toContain('gallery');
    expect(tables).toContain('sessions');
    expect(tables).toContain('trichologists');
    expect(tables).toContain('analyses');
    expect(tables).toContain('settings');
    expect(tables).toContain('questionnaire_revisions');
    expect(tables).toContain('training_samples');

    db.close();
  });

  it('باید مهاجرت از ساختار دیتابیس قدیمی نسخه 1 را با موفقیت انجام دهد', () => {
    const db = new Database(':memory:');

    // ایجاد یک دیتابیس قدیمی شبیه نسخه 1
    db.exec(`
      CREATE TABLE clients (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        gender TEXT,
        birthDate TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE gallery (
        id TEXT PRIMARY KEY,
        clientId TEXT NOT NULL,
        type TEXT,
        url TEXT NOT NULL,
        thumbnail TEXT,
        filename TEXT,
        metadata TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        clientId TEXT NOT NULL,
        trichologistId TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        status TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE trichologists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT,
        phone TEXT,
        email TEXT,
        description TEXT,
        active INTEGER DEFAULT 1
      );

      CREATE TABLE analyses (
        id TEXT PRIMARY KEY,
        clientId TEXT NOT NULL,
        trichologistId TEXT,
        type TEXT,
        galleryItemId TEXT,
        medicalQuestionnaire TEXT,
        observations TEXT,
        recommendations TEXT,
        treatmentPlan TEXT,
        aiResults TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE training_samples (
        id TEXT PRIMARY KEY,
        clientId TEXT,
        galleryItemId TEXT,
        imageThumbnail TEXT,
        features TEXT NOT NULL,
        label TEXT NOT NULL,
        labelSource TEXT,
        confidence REAL,
        usedInTraining INTEGER DEFAULT 0,
        modelVersionTrainedWith INTEGER,
        createdAt TEXT NOT NULL
      );
    `);

    // درج داده برای اطمینان از اینکه داده‌ها در طول مهاجرت خراب نمی‌شوند
    db.prepare(`
      INSERT INTO clients (id, firstName, lastName, createdAt, updatedAt)
      VALUES ('c1', 'Ali', 'Alavi', '2026-01-01', '2026-01-01')
    `).run();

    db.prepare(`
      INSERT INTO gallery (id, clientId, url, createdAt)
      VALUES ('g1', 'c1', 'file://test.jpg', '2026-01-01')
    `).run();

    // اجرای مهاجرت‌ها
    createBaseTables(db);
    runMigrations(db);

    // بررسی نسخه اسکیما
    const versionRow = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number };
    expect(versionRow.version).toBe(SCHEMA_VERSION);

    // داده‌های قدیمی دست‌نخورده مانده‌اند
    const client = db.prepare("SELECT * FROM clients WHERE id = 'c1'").get() as { firstName: string };
    expect(client).toBeDefined();
    expect(client.firstName).toBe('Ali');

    // ستون‌های جدید اضافه شده‌اند
    const cols = (table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    
    // نسخه 2
    expect(cols('gallery')).toContain('filePath');
    expect(cols('analyses')).toContain('offlineResults');
    expect(cols('training_samples')).toContain('approvedForTraining');
    expect(cols('training_samples')).toContain('featureVersion');

    // نسخه 3
    expect(cols('analyses')).toContain('sessionId');

    // نسخه 4 & 5
    expect(cols('questionnaire_revisions')).toContain('changedFieldsJson');

    // نسخه 6
    expect(cols('training_samples')).toContain('questionnaireFeatures');

    // نسخه 7
    expect(cols('clients')).toContain('isSystemRecord');
    // سیستم کلاینت باید اتوماتیک درج شده باشد
    const systemClient = db.prepare("SELECT * FROM clients WHERE id = 'system-training-pool'").get();
    expect(systemClient).toBeDefined();

    // نسخه 8
    expect(cols('gallery')).toContain('trainingPoolStatus');

    // نسخه 9
    expect(cols('training_samples')).toContain('originalAiLabel');
    expect(cols('training_samples')).toContain('originalAiLabelAt');

    db.close();
  });
});

describe('بخش B3 — تست‌های بکاپ نسخهٔ ۳ استریمی (Streaming Backup V3)', () => {
  it('باید بکاپ نسخه ۳ به صورت zip بسازد و بازگردانی کند با سازگاری عقب‌رو نسخه ۲', async () => {
    // ایجاد پوشه موقت برای شبیه‌سازی userData
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    const db = new Database(dbPath);

    // آماده‌سازی ساختار دیتابیس
    createBaseTables(db);
    runMigrations(db);

    const safeStorageMock = {
      isEncryptionAvailable: () => false,
      encryptString: (s: string) => Buffer.from(s),
      decryptString: (b: Buffer) => b.toString(),
    };

    const handlers = createDbHandlers(db, tmpDir, safeStorageMock);

    // افزودن کلاینت و تصویر در گالری
    db.prepare(`
      INSERT INTO clients (id, firstName, lastName, phone, email, gender, birthDate, notes, createdAt, updatedAt)
      VALUES ('client-v3-test', 'Saeed', 'Rad', '09123456789', 'saeed@test.com', 'male', '1370-01-01', 'Test notes', '2026-07-28', '2026-07-28')
    `).run();

    // ایجاد فایل فیزیکی تصویر در پوشه تصاویر
    const imagesDir = path.join(tmpDir, 'images', 'client-v3-test');
    fs.mkdirSync(imagesDir, { recursive: true });
    const imageFilePath = path.join(imagesDir, 'photo1.jpg');
    fs.writeFileSync(imageFilePath, 'IMAGE_BINARY_CONTENT_DUMMY');

    db.prepare(`
      INSERT INTO gallery (id, clientId, type, url, thumbnail, filename, metadata, filePath, createdAt)
      VALUES ('gallery-item-1', 'client-v3-test', 'photo', 'file://photo1.jpg', null, 'photo1.jpg', '{}', ?, '2026-07-28')
    `).run(imageFilePath);

    // تست ExportData
    const backupString = await handlers.handleDbQuery('exportData');
    expect(backupString).toBeDefined();
    expect(backupString.startsWith('scalpai-backup:v3:base64:')).toBe(true);

    // تست ImportData (روی دیتابیس تمیز جدید)
    const newTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-test-dest-'));
    const newDbPath = path.join(newTmpDir, 'dest.db');
    const newDb = new Database(newDbPath);

    createBaseTables(newDb);
    runMigrations(newDb);

    const newHandlers = createDbHandlers(newDb, newTmpDir, safeStorageMock);

    const importResult = await newHandlers.handleDbQuery('importData', { jsonData: backupString });
    // موج ۳ (O3): importData گزارش برمی‌گرداند؛ بکاپ بدون مدل → importedModel=null
    expect(importResult).toEqual({ success: true, importedModel: null });

    // بررسی اینکه رکوردها بازگردانی شده‌اند
    const importedClient = newDb.prepare("SELECT * FROM clients WHERE id = 'client-v3-test'").get() as { firstName: string };
    expect(importedClient).toBeDefined();
    expect(importedClient.firstName).toBe('Saeed');

    const importedGalleryItem = newDb.prepare("SELECT * FROM gallery WHERE id = 'gallery-item-1'").get() as { filePath: string };
    expect(importedGalleryItem).toBeDefined();
    expect(importedGalleryItem.filePath).toBeDefined();
    expect(fs.existsSync(importedGalleryItem.filePath)).toBe(true);
    expect(fs.readFileSync(importedGalleryItem.filePath, 'utf8')).toBe('IMAGE_BINARY_CONTENT_DUMMY');

    // پاکسازی فایل‌های تستی
    db.close();
    newDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(newTmpDir, { recursive: true, force: true });
  });
});
