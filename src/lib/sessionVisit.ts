/**
 * گروه‌بندی و تجمیع تحلیل‌های چندعکسی یک جلسه/مراجعه.
 */
import { buildLesionSummary } from './lesionSummary';
import type { Analysis, ClinicalAnalysisResult, GalleryItem, OfflineAnalysisResult, Session } from '../db';
import { mergeObservationIds } from './diagnosisCatalog';


export type ResultSource = 'ai' | 'offline';

export type VisitGroup = {
  /** sessionId واقعی یا کلید مصنوعی برای رکوردهای قدیمی */
  key: string;
  sessionId?: string;
  clientId: string;
  type: Analysis['type'];
  createdAt: string;
  analyses: Analysis[];
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function maxNum(nums: number[]): number {
  return nums.length ? Math.round(Math.max(...nums)) : 0;
}

/** شدت نسبی سطح ریزش برای انتخاب بدترین */
function lossSeverity(level: string): number {
  const t = (level || '').toLowerCase();
  if (/شدید|severe|high/.test(t)) return 3;
  if (/متوسط|moderate|medium/.test(t)) return 2;
  if (/خفیف|mild|low|light/.test(t)) return 1;
  return 0;
}

export function getAnalysisClinicalResult(
  a: Analysis,
  source: ResultSource,
): ClinicalAnalysisResult | null {
  return source === 'ai' ? (a.aiResults ?? null) : (a.offlineResults ?? null);
}

/** کلید گروه‌بندی جلسه — با sessionId یا fallback روز+نوع */
export function visitKeyForAnalysis(a: Analysis): string {
  if (a.sessionId) return `sid:${a.sessionId}`;
  const day = (a.createdAt || '').slice(0, 10);
  return `legacy:${a.clientId}|${a.type}|${day}`;
}

/** نوبت فعال برای ذخیرهٔ تحلیل‌های چندعکسی */
export function resolveActiveSession(
  sessions: Session[],
  clientId: string,
): Session | undefined {
  const scheduled = sessions
    .filter(s => s.clientId === clientId && s.status === 'scheduled')
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
  return scheduled[0];
}

/** آیا برای این نوبت حداقل یک تحلیل از نوع مشخص ثبت شده؟ */
export function sessionHasAnalysisType(
  analyses: Analysis[],
  sessionId: string,
  type: Analysis['type'],
): boolean {
  return analyses.some(a => a.sessionId === sessionId && a.type === type);
}

/**
 * واجد شرایط بودن ماژول تحلیل:
 * نوبت scheduled دارد و برای همان نوبت هنوز تحلیل این نوع ثبت نشده.
 * (بستن نوبت فقط با «پایان مراجعه» / ذخیرهٔ دستی نهایی تریکولوژیست)
 */
export function isClientEligibleForModule(
  clientId: string,
  sessions: Session[],
  analyses: Analysis[],
  type: Analysis['type'],
): boolean {
  const session = resolveActiveSession(sessions, clientId);
  if (!session) return false;
  return !sessionHasAnalysisType(analyses, session.id, type);
}

/** مشتریانی که هنوز برای این ماژول در نوبت فعال کار دارند */
export function filterClientsEligibleForModule<T extends { id: string }>(
  clients: T[],
  sessions: Session[],
  analyses: Analysis[],
  type: Analysis['type'],
): T[] {
  return clients.filter(c => isClientEligibleForModule(c.id, sessions, analyses, type));
}

export function groupAnalysesIntoVisits(
  analyses: Analysis[],
  type?: Analysis['type'],
): VisitGroup[] {
  const map = new Map<string, VisitGroup>();
  for (const a of analyses) {
    if (type && a.type !== type) continue;
    const key = visitKeyForAnalysis(a);
    const existing = map.get(key);
    if (existing) {
      existing.analyses.push(a);
      if (a.createdAt > existing.createdAt) existing.createdAt = a.createdAt;
    } else {
      map.set(key, {
        key,
        sessionId: a.sessionId,
        clientId: a.clientId,
        type: a.type,
        createdAt: a.createdAt,
        analyses: [a],
      });
    }
  }
  for (const g of map.values()) {
    g.analyses.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function analysesInSameVisit(
  all: Analysis[],
  seed: Analysis,
): Analysis[] {
  const key = visitKeyForAnalysis(seed);
  return all
    .filter(a => a.type === seed.type && a.clientId === seed.clientId && visitKeyForAnalysis(a) === key)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function analysesForSessionId(
  all: Analysis[],
  sessionId: string,
  type: Analysis['type'],
  clientId: string,
): Analysis[] {
  return all
    .filter(a => a.clientId === clientId && a.type === type && a.sessionId === sessionId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * تجمیع نتایج چند عکس یک جلسه:
 * - مشاهدات/توصیه‌ها: اجتماع
 * - ضایعات: همه با هم
 * - امتیازهای مشکل‌محور: بیشینه (بدترین)
 * - تراکم: میانگین
 */
export function aggregateVisitResults(
  analyses: Analysis[],
  source: ResultSource,
  gallery: GalleryItem[] = [],
): ClinicalAnalysisResult | null {
  const results = analyses
    .map(a => getAnalysisClinicalResult(a, source))
    .filter((r): r is ClinicalAnalysisResult => !!r);
  if (results.length === 0) return null;
  const lesionSummary = buildLesionSummary(analyses, source, gallery);
  if (results.length === 1) return { ...results[0], lesionSummary };

  const observations = mergeObservationIds(...results.map(r => r.observations ?? []));
  const lesions = results.flatMap(r => r.lesions ?? []);
  const recommendations = [...new Set(results.flatMap(r => r.recommendations ?? []))];

  const densityScore = avg(results.map(r => r.hairDensity.score));
  const densityLevel =
    densityScore >= 70 ? results[0].hairDensity.level :
    densityScore >= 40 ? results.find(r => /متوسط|medium|moderate/i.test(r.hairDensity.level))?.hairDensity.level
      ?? results[0].hairDensity.level :
    results.find(r => lossSeverity(r.hairDensity.level) >= 0)?.hairDensity.level
      ?? results[0].hairDensity.level;

  // برای سطح تراکم از رکورد با کمترین امتیاز استفاده کن
  const densest = [...results].sort((a, b) => a.hairDensity.score - b.hairDensity.score)[0];

  const worstLoss = [...results].sort(
    (a, b) => lossSeverity(b.hairLoss.level) - lossSeverity(a.hairLoss.level),
  )[0];

  const scalpCondition = {
    oiliness: maxNum(results.map(r => r.scalpCondition.oiliness)),
    dryness: maxNum(results.map(r => r.scalpCondition.dryness)),
    dandruff: maxNum(results.map(r => r.scalpCondition.dandruff ?? 0)),
    redness: maxNum(results.map(r => r.scalpCondition.redness ?? 0)),
    shine: maxNum(results.map(r => r.scalpCondition.shine ?? 0)),
    patchiness: maxNum(results.map(r => r.scalpCondition.patchiness ?? 0)),
    pigmentation: maxNum(results.map(r => r.scalpCondition.pigmentation ?? 0)),
    hairThickness: avg(results.map(r => r.scalpCondition.hairThickness ?? 50)),
  };

  const patterns = [...new Set(results.map(r => r.hairLoss.pattern).filter(Boolean))];
  const filledHeuristic = results.some(r => r.observationsFilledFromHeuristic);
  const latest = results[results.length - 1];

  // imageQuality فقط روی OfflineAnalysisResult تعریف شده؛ برای نمای تجمیعی
  // چندعکسی، بدترین ارزیابی (اگر هر کدام مشکل داشت) را نگه می‌داریم تا
  // هشدار کیفیت تصویر در UI گم نشود.
  const qualityCandidates = results
    .map(r => (r as { imageQuality?: OfflineAnalysisResult['imageQuality'] }).imageQuality)
    .filter((q): q is NonNullable<OfflineAnalysisResult['imageQuality']> => !!q);
  const imageQuality = qualityCandidates.find(q => q.hasIssue) ?? qualityCandidates[0];

  return {
    lesions,
    lesionSummary,
    observations,
    hairDensity: {
      level: densest.hairDensity.level || densityLevel,
      score: densityScore,
    },
    scalpCondition,
    hairLoss: {
      level: worstLoss.hairLoss.level,
      pattern: patterns.join(' | '),
    },
    recommendations,
    chartData: densest.chartData,
    // اگر هر کدام از تحلیل‌های این مراجعه تصویر annotate دارد، پرچم حفظ شود
    // تا UI بتواند آن را on-demand بگیرد (تصویر خودش در لیست حمل نمی‌شود).
    hasAnnotatedImage: results.some(r => r.hasAnnotatedImage || r.annotatedImageBase64)
      || undefined,
    observationsFilledFromHeuristic: filledHeuristic || undefined,
    // زمینهٔ اکتساب/پرسشنامه از آخرین تحلیل بازدید حفظ می‌شود
    acquisitionContext: latest.acquisitionContext,
    questionnaireContext: latest.questionnaireContext,
    questionnaireInterpretation: latest.questionnaireInterpretation,
    ...(imageQuality ? { imageQuality } : {}),
  };
}


/** یک رکورد نماینده برای هر جلسه با نتیجهٔ تجمیعی (برای روند/آرشیو) */
export function buildVisitLevelHistory(
  analyses: Analysis[],
  type: Analysis['type'],
  source: ResultSource,
): Analysis[] {
  return groupAnalysesIntoVisits(analyses, type).map(g => {
    const latest = [...g.analyses].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const aggregated = aggregateVisitResults(g.analyses, source);
    if (!aggregated) return latest;
    return {
      ...latest,
      observations: aggregated.observations,
      recommendations: aggregated.recommendations?.join('\n'),
      aiResults: source === 'ai' ? (aggregated as Analysis['aiResults']) : latest.aiResults,
      offlineResults: source === 'offline' ? (aggregated as Analysis['offlineResults']) : latest.offlineResults,
    };
  });
}
