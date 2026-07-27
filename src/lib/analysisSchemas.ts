import { z } from 'zod';
import type { AIAnalysisResult, OfflineAnalysisResult } from '../db';
import { resolveObservations, resolveObservationToken } from './diagnosisCatalog';

export const aiAnalysisResultSchema = z.object({
  lesions: z.array(z.object({
    type: z.string(),
    confidence: z.number().min(0).max(1),
    bbox: z.array(z.number()).length(4),
    category: z.enum(['condition', 'trichoscopy']).optional(),
    evidenceLevel: z.enum(['observed', 'possible', 'requires_confirmation']).optional(),
  })),
  observations: z.array(z.string()).optional(),
  hairDensity: z.object({
    level: z.string(),
    score: z.number().min(0).max(100),
  }),
  scalpCondition: z.object({
    oiliness: z.number().min(0).max(100),
    dryness: z.number().min(0).max(100),
    redness: z.number().min(0).max(100).optional(),
    dandruff: z.number().min(0).max(100).optional(),
    shine: z.number().min(0).max(100).optional(),
    patchiness: z.number().min(0).max(100).optional(),
    pigmentation: z.number().min(0).max(100).optional(),
    hairThickness: z.number().min(0).max(100).optional(),
  }),
  hairLoss: z.object({
    level: z.string(),
    pattern: z.string(),
  }),
  recommendations: z.array(z.string()),
  chartData: z.array(z.object({
    label: z.string(),
    value: z.number(),
  })).optional(),
  annotatedImageBase64: z.string().optional(),
});

export const offlineAnalysisResultSchema = z.object({
  lesions: z.array(z.object({
    type: z.string(),
    confidence: z.number().min(0).max(1),
    bbox: z.array(z.number()).length(4),
    category: z.enum(['condition', 'trichoscopy']).optional(),
    evidenceLevel: z.enum(['observed', 'possible', 'requires_confirmation']).optional(),
  })),
  observations: z.array(z.string()).optional(),
  hairDensity: z.object({
    level: z.string(),
    score: z.number().min(0).max(100),
  }),
  scalpCondition: z.object({
    oiliness: z.number().min(0).max(100),
    dryness: z.number().min(0).max(100),
    redness: z.number().min(0).max(100).optional(),
    dandruff: z.number().min(0).max(100).optional(),
    shine: z.number().min(0).max(100).optional(),
    patchiness: z.number().min(0).max(100).optional(),
    pigmentation: z.number().min(0).max(100).optional(),
    hairThickness: z.number().min(0).max(100).optional(),
  }),
  hairLoss: z.object({
    level: z.string(),
    pattern: z.string(),
  }),
  recommendations: z.array(z.string()),
  metrics: z.object({
    brightness: z.number(),
    rednessRatio: z.number(),
    whiteFlakeRatio: z.number(),
    textureVariance: z.number(),
    hairCoverageRatio: z.number().optional(),
    shineRatio: z.number().optional(),
    edgeDensity: z.number().optional(),
    patchinessRaw: z.number().optional(),
    pigmentationRaw: z.number().optional(),
  }).optional(),
  chartData: z.array(z.object({
    label: z.string(),
    value: z.number(),
  })).optional(),
  annotatedImageBase64: z.string().optional(),
  engine: z.enum(['python', 'browser', 'model']).optional(),
});

type Lesion = { type: string; confidence: number; bbox: number[]; category?: 'condition' | 'trichoscopy'; evidenceLevel?: 'observed' | 'possible' | 'requires_confirmation' };

function toLesion(l: { type?: string; confidence?: number; bbox?: number[]; category?: Lesion['category']; evidenceLevel?: Lesion['evidenceLevel'] }): Lesion {
  const rawType = l.type ?? '';
  // ترجیح شناسهٔ کاتالوگ؛ اگر نگاشت نشد همان متن خام نگه داشته می‌شود (برای نمایش)
  const resolved = resolveObservationToken(rawType);
  return {
    type: resolved ?? rawType,
    confidence: l.confidence ?? 0,
    bbox: l.bbox ?? [],
    category: l.category,
    evidenceLevel: l.evidenceLevel,
  };
}

export function parseAIAnalysisResult(raw: unknown, confidenceThreshold = 0): AIAnalysisResult {
  const result = aiAnalysisResultSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.slice(0, 3).map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`پاسخ AI با ساختار مورد انتظار مطابقت ندارد${detail ? ` (${detail})` : ''}`);
  }
  const parsed = result.data;
  const scalpCondition = {
    oiliness: parsed.scalpCondition?.oiliness ?? 0,
    dryness: parsed.scalpCondition?.dryness ?? 0,
    redness: parsed.scalpCondition?.redness,
    dandruff: parsed.scalpCondition?.dandruff,
    shine: parsed.scalpCondition?.shine,
    patchiness: parsed.scalpCondition?.patchiness,
    pigmentation: parsed.scalpCondition?.pigmentation,
    hairThickness: parsed.scalpCondition?.hairThickness,
  };
  const hairDensityScore = parsed.hairDensity?.score ?? 0;
  const scoreLike = {
    oiliness: scalpCondition.oiliness,
    dryness: scalpCondition.dryness,
    dandruff: scalpCondition.dandruff ?? 0,
    redness: scalpCondition.redness ?? 0,
    densityScore: hairDensityScore,
    shine: scalpCondition.shine,
    patchiness: scalpCondition.patchiness,
    pigmentation: scalpCondition.pigmentation,
    hairThickness: scalpCondition.hairThickness,
  };
  const resolvedObs = resolveObservations(parsed.observations, scoreLike);
  return {
    lesions: parsed.lesions
      .filter(l => (l.confidence ?? 0) >= confidenceThreshold)
      .map(toLesion),
    observations: resolvedObs.ids,
    observationsFilledFromHeuristic: resolvedObs.filledFromHeuristic,
    hairDensity: {
      level: parsed.hairDensity?.level ?? '',
      score: hairDensityScore,
    },
    scalpCondition,
    hairLoss: {
      level: parsed.hairLoss?.level ?? '',
      pattern: parsed.hairLoss?.pattern ?? '',
    },
    recommendations: parsed.recommendations ?? [],
    chartData: parsed.chartData,
    annotatedImageBase64: parsed.annotatedImageBase64,
  };
}

/** ساخت chartData هم‌شکل نتایج آفلاین از امتیازهای AI */
export function buildChartDataFromScores(
  scores: {
    densityScore: number;
    oiliness: number;
    dryness: number;
    dandruff?: number;
    redness?: number;
    shine?: number;
    patchiness?: number;
    pigmentation?: number;
    hairThickness?: number;
  },
  isRtl: boolean,
): { label: string; value: number }[] {
  return [
    { label: isRtl ? 'تراکم' : 'Density', value: scores.densityScore },
    { label: isRtl ? 'چربی' : 'Oiliness', value: scores.oiliness },
    { label: isRtl ? 'خشکی' : 'Dryness', value: scores.dryness },
    { label: isRtl ? 'شوره' : 'Dandruff', value: scores.dandruff ?? 0 },
    { label: isRtl ? 'قرمزی' : 'Redness', value: scores.redness ?? 0 },
    { label: isRtl ? 'براقی/سبوره' : 'Shine', value: scores.shine ?? 0 },
    { label: isRtl ? 'لکه‌ای بودن' : 'Patchiness', value: scores.patchiness ?? 0 },
    { label: isRtl ? 'ناهمگونی رنگدانه' : 'Pigmentation', value: scores.pigmentation ?? 0 },
    { label: isRtl ? 'ضخامت تار مو' : 'Hair thickness', value: scores.hairThickness ?? 0 },
  ];
}

export function parseOfflineAnalysisResult(raw: unknown, confidenceThreshold = 0): OfflineAnalysisResult {
  const result = offlineAnalysisResultSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.slice(0, 3).map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    throw new Error(`نتیجهٔ تحلیل آفلاین نامعتبر است${detail ? ` (${detail})` : ''}`);
  }
  const parsed = result.data;
  const sc = parsed.scalpCondition;
  const scoreLike = {
    oiliness: sc?.oiliness ?? 0,
    dryness: sc?.dryness ?? 0,
    dandruff: sc?.dandruff ?? 0,
    redness: sc?.redness ?? 0,
    densityScore: parsed.hairDensity?.score ?? 0,
    shine: sc?.shine,
    patchiness: sc?.patchiness,
    pigmentation: sc?.pigmentation,
    hairThickness: sc?.hairThickness,
  };
  const observationsResolved = resolveObservations(parsed.observations, scoreLike);
  return {
    lesions: parsed.lesions
      .filter(l => (l.confidence ?? 0) >= confidenceThreshold)
      .map(toLesion),
    observations: observationsResolved.ids,
    observationsFilledFromHeuristic: observationsResolved.filledFromHeuristic,
    hairDensity: {
      level: parsed.hairDensity?.level ?? '',
      score: parsed.hairDensity?.score ?? 0,
    },
    scalpCondition: {
      oiliness: sc?.oiliness ?? 0,
      dryness: sc?.dryness ?? 0,
      redness: sc?.redness,
      dandruff: sc?.dandruff,
      shine: sc?.shine,
      patchiness: sc?.patchiness,
      pigmentation: sc?.pigmentation,
      hairThickness: sc?.hairThickness,
    },
    hairLoss: {
      level: parsed.hairLoss?.level ?? '',
      pattern: parsed.hairLoss?.pattern ?? '',
    },
    recommendations: parsed.recommendations ?? [],
    metrics: parsed.metrics ? {
      brightness: parsed.metrics.brightness ?? 0,
      rednessRatio: parsed.metrics.rednessRatio ?? 0,
      whiteFlakeRatio: parsed.metrics.whiteFlakeRatio ?? 0,
      textureVariance: parsed.metrics.textureVariance ?? 0,
      hairCoverageRatio: parsed.metrics.hairCoverageRatio,
      shineRatio: parsed.metrics.shineRatio,
      edgeDensity: parsed.metrics.edgeDensity,
      patchinessRaw: parsed.metrics.patchinessRaw,
      pigmentationRaw: parsed.metrics.pigmentationRaw,
    } : undefined,
    chartData: parsed.chartData?.map(c => ({ label: c.label ?? '', value: c.value ?? 0 })),
    annotatedImageBase64: parsed.annotatedImageBase64,
    engine: parsed.engine,
  };
}
