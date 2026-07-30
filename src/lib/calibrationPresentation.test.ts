/**
 * تست‌های موج ۴ (D1) — «رندر سه حالت ECE بالا/پایین/ناموجود» نقشه‌راه.
 * این‌ها دقیقاً همان سه حالت end state هستند که CalibrationCard رندر می‌کند.
 */
import { describe, it, expect } from 'vitest';
import { buildCalibrationCardModel, eceBand, ECE_GREEN_MAX, ECE_AMBER_MAX } from './calibrationPresentation';
import type { LocalModelMetadata } from '../db';

const baseMeta = (over: Partial<LocalModelMetadata> = {}): LocalModelMetadata => ({
  version: 1,
  trainedAt: '2026-07-30T00:00:00.000Z',
  sampleCount: 100,
  evaluation: {
    mode: 'client',
    clientCount: 5,
    trainClientCount: 3,
    validationClientCount: 1,
    holdoutClientCount: 1,
    trainSampleCount: 70,
    validationSampleCount: 15,
    holdoutSampleCount: 15,
  } as LocalModelMetadata['evaluation'],
  ...over,
});

describe('eceBand — آستانهٔ نقشه‌راه', () => {
  it('مرزها دقیق هستند', () => {
    expect(eceBand(0)).toBe('green');
    expect(eceBand(ECE_GREEN_MAX)).toBe('green');
    expect(eceBand(ECE_GREEN_MAX + 0.001)).toBe('amber');
    expect(eceBand(ECE_AMBER_MAX)).toBe('amber');
    expect(eceBand(ECE_AMBER_MAX + 0.001)).toBe('red');
  });
});

describe('سه حالت کارت (قرارداد D1)', () => {
  it('ECE پایین → سبز و کارت موجود', () => {
    const m = buildCalibrationCardModel(baseMeta({ calibration: { ece: 0.07, brier: 0.05 } }));
    expect(m.state).toBe('available');
    expect(m.band).toBe('green');
    expect(m.ece).toBeCloseTo(0.07);
    expect(m.brier).toBeCloseTo(0.05);
    expect(m.minimalEvaluation).toBe(false);
  });

  it('ECE بالا → قرمز و کارت موجود', () => {
    const m = buildCalibrationCardModel(baseMeta({ calibration: { ece: 0.31, brier: 0.22 } }));
    expect(m.state).toBe('available');
    expect(m.band).toBe('red');
  });

  it('حاشیهٔ کهربانی: ECE بین دو آستانه', () => {
    const m = buildCalibrationCardModel(baseMeta({ calibration: { ece: 0.15, brier: 0.1 } }));
    expect(m.band).toBe('amber');
  });

  it('مدل قدیمی بدون calibration → ناموجود (هیچ عددی جعل نمی‌شود)', () => {
    const m = buildCalibrationCardModel(baseMeta());
    expect(m.state).toBe('absent');
    expect(m.ece).toBeUndefined();
  });

  it('metadata تهی → ناموجود', () => {
    const m = buildCalibrationCardModel(null);
    expect(m.state).toBe('absent');
    expect(m.minimalEvaluation).toBe(false);
  });
});

describe('پرچم ارزیابی حداقلی (fallback اسپلیت)', () => {
  it('mode=sample → پرچم + توضیح فارسی', () => {
    const m = buildCalibrationCardModel(baseMeta({
      calibration: { ece: 0.07, brier: 0.05 },
      evaluation: {
        mode: 'sample', clientCount: 2, trainClientCount: 2, validationClientCount: 2,
        holdoutClientCount: 0, trainSampleCount: 80, validationSampleCount: 20, holdoutSampleCount: 0,
      } as LocalModelMetadata['evaluation'],
    }));
    expect(m.minimalEvaluation).toBe(true);
    expect(m.minimalDetail).toContain('holdout');
  });

  it('kFoldMinimalFallback → پرچم با هشدار CI95', () => {
    const m = buildCalibrationCardModel(baseMeta({
      calibration: { ece: 0.07, brier: 0.05 },
      kFoldMinimalFallback: true,
    }));
    expect(m.minimalEvaluation).toBe(true);
    expect(m.minimalDetail).toContain('CI95');
  });

  it('هر دو fallback → جزئیات ترکیبی', () => {
    const m = buildCalibrationCardModel(baseMeta({
      evaluation: { mode: 'sample', clientCount: 1, trainClientCount: 1, validationClientCount: 1, holdoutClientCount: 0, trainSampleCount: 90, validationSampleCount: 10, holdoutSampleCount: 0 } as LocalModelMetadata['evaluation'],
      kFoldMinimalFallback: true,
    }));
    expect(m.minimalDetail).toContain('هر دو مسیر');
  });

  it('مدل normal: split مشتری‌محور بدون fallback → بدون پرچم', () => {
    const m = buildCalibrationCardModel(baseMeta({ calibration: { ece: 0.07, brier: 0.05 } }));
    expect(m.minimalEvaluation).toBe(false);
    expect(m.minimalDetail).toBeNull();
  });
});

describe('فیلدهای تکمیلی کارت', () => {
  it('kFoldEvaluation CI95 پاس داده می‌شود', () => {
    const ci = { mean: 1.2, margin: 0.3, lower: 0.9, upper: 1.5 };
    const m = buildCalibrationCardModel(baseMeta({
      calibration: { ece: 0.07, brier: 0.05 },
      kFoldEvaluation: { mae: ci, macroF1: ci },
    }));
    expect(m.kFold?.mae.margin).toBeCloseTo(0.3);
  });

  it('گزارش دمای D3 به کارت می‌رسد (پذیرش)', () => {
    const m = buildCalibrationCardModel(baseMeta({
      calibration: { ece: 0.08, brier: 0.05 },
      temperatureScaling: {
        attempted: true, adopted: true, reason: 'ECE کاهش یافت', fittedT: 2.1, eceBefore: 0.19, eceAfter: 0.08,
      },
    }));
    expect(m.temperature?.adopted).toBe(true);
    expect(m.temperature?.fittedT).toBeCloseTo(2.1);
    expect(m.temperature?.eceAfter).toBeDefined();
    expect(m.temperature!.eceBefore).toBeDefined();
    expect(m.temperature!.eceAfter!).toBeLessThan(m.temperature!.eceBefore!);
  });

  it('holdoutSampleCount از evaluation خوانده می‌شود', () => {
    const m = buildCalibrationCardModel(baseMeta({ calibration: { ece: 0.07, brier: 0.05 } }));
    expect(m.holdoutSampleCount).toBe(15);
  });
});
