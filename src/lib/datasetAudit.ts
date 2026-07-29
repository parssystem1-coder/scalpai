/**
 * datasetAudit.ts — فاز ۱٫۵
 *
 * ممیزی و مانیتورینگ دیتاست آموزش محلی.
 * شامل:
 *  - تشخیص برچسب‌های کم‌داده (under-supported)
 *  - تشخیص نمونه‌های تکراری (duplicate detection)
 *  - تحلیل آماری توزیع فیچرها (میانگین، انحراف‌معیار، چولگی)
 */

import { TrainingSample } from '../db/types';
import { FEATURE_KEYS } from './scalpFeatures';

export interface FeatureStats {
  key: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  skewness: number;
}

export interface DuplicateGroup {
  hash: string;
  sampleIds: string[];
}

export interface DatasetAuditReport {
  totalSamples: number;
  underSupportedLabels: string[];
  duplicates: DuplicateGroup[];
  featureStats: FeatureStats[];
}

const MIN_SAMPLES_SUPPORT = 5;

// شناسه‌های مشاهدات بالینی متداول در کاتالوگ
const OBSERVATION_IDS = [
  'dandruff', 'seborrheicDermatitis', 'perifollicularScaling',
  'oily', 'seborrhea', 'dry', 'inflammation', 'erythemaDiffuse',
  'folliculitis', 'psoriasis', 'fungal', 'hairLoss', 'alopecia',
  'androgenic', 'femalePattern', 'telogen', 'emptyFollicles',
  'scarring', 'thinning', 'miniaturization', 'yellowDots', 'whiteDots'
];

/**
 * محاسبهٔ چولگی (Skewness) داده‌ها برای تحلیل توزیع آماری فیچرها.
 * چولگی صفر یعنی توزیع کاملاً متقارن (نرمال). چولگی مثبت یعنی دم سمت راست کشیده‌تر است.
 */
function calculateSkewness(values: number[], mean: number, std: number): number {
  if (values.length < 3 || std === 0) return 0;
  let sumCubedDiff = 0;
  for (const v of values) {
    sumCubedDiff += Math.pow(v - mean, 3);
  }
  const n = values.length;
  const skew = (n * sumCubedDiff) / ((n - 1) * (n - 2) * Math.pow(std, 3));
  return Number.isFinite(skew) ? skew : 0;
}

/**
 * اجرای ممیزی کامل روی استخر تصاویر آموزشی.
 */
export function auditDataset(samples: TrainingSample[]): DatasetAuditReport {
  const totalSamples = samples.length;

  // ۱. بررسی برچسب‌های کم‌نمونه (Under-supported)
  // مشاهداتی که کمتر از MIN_SAMPLES_SUPPORT نمونهٔ مثبت دارند.
  const labelCounts: Record<string, number> = {};
  for (const id of OBSERVATION_IDS) {
    labelCounts[id] = 0;
  }

  for (const sample of samples) {
    const obs = sample.label?.observations ?? [];
    for (const o of obs) {
      if (labelCounts[o] !== undefined) {
        labelCounts[o]++;
      } else {
        labelCounts[o] = 1;
      }
    }
  }

  const underSupportedLabels = OBSERVATION_IDS.filter(id => labelCounts[id] < MIN_SAMPLES_SUPPORT);

  // ۲. تشخیص تصاویر تکراری (Duplicate detection)
  // به کمک galleryItemId یا شناسه‌های مشابه
  const dupMap = new Map<string, string[]>();
  for (const sample of samples) {
    if (sample.galleryItemId) {
      const existing = dupMap.get(sample.galleryItemId) ?? [];
      existing.push(sample.id);
      dupMap.set(sample.galleryItemId, existing);
    }
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [galleryItemId, sampleIds] of dupMap.entries()) {
    if (sampleIds.length > 1) {
      duplicates.push({
        hash: galleryItemId,
        sampleIds
      });
    }
  }

  // ۳. تحلیل آماری توزیع ویژگی‌ها (Feature distribution)
  const featureStats: FeatureStats[] = [];

  for (const key of FEATURE_KEYS) {
    const values: number[] = [];
    for (const sample of samples) {
      // استخراج مقدار فیچر
      const featVal = (sample.features as unknown as Record<string, unknown>)?.[key];
      if (typeof featVal === 'number' && Number.isFinite(featVal)) {
        values.push(featVal);
      }
    }

    if (values.length === 0) {
      featureStats.push({
        key,
        mean: 0,
        std: 0,
        min: 0,
        max: 0,
        skewness: 0
      });
      continue;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    let sumSquaredDiff = 0;
    for (const v of values) {
      sumSquaredDiff += Math.pow(v - mean, 2);
    }
    const variance = sumSquaredDiff / values.length;
    const std = Math.sqrt(variance);

    const skewness = calculateSkewness(values, mean, std);

    featureStats.push({
      key,
      mean,
      std,
      min,
      max,
      skewness
    });
  }

  return {
    totalSamples,
    underSupportedLabels,
    duplicates,
    featureStats
  };
}
