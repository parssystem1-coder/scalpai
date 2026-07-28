/**
 * backupPackage.test.ts — رفت-وبرگشت بکاپ نسخهٔ ۳ (فاز ۰.۵)
 *
 * این تست سناریوی واقعی را روی SQLite واقعی (فایل موقت) اجرا می‌کند:
 * دیتابیس مبدأ با مشتری + عکس فایل‌محور + تحلیل با تصویر annotate‌شده +
 * نمونهٔ آموزشی با thumbnail → exportBackupPackage → importDataPackage در
 * یک دیتابیس کاملاً تازه → همهٔ داده‌ها و رسانه‌ها سالم برمی‌گردند، درحالی‌که
 * data.json فقط فرادادهٔ سبک است (بدون base64 رسانه).
 *
 * همچنین مسیر کلاسیک v2 (exportData/importData) نباید با refactor شکسته شود.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import backupPkg from '../../electron/backup-package.cjs';
import { createDbHandlers } from '../../electron/db-handlers.cjs';
import { createBaseTables } from '../../electron/schema-migrations.cjs';

/** قرارداد تایپ‌شدهٔ ماژول .cjs — جایگزین `as any` تا ESLint دقیق بماند */
interface BackupPackageModule {
  packageDirName: (date?: Date) => string;
  parseBackupPackage: (dataJsonPath: string) => {
    data: Record<string, unknown>;
    packageDir: string;
    resolveMedia: (rel: string) => string;
  };
  createPackageEnvelope: (data: object) => object;
  extractAnnotatedImage: (
    result: Record<string, unknown> | null,
    fileBase: string,
  ) => {
    result: Record<string, unknown> | null;
    mediaFileName: string | null;
    buffer: Buffer | null;
  };
  readAsBase64DataUrl: (filePath: string, mimeType?: string) => string;
  copyFileStreaming: (srcPath: string, destPath: string) => Promise<void>;
  BACKUP_PACKAGE_VERSION: number;
  MEDIA_DIR_NAME: string;
}

const {
  packageDirName,
  parseBackupPackage,
  createPackageEnvelope,
  extractAnnotatedImage,
  readAsBase64DataUrl,
  copyFileStreaming,
  BACKUP_PACKAGE_VERSION,
  MEDIA_DIR_NAME,
} = backupPkg as BackupPackageModule;

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let tmpRoot: string;
let userDataA: string;
let userDataB: string;
let userDataC: string;

type Handlers = {
  handleDbQuery: (method: string, params: Record<string, unknown>) => Promise<unknown>;
};

function makeHandlers(userDataPath: string): { handlers: Handlers; db: InstanceType<typeof Database> } {
  fs.mkdirSync(userDataPath, { recursive: true });
  const db = new Database(path.join(userDataPath, 'scalpai.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createBaseTables(db);
  // safeStorage=null → encryptValue/decryptValue بدون تغییر عبور می‌کنند (رفتار آزمون)
  const handlers = createDbHandlers(db, userDataPath, null) as unknown as Handlers;
  return { handlers, db };
}

async function seedSourceDatabase(handlers: Handlers) {
  const now = new Date().toISOString();
  await handlers.handleDbQuery('createClient', {
    firstName: 'تست', lastName: 'بکاپ', phone: '09120000000', email: '',
    gender: 'male', birthDate: '', notes: '', createdAt: now, updatedAt: now,
  });
  const clients = await handlers.handleDbQuery('getClients', {}) as Array<{ id: string }>;
  const clientId = clients[0].id;

  const galleryItem = await handlers.handleDbQuery('addGalleryItem', {
    clientId, type: 'photo', url: TINY_PNG_DATA_URL,
    thumbnail: TINY_PNG_DATA_URL, filename: 'scalp.png', metadata: { note: 'test' },
  }) as { id: string };

  await handlers.handleDbQuery('createAnalysis', {
    clientId, type: 'offline', galleryItemId: galleryItem.id,
    recommendations: 'rec', treatmentPlan: 'plan',
    aiResults: {
      annotatedImageBase64: TINY_PNG_DATA_URL,
      hairDensity: { level: 'متوسط', score: 55 },
      lesions: [], observations: [], recommendations: [],
    },
  });

  await handlers.handleDbQuery('addTrainingSample', {
    clientId, galleryItemId: galleryItem.id,
    features: { brightness: 100 }, label: { oiliness: 40 },
    labelSource: 'expert', confidence: 1,
    imageThumbnail: TINY_PNG_DATA_URL,
  });

  return { clientId, galleryItemId: galleryItem.id };
}

describe('backup-package.cjs — واحدهای pure', () => {
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-backup-pure-'));
  });
  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('نام پوشهٔ بکاپ قالب استاندارد را رعایت می‌کند', () => {
    const name = packageDirName(new Date(2026, 6, 28, 15, 30, 45));
    expect(name).toMatch(/^scalpai-backup-2026-07-28-153045$/);
  });

  it('extractAnnotatedImage فقط وقتی base64 واقعی هست استخراج می‌کند', () => {
    const withImage = extractAnnotatedImage(
      { annotatedImageBase64: TINY_PNG_DATA_URL, score: 5 },
      'analysis-x-ai',
    );
    expect(withImage.buffer).not.toBeNull();
    expect(withImage.mediaFileName).toBe('analysis-x-ai.png');
    expect(withImage.result!.annotatedImageRef).toBe(`${MEDIA_DIR_NAME}/analysis-x-ai.png`);
    expect(withImage.result!.annotatedImageBase64).toBeUndefined();
    expect(withImage.result!.score).toBe(5);

    expect(extractAnnotatedImage(null, 'a').buffer).toBeNull();
    expect(extractAnnotatedImage({ score: 1 } as Record<string, unknown>, 'a').buffer).toBeNull();
  });

  it('parseBackupPackage ارجاع‌های traversal را رد می‌کند و فایل‌های واقعی را قبول می‌کند', () => {
    const pkgDir = path.join(tmpRoot, 'pkg');
    fs.mkdirSync(path.join(pkgDir, MEDIA_DIR_NAME), { recursive: true });
    fs.writeFileSync(path.join(pkgDir, MEDIA_DIR_NAME, 'a.png'), 'PNGDATA');
    fs.writeFileSync(
      path.join(pkgDir, 'data.json'),
      JSON.stringify(createPackageEnvelope({ clients: [], gallery: [] }), null, 2),
    );

    const parsed = parseBackupPackage(path.join(pkgDir, 'data.json'));
    expect(parsed.data.clients).toEqual([]);
    expect(parsed.resolveMedia(`${MEDIA_DIR_NAME}/a.png`)).toContain('a.png');
    expect(() => parsed.resolveMedia('../secrets.txt')).toThrow();
    expect(() => parsed.resolveMedia('/etc/passwd')).toThrow();
    expect(() => parsed.resolveMedia(`${MEDIA_DIR_NAME}/missing.png`)).toThrow(/پیدا نشد/);

    // پاکت با نسخهٔ نادرست رد می‌شود
    fs.writeFileSync(
      path.join(tmpRoot, 'wrong.json'),
      JSON.stringify({ format: 'scalpai-backup', version: 2, data: {} }),
    );
    expect(() => parseBackupPackage(path.join(tmpRoot, 'wrong.json'))).toThrow(/نسخهٔ ۳/);
  });

  it('copyFileStreaming و readAsBase64DataUrl رفت‌و‌برگشت دقیق دارند', async () => {
    const src = path.join(tmpRoot, 'src.png');
    const dst = path.join(tmpRoot, 'dst.png');
    fs.writeFileSync(src, 'BINARY-CONTENT-1234');
    await copyFileStreaming(src, dst);
    expect(fs.readFileSync(dst, 'utf-8')).toBe('BINARY-CONTENT-1234');
    expect(readAsBase64DataUrl(dst, 'image/png')).toBe(
      `data:image/png;base64,${Buffer.from('BINARY-CONTENT-1234').toString('base64')}`,
    );
    expect(BACKUP_PACKAGE_VERSION).toBe(3);
  });
});

describe('رفت‌وبرگشت کامل بکاپ v3 روی SQLite واقعی', () => {
  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scalpai-backup-e2e-'));
    userDataA = path.join(tmpRoot, 'userData-A');
    userDataB = path.join(tmpRoot, 'userData-B');
    userDataC = path.join(tmpRoot, 'userData-C');
  });
  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('export→import در دیتابیس تازه، داده و رسانه را سالم برمی‌گرداند', async () => {
    const { handlers: handlersA, db: dbA } = makeHandlers(userDataA);
    const { clientId, galleryItemId } = await seedSourceDatabase(handlersA);

    const exportDir = path.join(tmpRoot, 'exports');
    fs.mkdirSync(exportDir, { recursive: true });
    const exportResult = await handlersA.handleDbQuery('exportBackupPackage', { baseDir: exportDir }) as { path?: string; error?: string };
    expect(exportResult.error).toBeUndefined();
    const pkgDir = exportResult.path!;
    const dataJsonPath = path.join(pkgDir, 'data.json');
    expect(fs.existsSync(dataJsonPath)).toBe(true);

    // data.json سبک است: هیچ base64 رسانه‌ای داخلش نیست (رسانه‌ها فایل جدا هستند)
    const dataJsonRaw = fs.readFileSync(dataJsonPath, 'utf-8');
    expect(dataJsonRaw.includes('base64,')).toBe(false);

    // رسانه‌ها واقعاً در media/ کپی شده‌اند
    const mediaFiles = fs.readdirSync(path.join(pkgDir, MEDIA_DIR_NAME));
    expect(mediaFiles.some(f => f.startsWith(galleryItemId))).toBe(true);
    expect(mediaFiles.some(f => f.startsWith('analysis-'))).toBe(true);
    expect(mediaFiles.some(f => f.startsWith('thumb-'))).toBe(true);

    // — واردکردن در دیتابیس کاملاً تازه
    const { handlers: handlersB, db: dbB } = makeHandlers(userDataB);
    // یک ردیف نامرتبط قبلی تا مطمئن شویم جایگزینی کامل اتفاق می‌افتد
    await handlersB.handleDbQuery('createClient', {
      firstName: 'قدیمی', lastName: 'دیتا', phone: '1', email: '',
      gender: 'female', birthDate: '', notes: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });

    const importResult = await handlersB.handleDbQuery('importDataPackage', { dataJsonPath });
    expect(importResult).toEqual({ success: true });

    const clients = await handlersB.handleDbQuery('getClients', {}) as Array<{ id: string; firstName: string }>;
    expect(clients.length).toBe(1);
    expect(clients[0].firstName).toBe('تست');

    const gallery = await handlersB.handleDbQuery('getGalleryByClient', { clientId }) as Array<{ id: string; filePath: string | null }>;
    expect(gallery.length).toBe(1);
    expect(gallery[0].filePath).toBeTruthy();
    expect(fs.existsSync(gallery[0].filePath!)).toBe(true);

    const dataUrl = await handlersB.handleDbQuery('getGalleryItemDataUrl', { id: galleryItemId }) as string;
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    const analyses = await handlersB.handleDbQuery('getAnalysesByClient', { clientId }) as Array<{ id: string; aiResults: { hasAnnotatedImage?: boolean } }>;
    expect(analyses.length).toBe(1);
    // قرارداد لیست: محتوای annotate حذف و فقط پرچم می‌ماند؛ محتوا با متد اختصاصی می‌آید
    expect(analyses[0].aiResults.hasAnnotatedImage).toBe(true);
    const annotated = await handlersB.handleDbQuery('getAnalysisAnnotatedImage', { id: analyses[0].id }) as string;
    expect(annotated.startsWith('data:image/png;base64,')).toBe(true);

    const samples = await handlersB.handleDbQuery('getTrainingSamples', {}) as Array<{ imageThumbnail?: string }>;
    expect(samples.length).toBe(1);
    expect(samples[0].imageThumbnail?.startsWith('data:')).toBe(true);

    dbA.close();
    dbB.close();
  });

  it('مسیر کلاسیک v2 (exportData→importData) بعد از refactor سالم است', async () => {
    const { handlers: handlersA2, db: dbA2 } = makeHandlers(path.join(tmpRoot, 'userData-A2'));
    await seedSourceDatabase(handlersA2);
    const jsonBackup = await handlersA2.handleDbQuery('exportData', {}) as string;
    expect(typeof jsonBackup).toBe('string');
    expect(jsonBackup.includes('scalpai-backup')).toBe(true);

    const { handlers: handlersC, db: dbC } = makeHandlers(userDataC);
    const result = await handlersC.handleDbQuery('importData', { jsonData: jsonBackup });
    expect(result).toEqual({ success: true });
    const clients = await handlersC.handleDbQuery('getClients', {}) as Array<{ firstName: string }>;
    expect(clients[0].firstName).toBe('تست');

    dbA2.close();
    dbC.close();
  });
});
