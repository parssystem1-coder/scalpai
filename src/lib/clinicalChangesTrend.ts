/**
 * داده‌های تب «روند تغییرات بالینی»:
 * خط زمانی پرسشنامه‌های final، روند امتیاز تحلیل‌ها، و جفت عکس هم‌ناحیه/هم‌لنز.
 */
import type {
  Analysis,
  ClinicalAnalysisResult,
  GalleryItem,
  QuestionnaireRevision,
  Session,
} from '../db';
import {
  QUESTIONNAIRE_COMPARE_KEYS,
  type QuestionnaireFieldKey,
} from './medicalQuestionnaireSchema';
import {
  getScalpRegion,
  readScalpRegionFromMetadata,
  type ScalpRegionId,
} from './scalpRegions';
import {
  getTrichoscopeMode,
  readTrichoscopeModeFromMetadata,
  type TrichoscopeModeId,
} from './trichoscopeModes';

function clinicalResultOf(
  analysis: Analysis,
  source: 'ai' | 'offline',
): ClinicalAnalysisResult | null {
  return source === 'ai' ? (analysis.aiResults ?? null) : (analysis.offlineResults ?? null);
}

export const FIELD_LABELS_FA: Record<QuestionnaireFieldKey, string> = {
  age: 'سن',
  gender: 'جنسیت',
  history: 'سابقه پزشکی',
  medications: 'داروها',
  allergies: 'آلرژی‌ها',
  previousTreatments: 'درمان‌های قبلی',
  familyHistory: 'سابقه خانوادگی',
  stressLevel: 'استرس',
  sleepQuality: 'خواب',
  dietType: 'رژیم غذایی',
  lifestyle: 'سبک زندگی',
};

export const FIELD_LABELS_EN: Record<QuestionnaireFieldKey, string> = {
  age: 'Age',
  gender: 'Gender',
  history: 'Medical history',
  medications: 'Medications',
  allergies: 'Allergies',
  previousTreatments: 'Previous treatments',
  familyHistory: 'Family history',
  stressLevel: 'Stress',
  sleepQuality: 'Sleep',
  dietType: 'Diet',
  lifestyle: 'Lifestyle',
};

export interface QuestionnaireVisitPoint {
  revisionId: string;
  sessionId: string;
  dateLabel: string;
  sortKey: string;
  status: QuestionnaireRevision['status'];
  changedFields: QuestionnaireFieldKey[];
  analysisCount: number;
}

export interface ScoreTrendPoint {
  id: string;
  sortKey: string;
  dateLabel: string;
  source: 'ai' | 'offline';
  density: number;
  oiliness: number;
  dryness: number;
  dandruff: number;
  redness: number;
}

export interface RegionLensPhotoPair {
  key: string;
  regionId: ScalpRegionId;
  regionFa: string;
  regionEn: string;
  lensModeId: TrichoscopeModeId;
  lensFa: string;
  lensEn: string;
  lensColor: string;
  older: GalleryItem;
  newer: GalleryItem;
  photoCount: number;
}

function sessionSortKey(session: Session | undefined, fallbackIso: string): string {
  if (session?.date) return `${session.date}T${session.time || '00:00'}`;
  return fallbackIso;
}

function dateLabelFromKey(sortKey: string): string {
  return sortKey.slice(0, 10);
}

function asFieldKeys(raw: string[] | undefined): QuestionnaireFieldKey[] {
  return (raw || []).filter((key): key is QuestionnaireFieldKey =>
    QUESTIONNAIRE_COMPARE_KEYS.includes(key as QuestionnaireFieldKey),
  );
}

/** خط زمانی نسخه‌های final پرسشنامه + تعداد تحلیل‌های همان نوبت */
export function buildQuestionnaireVisitTimeline(
  revisions: QuestionnaireRevision[],
  sessions: Session[],
  analyses: Analysis[],
): QuestionnaireVisitPoint[] {
  const sessionById = new Map(sessions.map(s => [s.id, s]));
  const finals = revisions.filter(r => r.status === 'final');

  return finals
    .map(revision => {
      const session = sessionById.get(revision.sessionId);
      const sortKey = sessionSortKey(session, revision.updatedAt || revision.createdAt);
      const analysisCount = analyses.filter(a => a.sessionId === revision.sessionId).length;
      return {
        revisionId: revision.id,
        sessionId: revision.sessionId,
        dateLabel: dateLabelFromKey(sortKey),
        sortKey,
        status: revision.status,
        changedFields: asFieldKeys(revision.changedFields),
        analysisCount,
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/** روند امتیاز از تحلیل‌های آنلاین و آفلاین (قدیمی → جدید) */
export function buildScoreTrendPoints(analyses: Analysis[]): ScoreTrendPoint[] {
  const points: ScoreTrendPoint[] = [];

  for (const analysis of analyses) {
    const candidates: Array<'ai' | 'offline'> = [];
    if (analysis.aiResults) candidates.push('ai');
    if (analysis.offlineResults) candidates.push('offline');
    // تحلیل‌های قدیمی بدون نتیجهٔ typed را بر اساس type در نظر بگیر
    if (candidates.length === 0) {
      if (analysis.type === 'ai') candidates.push('ai');
      if (analysis.type === 'offline') candidates.push('offline');
    }

    for (const source of candidates) {
      const result = clinicalResultOf(analysis, source);
      if (!result) continue;
      points.push({
        id: `${analysis.id}-${source}`,
        sortKey: analysis.createdAt,
        dateLabel: analysis.createdAt.slice(0, 10),
        source,
        density: result.hairDensity.score,
        oiliness: result.scalpCondition.oiliness,
        dryness: result.scalpCondition.dryness,
        dandruff: result.scalpCondition.dandruff ?? 0,
        redness: result.scalpCondition.redness ?? 0,
      });
    }
  }

  return points.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/**
 * برای هر ترکیب ناحیه+لنز که حداقل ۲ عکس دارد،
 * قدیمی‌ترین و جدیدترین را برای مقایسه کنار هم برمی‌گرداند.
 */
export function buildRegionLensPhotoPairs(items: GalleryItem[]): RegionLensPhotoPair[] {
  const groups = new Map<string, GalleryItem[]>();

  for (const item of items) {
    if (item.type && item.type !== 'photo') continue;
    const regionId = readScalpRegionFromMetadata(item.metadata);
    const modeId = readTrichoscopeModeFromMetadata(item.metadata) ?? 'NL';
    if (!regionId) continue;
    const key = `${regionId}::${modeId}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const pairs: RegionLensPhotoPair[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const older = sorted[0];
    const newer = sorted[sorted.length - 1];
    if (older.id === newer.id) continue;

    const [regionId, lensModeId] = key.split('::') as [ScalpRegionId, TrichoscopeModeId];
    const region = getScalpRegion(regionId);
    const mode = getTrichoscopeMode(lensModeId);
    if (!region || !mode) continue;

    pairs.push({
      key,
      regionId,
      regionFa: region.fa,
      regionEn: region.en,
      lensModeId,
      lensFa: mode.fa,
      lensEn: mode.en,
      lensColor: mode.color,
      older,
      newer,
      photoCount: sorted.length,
    });
  }

  return pairs.sort((a, b) => a.regionFa.localeCompare(b.regionFa, 'fa'));
}
