/**
 * localModel.test.ts — تست‌های pure برای پیچیده‌ترین منطق ریاضی پروژه (فاز ۰.۲)
 *
 * این فایل‌ها آگاهانه فقط توابع خالص را تست می‌کنند (بدون اجرای واقعی آموزش
 * TensorFlow): splitByClient (عدم‌نشت مشتری/تضمین train غیرخالی)، computeNorm
 * (رگرسیون باگ تاریخی)، معیارها، oversample، و قاعدهٔ champion/challenger.
 */
import { describe, it, expect } from 'vitest';
import type { TrainingSample } from '../db';
import { FEATURE_VERSION } from './scalpFeatures';
import {
  splitByClient,
  computeNorm,
  applyNorm,
  oversampleExperts,
  maeScores,
  obsF1,
  shuffleInPlace,
  stableTrainingSeed,
  isChallengerBetter,
  isSampleEligibleForTraining,
  selectTrainingPool,
  assessQuestionnaireV4Gate,
  DEFAULT_CHAMPION_MARGINS,
} from './localModel';

let seq = 0;
function makeSample(overrides: Partial<TrainingSample> = {}): TrainingSample {
  seq += 1;
  return {
    id: `sample-${seq}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    labelSource: 'expert',
    features: {
      brightness: 120, whiteFlakeRatio: 0.1, rednessRatio: 0.05, hairCoverageRatio: 0.4,
      textureVariance: 40, avgR: 120, avgG: 110, avgB: 100,
      shineRatio: 0.01, edgeDensity: 0.2, patchinessRaw: 0.1, pigmentationRaw: 12,
    },
    label: {
      oiliness: 40, dryness: 30, dandruff: 10, redness: 20, densityScore: 60,
      shine: 20, patchiness: 15, pigmentation: 10, hairThickness: 50,
      observations: [],
      lesions: [],
    },
    ...overrides,
  };
}

function samplesForClients(clientIds: string[], perClient: number): TrainingSample[] {
  return clientIds.flatMap(cid =>
    Array.from({ length: perClient }, () => makeSample({ clientId: cid })),
  );
}

describe('splitByClient — تضمین‌های ساختاری', () => {
  it('بدون نشت مشتری: هیچ مشتری‌ای هم‌زمان در دو مجموعه نیست', () => {
    const samples = samplesForClients(Array.from({ length: 12 }, (_, i) => `c${i}`), 6);
    const { train, val, holdout } = splitByClient(samples, 0.2, 0.15, 42);
    const clientsOf = (list: TrainingSample[]) => new Set(list.map(s => s.clientId));
    const cTrain = clientsOf(train);
    const cVal = clientsOf(val);
    const cHold = clientsOf(holdout);
    for (const c of cTrain) {
      expect(cVal.has(c)).toBe(false);
      expect(cHold.has(c)).toBe(false);
    }
    for (const c of cVal) expect(cHold.has(c)).toBe(false);
    // همهٔ نمونه‌ها دقیقاً یک‌بار مصرف شده‌اند
    expect(train.length + val.length + holdout.length).toBe(samples.length);
  });

  it('با seed یکسان خروجی قطعی و یکسان است', () => {
    const samples = samplesForClients(Array.from({ length: 8 }, (_, i) => `c${i}`), 5);
    const a = splitByClient(samples, 0.2, 0.15, 123);
    const b = splitByClient(samples, 0.2, 0.15, 123);
    expect(a.train.map(s => s.id)).toEqual(b.train.map(s => s.id));
    expect(a.holdout.map(s => s.id)).toEqual(b.holdout.map(s => s.id));
  });

  it('با فقط ۱ مشتری: حالت نمونه‌ای، train هرگز خالی نیست', () => {
    const { train, val, holdout, summary } = splitByClient(samplesForClients(['only'], 10), 0.2, 0.15, 7);
    expect(summary.mode).toBe('sample');
    expect(holdout.length).toBe(0);
    expect(train.length).toBeGreaterThan(0);
    expect(val.length).toBeGreaterThan(0);
  });

  it('با ۲ مشتری هم به split نمونه‌ای برمی‌گردد و train خالی نمی‌ماند', () => {
    const { train, summary } = splitByClient(samplesForClients(['a', 'b'], 8), 0.2, 0.15, 7);
    expect(summary.mode).toBe('sample');
    expect(train.length).toBeGreaterThan(0);
  });

  it('با ۳ مشتری: حالت مشتری فعال می‌شود و holdout مشتری مستقل دارد', () => {
    const { summary, holdout } = splitByClient(samplesForClients(['a', 'b', 'c'], 10), 0.34, 0.34, 5);
    expect(summary.mode).toBe('client');
    expect(holdout.length).toBeGreaterThan(0);
    expect(summary.holdoutClientCount).toBeGreaterThanOrEqual(1);
  });

  it('با حداقل نمونهٔ ممکن (۳ مشتری × ۱ نمونه) کرش نمی‌کند و پوشش کامل است', () => {
    const samples = samplesForClients(['a', 'b', 'c'], 1);
    const { train, val, holdout } = splitByClient(samples, 0.2, 0.15, 9);
    expect(train.length + val.length + holdout.length).toBe(3);
  });
});

describe('computeNorm / applyNorm — نرمال‌سازی (رگرسیون باگ تاریخی)', () => {
  it('روی آرایهٔ مشخص، میانگین و انحراف‌معیار جمعیت دقیق محاسبه می‌شود', () => {
    const { means, stds } = computeNorm([[1, 2], [3, 4]]);
    expect(means[0]).toBeCloseTo(2);
    expect(means[1]).toBeCloseTo(3);
    expect(stds[0]).toBeCloseTo(1); // بدون +۱ِ باگ قدیمی
    expect(stds[1]).toBeCloseTo(1);
  });

  it('ستون ثابت به انحراف‌معیار ۱ می‌رسد (محافظ تقسیم‌بر‌صفر)', () => {
    const { stds } = computeNorm([[5, 0], [5, 2]]);
    expect(stds[0]).toBe(1);
    // ستون دوم [0,2]: میانگین ۱، انحراف‌معیار جمعیت دقیقاً ۱
    expect(stds[1]).toBeCloseTo(1);
  });

  it('ورودی خالی خروجی خالی می‌دهد', () => {
    expect(computeNorm([])).toEqual({ means: [], stds: [] });
  });

  it('بعد از applyNorm میانگین هر ستون ≈ ۰ است', () => {
    const xs = [[10, 0.5], [20, 1.5], [30, 2.5]];
    const { means, stds } = computeNorm(xs);
    const normed = xs.map(x => applyNorm(x, means, stds));
    const mean0 = normed.reduce((a, r) => a + r[0], 0) / normed.length;
    expect(Math.abs(mean0)).toBeLessThan(1e-9);
    // نقطهٔ میانی باید دقیقاً صفر شود
    expect(normed[1][1]).toBeCloseTo(0);
  });
});

describe('oversampleExperts', () => {
  it('فقط نمونه‌های expert دوبار تکرار می‌شوند', () => {
    const samples = [
      makeSample({ labelSource: 'expert' }),
      makeSample({ labelSource: 'online_ai', approvedForTraining: true }),
      makeSample({ labelSource: 'expert' }),
    ];
    const out = oversampleExperts(samples);
    expect(out.length).toBe(5);
    expect(out.filter(s => s.labelSource === 'expert').length).toBe(4);
    expect(out.filter(s => s.labelSource === 'online_ai').length).toBe(1);
  });
});

describe('maeScores / obsF1 — معیارها با محاسبهٔ دستی', () => {
  it('MAE صفر برای پیش‌بینی کامل و مقدار دقیق برای خطای مشخص', () => {
    const perfect = [Array.from({ length: 84 }, () => 0.5)];
    expect(maeScores(perfect, perfect)).toBe(0);

    const yTrue = [Array.from({ length: 9 }, () => 0.5), Array.from({ length: 9 }, () => 0.5)];
    const yPred = [Array.from({ length: 9 }, () => 0.7), Array.from({ length: 9 }, () => 0.3)];
    // خطای مطلق هر عنصر ۰.۲ → در مقیاس ۰-۱۰۰: ۲۰
    expect(maeScores(yTrue, yPred)).toBeCloseTo(20);
  });

  it('ورودی خالی MAE = ۰ می‌دهد', () => {
    expect(maeScores([], [])).toBe(0);
  });

  it('F1 = ۱ برای تشخیص کامل و ۰ وقتی هیچ مثبتی نیست', () => {
    const yFull = [Array.from({ length: 84 }, () => 0), Array.from({ length: 84 }, () => 0)];
    yFull[0][9 + 2] = 1; // اولین observation دوم
    yFull[1][9 + 5] = 1;
    const pFull = [Array.from({ length: 84 }, () => 0), Array.from({ length: 84 }, () => 0)];
    pFull[0][9 + 2] = 0.9;
    pFull[1][9 + 5] = 0.9;
    expect(obsF1(yFull, pFull)).toBeCloseTo(1);

    const zeros = [Array.from({ length: 84 }, () => 0)];
    expect(obsF1(zeros, zeros)).toBe(0);
  });

  it('آستانهٔ پیش‌فرض ۰.۴۵ رعایت می‌شود (۰.۴۴ = منفی)', () => {
    const y = [Array.from({ length: 84 }, () => 0)];
    y[0][9] = 1; // dandruff مثبت
    const p = [Array.from({ length: 84 }, () => 0)];
    p[0][9] = 0.44; // زیر آستانه → fn
    expect(obsF1(y, p)).toBe(0);
    p[0][9] = 0.46; // بالای آستانه → tp
    expect(obsF1(y, p)).toBeCloseTo(1);
  });
});

describe('isChallengerBetter — قاعدهٔ champion/challenger (فاز ۰.۱)', () => {
  it('MAE بهتر + F1 ثابت → جایگزینی', () => {
    expect(isChallengerBetter(
      { mae: 8, obsF1: 0.5 },
      { mae: 9, obsF1: 0.5 },
    )).toBe(true);
  });

  it('MAE بهتر ولی F1 افت بیش‌از‌حاشیه → عدم‌جایگزینی', () => {
    expect(isChallengerBetter(
      { mae: 8, obsF1: 0.4 },
      { mae: 9, obsF1: 0.5 },
    )).toBe(false);
  });

  it('F1 بهتر + MAE کمی بدتر در حد حاشیه → جایگزینی', () => {
    expect(isChallengerBetter(
      { mae: 9.2, obsF1: 0.56 },
      { mae: 9, obsF1: 0.5 },
    )).toBe(true);
  });

  it('معیارهای مساوی → عدم‌جایگزینی (جهت محافظه‌کارانه)', () => {
    expect(isChallengerBetter(
      { mae: 9, obsF1: 0.5 },
      { mae: 9, obsF1: 0.5 },
    )).toBe(false);
  });

  it('دقیقاً روی مرز حاشیه: برتری واقعی لازم است نه برتری به‌اندازهٔ نویز', () => {
    const m = DEFAULT_CHAMPION_MARGINS;
    // MAE دقیقاً به‌اندازهٔ حاشیه بهتر → معیار شرط «کمتر از -margin» است، پس false
    expect(isChallengerBetter(
      { mae: 9 - m.mae, obsF1: 0.5 },
      { mae: 9, obsF1: 0.5 },
    )).toBe(false);
    // کمی بهتر از حاشیه → true
    expect(isChallengerBetter(
      { mae: 9 - m.mae - 0.01, obsF1: 0.5 },
      { mae: 9, obsF1: 0.5 },
    )).toBe(true);
  });

  it('متریک گمشده/NaN → عدم‌جایگزینی (در شک، مدل فعلی می‌ماند)', () => {
    expect(isChallengerBetter({ mae: undefined }, { mae: 9 })).toBe(false);
    expect(isChallengerBetter({ mae: 8 }, { mae: undefined })).toBe(false);
    expect(isChallengerBetter({ mae: NaN }, { mae: 9 })).toBe(false);
  });
});

describe('shuffleInPlace / stableTrainingSeed — قطعیت', () => {
  it('shuffle با seed یکسان قطعی است و نتیجه یک جایگشت است', () => {
    const a = shuffleInPlace([1, 2, 3, 4, 5, 6, 7, 8], 42);
    const b = shuffleInPlace([1, 2, 3, 4, 5, 6, 7, 8], 42);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('stableTrainingSeed قطعی و حساس به شناسه‌هاست', () => {
    const s1 = [makeSample({ id: 'a' }), makeSample({ id: 'b' })];
    const s2 = [makeSample({ id: 'b' }), makeSample({ id: 'a' })]; // ترتیب متفاوت
    expect(stableTrainingSeed(s1)).toBe(stableTrainingSeed(s2)); // sort داخلی
    expect(stableTrainingSeed(s1)).not.toBe(stableTrainingSeed([makeSample({ id: 'c' })]));
    expect(stableTrainingSeed([])).toBeGreaterThan(0);
  });
});

describe('واجد‌شرایطی نمونه‌های آموزشی', () => {
  it('expert همیشه واجد شرایط است؛ online_ai فقط پس از تأیید', () => {
    expect(isSampleEligibleForTraining(makeSample({ labelSource: 'expert' }))).toBe(true);
    expect(isSampleEligibleForTraining(makeSample({ labelSource: 'online_ai' }))).toBe(false);
    expect(isSampleEligibleForTraining(makeSample({ labelSource: 'online_ai', approvedForTraining: true }))).toBe(true);
  });

  it('نسخهٔ فیچر ناسازگار کنار گذاشته می‌شود؛ legacy v3 پذیرفته می‌شود', () => {
    expect(isSampleEligibleForTraining(makeSample({ featureVersion: FEATURE_VERSION }))).toBe(true);
    expect(isSampleEligibleForTraining(makeSample({ featureVersion: 'v3' }))).toBe(true);
    expect(isSampleEligibleForTraining(makeSample({ featureVersion: 'v2-ancient' }))).toBe(false);
  });

  it('selectTrainingPool فقط واجدشرایط‌ها را نگه می‌دارد', () => {
    const pool = selectTrainingPool([
      makeSample({ labelSource: 'expert' }),
      makeSample({ labelSource: 'online_ai' }),
      makeSample({ labelSource: 'online_ai', approvedForTraining: true }),
    ]);
    expect(pool.length).toBe(2);
  });
});

describe('assessQuestionnaireV4Gate — حد نصاب آزمایش v4', () => {
  it('بدون نمونهٔ پرسشنامه‌دار، واجد شرایط نیست و دلیل می‌گوید', () => {
    const gate = assessQuestionnaireV4Gate([makeSample({}), makeSample({})]);
    expect(gate.eligible).toBe(false);
    expect(gate.sampleCount).toBe(0);
    expect(gate.reason).toMatch(/حداقل/);
  });
});
