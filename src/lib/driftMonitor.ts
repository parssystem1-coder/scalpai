/**
 * driftMonitor.ts — فاز ۵٫۵
 *
 * پایش و ردیابی رانش داده‌ها (Data Drift Monitoring) در طول زمان.
 * این ماژول توزیع ویژگی‌های Heuristic نمونه‌های جدید کلینیک را با
 * ویژگی‌های میانگین دیتابیسِ زمانِ آموزش مدل محلی مقایسه می‌کند تا متوجه
 * تغییر سخت‌افزاری دوربین یا نور اتاق کلینیک شود و در صورت انحراف آماری،
 * هشدار «نیاز مبرم به بازآموزی مدل» را ارسال نماید.
 */

import { TrainingSample } from '../db/types';
import { FEATURE_KEYS } from './scalpFeatures';

export interface FeatureDriftResult {
  key: string;
  baselineMean: number;
  recentMean: number;
  zScore: number;
  drifted: boolean;
}

export interface DriftReport {
  driftDetected: boolean;
  featureDrifts: FeatureDriftResult[];
  evaluated: boolean;
}

const DRIFT_THRESHOLD_Z = 2.5; // آستانه رانش معنادار با اطمینان ۹۹ درصد

/**
 * پایش رانش داده با مقایسه نمونه‌های اخیر با میانگین و انحراف‌معیار مرجع زمان آموزش.
 */
export function monitorDataDrift(
  recentSamples: TrainingSample[],
  baselineMeans: number[] | null | undefined,
  baselineStds: number[] | null | undefined
): DriftReport {
  if (!recentSamples.length || !baselineMeans?.length || !baselineStds?.length) {
    return { driftDetected: false, featureDrifts: [], evaluated: false };
  }

  const featureDrifts: FeatureDriftResult[] = [];
  let driftDetected = false;

  FEATURE_KEYS.forEach((key, k) => {
    const bMean = baselineMeans[k] ?? 0;
    const bStd = baselineStds[k] ?? 1.0;

    // استخراج مقادیر اخیر این ویژگی
    const recentValues: number[] = [];
    for (const sample of recentSamples) {
      const v = (sample.features as unknown as Record<string, unknown>)?.[key];
      if (typeof v === 'number' && Number.isFinite(v)) {
        recentValues.push(v);
      }
    }

    if (recentValues.length < 5) return; // حداقل نمونه برای نتیجه آماری مطمئن

    const recentMean = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
    const safeStd = Math.abs(bStd) < 1e-6 ? 1.0 : bStd;

    // محاسبه z-score آماری برای میانگین نمونه‌های اخیر نسبت به مرجع
    // Z = |recentMean - bMean| / (bStd / sqrt(N))
    const zScore = Math.abs(recentMean - bMean) / (safeStd / Math.sqrt(recentValues.length));
    const drifted = zScore > DRIFT_THRESHOLD_Z;

    if (drifted) {
      driftDetected = true;
    }

    featureDrifts.push({
      key,
      baselineMean: bMean,
      recentMean,
      zScore,
      drifted
    });
  });

  return {
    driftDetected,
    featureDrifts,
    evaluated: featureDrifts.length > 0
  };
}
