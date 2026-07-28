import type { Analysis, ClinicalAnalysisResult } from '../../db';
import type { Lang } from '../../i18n';
import { lesionDisplayLabel, resolveObservationToken } from '../../lib/diagnosisCatalog';
import { offlineDict } from './strings';

export type ResultSource = 'offline' | 'ai';

export function getAnalysisClinicalResult(
  a: Analysis,
  source: ResultSource,
): ClinicalAnalysisResult | null {
  return source === 'ai' ? (a.aiResults ?? null) : (a.offlineResults ?? null);
}

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface KeyFinding {
  id: string;
  label: string;
  value: number;
  /** برای تراکم، مقدار بالاتر بهتر است؛ برای بقیه معمولاً بالاتر = بدتر */
  inverted?: boolean;
  severity: FindingSeverity;
}

export type RecPriority = 'urgent' | 'care' | 'followup';

export interface PrioritizedRecommendation {
  text: string;
  priority: RecPriority;
}

export interface MetricDelta {
  id: string;
  label: string;
  current: number;
  previous: number;
  /** تغییر نسبت به قبل: مثبت = افزایش عددی */
  delta: number;
  /** آیا افزایش برای این شاخص خوب است؟ (فقط تراکم) */
  higherIsBetter: boolean;
}

function severityOfIssue(value: number): FindingSeverity {
  if (value >= 60) return 'high';
  if (value >= 40) return 'medium';
  return 'low';
}

function severityOfDensity(score: number): FindingSeverity {
  if (score < 35) return 'high';
  if (score < 55) return 'medium';
  return 'low';
}

/** ۳ یافتهٔ کلیدی بر اساس شدت مشکل */
export function extractKeyFindings(
  result: ClinicalAnalysisResult,
  lang: Lang,
  limit = 3,
): KeyFinding[] {
  const d = offlineDict;
  const candidates: KeyFinding[] = [
    {
      id: 'density',
      label: d.hairDensity[lang],
      value: result.hairDensity.score,
      inverted: true,
      severity: severityOfDensity(result.hairDensity.score),
    },
    {
      id: 'oiliness',
      label: d.oiliness[lang],
      value: result.scalpCondition.oiliness,
      severity: severityOfIssue(result.scalpCondition.oiliness),
    },
    {
      id: 'dryness',
      label: d.dryness[lang],
      value: result.scalpCondition.dryness,
      severity: severityOfIssue(result.scalpCondition.dryness),
    },
  ];

  if (result.scalpCondition.dandruff != null) {
    candidates.push({
      id: 'dandruff',
      label: d.dandruff[lang],
      value: result.scalpCondition.dandruff,
      severity: severityOfIssue(result.scalpCondition.dandruff),
    });
  }
  if (result.scalpCondition.redness != null) {
    candidates.push({
      id: 'redness',
      label: d.redness[lang],
      value: result.scalpCondition.redness,
      severity: severityOfIssue(result.scalpCondition.redness),
    });
  }
  if (result.scalpCondition.shine != null) {
    candidates.push({
      id: 'shine',
      label: d.shine[lang],
      value: result.scalpCondition.shine,
      severity: severityOfIssue(result.scalpCondition.shine),
    });
  }
  if (result.scalpCondition.patchiness != null) {
    candidates.push({
      id: 'patchiness',
      label: d.patchiness[lang],
      value: result.scalpCondition.patchiness,
      severity: severityOfIssue(result.scalpCondition.patchiness),
    });
  }
  if (result.scalpCondition.pigmentation != null) {
    candidates.push({
      id: 'pigmentation',
      label: d.pigmentation[lang],
      value: result.scalpCondition.pigmentation,
      severity: severityOfIssue(result.scalpCondition.pigmentation),
    });
  }

  for (let i = 0; i < result.lesions.length; i++) {
    const lesion = result.lesions[i];
    const conf = Math.round(lesion.confidence * 100);
    candidates.push({
      id: `lesion-${lesion.type}-${i}`,
      label: lesionDisplayLabel(lesion.type, lang),
      value: conf,
      severity: severityOfIssue(conf),
    });
  }

  const rank = (f: KeyFinding) => (f.inverted ? 100 - f.value : f.value);

  // A model may return several boxes of the same finding type. The key
  // findings chart is a semantic summary, so keep one entry per finding and
  // retain the strongest occurrence rather than repeating the same label.
  const unique = new Map<string, KeyFinding>();
  for (const finding of candidates) {
    const lesionId = finding.id.startsWith('lesion-')
      ? finding.id.slice('lesion-'.length).replace(/-\d+$/, '')
      : finding.id;
    const canonical = resolveObservationToken(lesionId);
    const key = canonical || finding.id;
    const previous = unique.get(key);
    if (!previous || (finding.severity === 'high' && previous.severity !== 'high') || rank(finding) > rank(previous)) {
      unique.set(key, finding);
    }
  }

  return [...unique.values()]
    .sort((a, b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 };
      if (sevOrder[a.severity] !== sevOrder[b.severity]) {
        return sevOrder[a.severity] - sevOrder[b.severity];
      }
      return rank(b) - rank(a);
    })
    .slice(0, limit);
}

function metricSeverity(result: ClinicalAnalysisResult): Record<string, number> {
  return {
    dandruff: result.scalpCondition.dandruff ?? 0,
    redness: result.scalpCondition.redness ?? 0,
    oiliness: result.scalpCondition.oiliness,
    dryness: result.scalpCondition.dryness,
    shine: result.scalpCondition.shine ?? 0,
    patchiness: result.scalpCondition.patchiness ?? 0,
    pigmentation: result.scalpCondition.pigmentation ?? 0,
    density: 100 - result.hairDensity.score,
    lesion: result.lesions.length
      ? Math.max(...result.lesions.map(l => l.confidence * 100))
      : 0,
  };
}

function matchRecKeys(text: string): string[] {
  const t = text.toLowerCase();
  const keys: string[] = [];
  if (/شوره|dandruff/.test(t)) keys.push('dandruff');
  if (/قرمز|redness/.test(t)) keys.push('redness');
  if (/چرب|oil/.test(t)) keys.push('oiliness');
  if (/خشک|dry/.test(t)) keys.push('dryness');
  if (/براق|سبوم|shine|sebum/.test(t)) keys.push('shine');
  if (/لکه|patch/.test(t)) keys.push('patchiness');
  if (/رنگدانه|pigment/.test(t)) keys.push('pigmentation');
  if (/تراکم|density|ریزش|hair loss/.test(t)) keys.push('density');
  if (/ضایعه|lesion/.test(t)) keys.push('lesion');
  return keys;
}

function priorityFromScore(score: number): RecPriority {
  if (score >= 55) return 'urgent';
  if (score >= 35) return 'care';
  return 'followup';
}

/** گروه‌بندی پیشنهادات بر اساس شدت شاخص‌های مرتبط */
export function prioritizeRecommendations(
  result: ClinicalAnalysisResult,
): PrioritizedRecommendation[] {
  const sev = metricSeverity(result);
  const questionnaireRecs = new Set(
    result.questionnaireInterpretation?.recommendations ?? [],
  );
  return result.recommendations.map(text => {
    if (questionnaireRecs.has(text)) {
      // توصیه‌های زمینه‌ای پرسشنامه: حداقل care؛ پرچم alert → urgent
      const hasAlert = (result.questionnaireInterpretation?.flags ?? [])
        .some(flag => flag.severity === 'alert');
      return { text, priority: (hasAlert ? 'urgent' : 'care') as RecPriority };
    }
    const keys = matchRecKeys(text);
    const score = keys.length
      ? Math.max(...keys.map(k => sev[k] ?? 0))
      : Math.max(sev.oiliness, sev.dryness, sev.dandruff, sev.redness) * 0.5;
    return { text, priority: priorityFromScore(score) };
  }).sort((a, b) => {
    const order = { urgent: 0, care: 1, followup: 2 };
    return order[a.priority] - order[b.priority];
  });
}

/** نتیجهٔ جلسهٔ قبلی همان مشتری برای مقایسه */
export function findPreviousClinicalResult(
  clientHistory: Analysis[],
  source: ResultSource,
  currentAnalysisId?: string | null,
): ClinicalAnalysisResult | null {
  const sorted = [...clientHistory]
    .filter(a => !!getAnalysisClinicalResult(a, source))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (sorted.length < 2) return null;

  if (currentAnalysisId) {
    const idx = sorted.findIndex(a => a.id === currentAnalysisId);
    if (idx > 0) return getAnalysisClinicalResult(sorted[idx - 1], source);
    return null;
  }

  // تحلیل تازه: آخرین رکورد = فعلی، یکی قبل‌تر = قبلی
  return getAnalysisClinicalResult(sorted[sorted.length - 2], source);
}

/** سازگاری با کد قبلی آفلاین */
export function findPreviousOfflineResult(
  clientHistory: Analysis[],
  currentAnalysisId?: string | null,
): ClinicalAnalysisResult | null {
  return findPreviousClinicalResult(clientHistory, 'offline', currentAnalysisId);
}

export function buildMetricDeltas(
  current: ClinicalAnalysisResult,
  previous: ClinicalAnalysisResult,
  lang: Lang,
): MetricDelta[] {
  const d = offlineDict;
  const rows: Omit<MetricDelta, 'delta'>[] = [
    {
      id: 'density',
      label: d.metricDensity[lang],
      current: current.hairDensity.score,
      previous: previous.hairDensity.score,
      higherIsBetter: true,
    },
    {
      id: 'oiliness',
      label: d.metricOiliness[lang],
      current: current.scalpCondition.oiliness,
      previous: previous.scalpCondition.oiliness,
      higherIsBetter: false,
    },
    {
      id: 'dryness',
      label: d.metricDryness[lang],
      current: current.scalpCondition.dryness,
      previous: previous.scalpCondition.dryness,
      higherIsBetter: false,
    },
    {
      id: 'dandruff',
      label: d.metricDandruff[lang],
      current: current.scalpCondition.dandruff ?? 0,
      previous: previous.scalpCondition.dandruff ?? 0,
      higherIsBetter: false,
    },
    {
      id: 'redness',
      label: d.metricRedness[lang],
      current: current.scalpCondition.redness ?? 0,
      previous: previous.scalpCondition.redness ?? 0,
      higherIsBetter: false,
    },
  ];

  return rows
    .map(r => ({ ...r, delta: Math.round(r.current - r.previous) }))
    .filter(r => r.delta !== 0);
}

export function buildReportText(opts: {
  clientName: string;
  dateLabel: string;
  score: number;
  scoreLabel: string;
  findings: KeyFinding[];
  result: ClinicalAnalysisResult;
  recommendations: PrioritizedRecommendation[];
  lang: Lang;
  reportHeading?: string;
}): string {
  const d = offlineDict;
  const { lang } = opts;
  const lines: string[] = [
    opts.reportHeading ?? 'ScalpAI — Offline Analysis Report',
    `${d.reportClient[lang]}: ${opts.clientName}`,
    `${d.reportDate[lang]}: ${opts.dateLabel}`,
    `${d.overallHealthScore[lang]}: ${opts.score} (${opts.scoreLabel})`,
    '',
    d.keyFindings[lang] + ':',
    ...opts.findings.map(f => `• ${f.label}: ${Math.round(f.value)}`),
    '',
    `${d.hairDensity[lang]}: ${opts.result.hairDensity.score}% (${opts.result.hairDensity.level})`,
    `${d.oiliness[lang]}: ${opts.result.scalpCondition.oiliness}`,
    `${d.dryness[lang]}: ${opts.result.scalpCondition.dryness}`,
    `${d.dandruff[lang]}: ${opts.result.scalpCondition.dandruff ?? '—'}`,
    `${d.redness[lang]}: ${opts.result.scalpCondition.redness ?? '—'}`,
    `${d.hairLoss[lang]}: ${opts.result.hairLoss.level} — ${opts.result.hairLoss.pattern}`,
    '',
    d.recommendations[lang] + ':',
    ...opts.recommendations.map((r, i) => `${i + 1}. [${r.priority}] ${r.text}`),
    '',
    d.specializedHint[lang],
  ];
  return lines.join('\n');
}
