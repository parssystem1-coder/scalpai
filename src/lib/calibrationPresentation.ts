/**
 * calibrationPresentation.ts — موج ۴ (D1): مدل ارائهٔ کارت «کالیبراسیون»
 * -----------------------------------------------------------------------
 * منطق نمایش خالص و قابل‌تست برای کارت کالیبراسیون در ClassMetricsPanel:
 *  - رنگ‌بندی ECE طبق آستانهٔ نقشه‌راه: ≤0.10 سبز، ۰٫۱۰–۰٫۲۰ کهربانی، >0.20 قرمز
 *  - سه حالت: «موجود»، «ناموجود» (مدل قدیمی پیش از موج ۴)، «ارزیابی حداقلی»
 *    (fallback اسپلیت با <۳ مشتری — دادهٔ مشتری‌محور کافی نیست و متریک‌ها
 *    خوش‌بینانه‌اند)
 *
 * چرا جدا از کامپوننت؟ «رندر سه حالت» نقشه‌راه این‌جا بدون DOM تست می‌شود —
 * کامپوننت فقط رندر ساده`ٔ این مدل است.
 *
 * قانون طلایی موج: عدد بی‌اعتبار بدتر از نبود عدد است؛ پس برای مدل‌هایی که
 * calibration ذخیره نشده هیچ عددی جعل نمی‌کنیم و پیام «برای محاسبه بازآموزی
 * کنید» می‌دهیم.
 */

import type { LocalModelMetadata } from '../db';
import type { TemperatureScalingDecision } from './temperatureScaling';

/** آستانه‌های رنگ‌بندی — همان نقشه‌راه (D1) */
export const ECE_GREEN_MAX = 0.10;
export const ECE_AMBER_MAX = 0.20;

export type EceBand = 'green' | 'amber' | 'red';

export function eceBand(ece: number): EceBand {
  if (ece <= ECE_GREEN_MAX) return 'green';
  if (ece <= ECE_AMBER_MAX) return 'amber';
  return 'red';
}

export type CalibrationCardState = 'available' | 'absent';

export interface CalibrationCardModel {
  state: CalibrationCardState;
  /**
   * پرچم اصلی D1: مشتری کمتر از ۳ بوده → یا holdout خالی است یا
   * K-Fold روی val=holdout چرخیده. هر دو یعنی «متریک ارزیابی خوش‌بینانه است».
   */
  minimalEvaluation: boolean;
  /** جزئیات فارسیِ حالت ارزیابی حداقلی (برای نمایش در بنر/راهنما) */
  minimalDetail: string | null;
  ece?: number;
  brier?: number;
  band?: EceBand;
  holdoutSampleCount?: number;
  /** CI95 مربوط به K-Fold — فقط اگر محاسبه شده باشد */
  kFold?: {
    mae: { mean: number; margin: number; lower: number; upper: number };
    macroF1: { mean: number; margin: number; lower: number; upper: number };
  };
  /** گزارش تصمیم D3 (دمای کالیبراسیون) در صورت وجود */
  temperature?: Pick<TemperatureScalingDecision, 'attempted' | 'adopted' | 'reason' | 'fittedT' | 'eceBefore' | 'eceAfter'>;
}

const minimalDetailFor = (mode: string | undefined, kFoldFallback: boolean): string | null => {
  if (mode === 'sample' && kFoldFallback) {
    return 'هر دو مسیر ارزیابی به‌خاطر داشتن کمتر از ۳ مشتری متمایز به حالت حداقلی برگشتند؛ اعداد این کارت خوش‌بینانه‌اند.';
  }
  if (mode === 'sample') {
    return 'به‌خاطر داشتن کمتر از ۳ مشتری متمایز، holdout مستقلی شکل نگرفت؛ متریک‌های holdout موجود نیستند.';
  }
  if (kFoldFallback) {
    return 'به‌خاطر داشتن کمتر از ۳ مشتری متمایز، K-Fold روی validation=holdout چرخیده؛ CI95 خوش‌بینانه است.';
  }
  return null;
};

export function buildCalibrationCardModel(metadata: LocalModelMetadata | null): CalibrationCardModel {
  const mode = metadata?.evaluation?.mode;
  const kFoldFallback = metadata?.kFoldMinimalFallback === true;
  const minimalEvaluation = mode === 'sample' || kFoldFallback;
  const minimalDetail = minimalEvaluation ? minimalDetailFor(mode, kFoldFallback) : null;

  const calibration = metadata?.calibration;
  if (!calibration || typeof calibration.ece !== 'number' || typeof calibration.brier !== 'number') {
    return {
      state: 'absent',
      minimalEvaluation,
      minimalDetail,
      kFold: metadata?.kFoldEvaluation
        ? { mae: metadata.kFoldEvaluation.mae, macroF1: metadata.kFoldEvaluation.macroF1 }
        : undefined,
      temperature: metadata?.temperatureScaling
        ? {
            attempted: metadata.temperatureScaling.attempted,
            adopted: metadata.temperatureScaling.adopted,
            reason: metadata.temperatureScaling.reason,
            fittedT: metadata.temperatureScaling.fittedT,
            eceBefore: metadata.temperatureScaling.eceBefore,
            eceAfter: metadata.temperatureScaling.eceAfter,
          }
        : undefined,
    };
  }

  return {
    state: 'available',
    minimalEvaluation,
    minimalDetail,
    ece: calibration.ece,
    brier: calibration.brier,
    band: eceBand(calibration.ece),
    holdoutSampleCount: metadata?.evaluation?.holdoutSampleCount,
    kFold: metadata?.kFoldEvaluation
      ? { mae: metadata.kFoldEvaluation.mae, macroF1: metadata.kFoldEvaluation.macroF1 }
      : undefined,
    temperature: metadata?.temperatureScaling
      ? {
          attempted: metadata.temperatureScaling.attempted,
          adopted: metadata.temperatureScaling.adopted,
          reason: metadata.temperatureScaling.reason,
          fittedT: metadata.temperatureScaling.fittedT,
          eceBefore: metadata.temperatureScaling.eceBefore,
          eceAfter: metadata.temperatureScaling.eceAfter,
        }
      : undefined,
  };
}
