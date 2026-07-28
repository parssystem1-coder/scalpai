/**
 * پرسشنامهٔ پزشکی هر مراجعه — ذخیره‌سازی واقعی در دیتابیس
 * (SQLite در الکترون، IndexedDB/localforage در مرورگر).
 *
 * فاز ۲: مدل Draft/Final، پیش‌بارگذاری از final مراجعهٔ قبل، و Diff فیلدها.
 */
import { db, type Client, type QuestionnaireRevision } from '../db';
import {
  diffQuestionnaireFields,
  normalizeQuestionnaireValues,
  toQuestionnaireRecord,
  type MedicalQuestionnaireStructured,
  type MedicalQuestionnaireValues,
} from './medicalQuestionnaireSchema';
import { buildQuestionnaireFeatureVector } from './questionnaireMlFeatures';

export type { MedicalQuestionnaireValues, MedicalQuestionnaireStructured };

type LegacyDraftRecord = {
  clientId: string;
  sessionId: string;
  values: MedicalQuestionnaireValues;
  updatedAt: string;
};

const LEGACY_STORAGE_KEY = 'scalpai.medicalQuestionnaireDrafts.v1';
const SAVE_DEBOUNCE_MS = 600;

export interface LoadedQuestionnaireSession {
  values: MedicalQuestionnaireStructured;
  status: QuestionnaireRevision['status'];
  changedFields: string[];
  revision: QuestionnaireRevision | null;
  seededFromPrevious: boolean;
}

// =============== مهاجرت یک‌بارهٔ draftهای قدیمی localStorage ===============

let legacyMigration: Promise<void> | null = null;

async function migrateLegacyDrafts(): Promise<void> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Record<string, LegacyDraftRecord>;
    if (parsed && typeof parsed === 'object') {
      for (const record of Object.values(parsed)) {
        if (!record?.clientId || !record?.sessionId) continue;
        const existing = await db.getQuestionnaireRevision(record.clientId, record.sessionId);
        if (existing) continue;
        await db.saveQuestionnaireRevision({
          clientId: record.clientId,
          sessionId: record.sessionId,
          values: toQuestionnaireRecord(normalizeQuestionnaireValues(record.values || {})),
        });
      }
    }
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to migrate legacy questionnaire drafts:', error);
  }
}

function ensureLegacyDraftsMigrated(): Promise<void> {
  if (!legacyMigration) legacyMigration = migrateLegacyDrafts();
  return legacyMigration;
}

// =============== نوشتن با debounce ===============

type PendingWrite = { clientId: string; values: MedicalQuestionnaireValues };

const pendingWrites = new Map<string, PendingWrite>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

function ageFromBirthDate(birthDate?: string): string {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return '';
  const years = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return years >= 0 && years < 130 ? String(years) : '';
}

function seedFromClientAndPrevious(
  client: Client | null | undefined,
  previous: QuestionnaireRevision | null,
): MedicalQuestionnaireStructured {
  const base = normalizeQuestionnaireValues(previous?.values ?? {});
  return {
    ...base,
    age: base.age || ageFromBirthDate(client?.birthDate),
    gender: base.gender || client?.gender || '',
  };
}

async function persistDraft(sessionId: string): Promise<void> {
  const pending = pendingWrites.get(sessionId);
  pendingWrites.delete(sessionId);
  if (!pending) return;
  try {
    await ensureLegacyDraftsMigrated();
    await db.saveQuestionnaireRevision({
      clientId: pending.clientId,
      sessionId,
      values: toQuestionnaireRecord(normalizeQuestionnaireValues(pending.values)),
      status: 'draft',
    });
  } catch (error) {
    console.error('Failed to save questionnaire draft:', error);
  }
}

/**
 * بارگذاری پرسشنامه برای یک نوبت:
 * - اگر ردیف موجود باشد → همان (نرمال‌شده)
 * - وگرنه → پیش‌بارگذاری از آخرین final قبلی + سن/جنسیت از پروفایل مشتری
 */
export async function loadQuestionnaireForSession(
  clientId: string,
  sessionId: string,
  client?: Client | null,
): Promise<LoadedQuestionnaireSession> {
  const pending = pendingWrites.get(sessionId);
  if (pending && pending.clientId === clientId) {
    return {
      values: normalizeQuestionnaireValues(pending.values),
      status: 'draft',
      changedFields: [],
      revision: null,
      seededFromPrevious: false,
    };
  }

  await ensureLegacyDraftsMigrated();
  try {
    const revision = await db.getQuestionnaireRevision(clientId, sessionId);
    if (revision) {
      return {
        values: normalizeQuestionnaireValues(revision.values),
        status: revision.status,
        changedFields: revision.changedFields || [],
        revision,
        seededFromPrevious: false,
      };
    }

    const previous = await db.getPreviousFinalQuestionnaireRevision(clientId, sessionId);
    return {
      values: seedFromClientAndPrevious(client, previous),
      status: 'draft',
      changedFields: [],
      revision: null,
      seededFromPrevious: !!previous,
    };
  } catch (error) {
    console.error('Failed to load questionnaire session:', error);
    return {
      values: seedFromClientAndPrevious(client, null),
      status: 'draft',
      changedFields: [],
      revision: null,
      seededFromPrevious: false,
    };
  }
}

/** @deprecated — از loadQuestionnaireForSession استفاده کنید */
export async function readMedicalQuestionnaireDraft(
  clientId: string,
  sessionId: string,
): Promise<MedicalQuestionnaireValues | null> {
  const loaded = await loadQuestionnaireForSession(clientId, sessionId);
  if (loaded.revision || loaded.seededFromPrevious) return loaded.values;
  // بدون سابقه: فقط اگر حداقل یک فیلد پر شده باشد برگردان
  const hasContent = Object.values(loaded.values).some(value => {
    if (typeof value === 'string') return value.trim().length > 0;
    if (value && typeof value === 'object' && 'selected' in value) {
      return (value as { selected: string[] }).selected.length > 0;
    }
    return false;
  });
  return hasContent ? loaded.values : null;
}

/**
 * ذخیرهٔ پیش‌نویس (fire-and-forget با debounce).
 * اگر وضعیت فعلی final باشد، ذخیرهٔ تایپی آن را به draft برنمی‌گرداند —
 * برای ویرایش باید reopenQuestionnaireForEdit صدا زده شود.
 */
export function saveMedicalQuestionnaireDraft(
  clientId: string,
  sessionId: string,
  values: MedicalQuestionnaireValues,
): void {
  pendingWrites.set(sessionId, {
    clientId,
    values: normalizeQuestionnaireValues(values),
  });

  const existingTimer = pendingTimers.get(sessionId);
  if (existingTimer) clearTimeout(existingTimer);
  pendingTimers.set(
    sessionId,
    setTimeout(() => {
      pendingTimers.delete(sessionId);
      void persistDraft(sessionId);
    }, SAVE_DEBOUNCE_MS),
  );
}

export async function flushMedicalQuestionnaireDrafts(): Promise<void> {
  for (const [sessionId, timer] of pendingTimers) {
    clearTimeout(timer);
    pendingTimers.delete(sessionId);
    await persistDraft(sessionId);
  }
}

/** برگشت از final به draft برای ویرایش */
export async function reopenQuestionnaireForEdit(
  clientId: string,
  sessionId: string,
  values: MedicalQuestionnaireValues,
): Promise<QuestionnaireRevision> {
  await flushMedicalQuestionnaireDrafts();
  await ensureLegacyDraftsMigrated();
  return db.saveQuestionnaireRevision({
    clientId,
    sessionId,
    values: toQuestionnaireRecord(normalizeQuestionnaireValues(values)),
    status: 'draft',
  });
}

/**
 * ثبت نهایی (یا به‌روزرسانی نهایی): Diff نسبت به final قبلی محاسبه و ذخیره می‌شود.
 */
export async function finalizeQuestionnaireRevision(
  clientId: string,
  sessionId: string,
  values: MedicalQuestionnaireValues,
): Promise<QuestionnaireRevision> {
  await flushMedicalQuestionnaireDrafts();
  await ensureLegacyDraftsMigrated();
  const normalized = normalizeQuestionnaireValues(values);
  const previous = await db.getPreviousFinalQuestionnaireRevision(clientId, sessionId);
  const changedFields = diffQuestionnaireFields(previous?.values, normalized);
  return db.saveQuestionnaireRevision({
    clientId,
    sessionId,
    values: toQuestionnaireRecord(normalized),
    status: 'final',
    changedFields,
  });
}

/**
 * آخرین پرسشنامهٔ مشتری را برای بردار ML برمی‌گرداند (ترجیح final جدیدتر).
 * برای نمونه‌های آموزشی که sessionId عکس مشخص نیست.
 */
export async function loadQuestionnaireFeaturesForClient(
  clientId: string | undefined | null,
): Promise<number[] | undefined> {
  if (!clientId) return undefined;
  try {
    const revisions = await db.getQuestionnaireRevisionsByClient(clientId);
    if (!revisions.length) return undefined;
    const sorted = [...revisions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const pick = sorted.find(r => r.status === 'final') || sorted[0];
    return buildQuestionnaireFeatureVector(pick.values, pick.changedFields || []);
  } catch (error) {
    console.warn('Loading questionnaire features for client failed:', error);
    return undefined;
  }
}
