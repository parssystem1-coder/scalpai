/**
 * heuristicCalibration.test.ts — موج ۴ (D2): آزمون لایهٔ شواهد کالیبراسیون heuristic
 * ساختار تست: تمام داده‌سازی‌ها قطعی‌اند (بدون Math.random) تا نتیجه تکرارپذیر
 * باشد و CI لرزش نداشته باشد — همان قاعدهٔ «عدد بی‌اعتبار بدتر از نبود عدد است».
 */
import { describe, it, expect } from 'vitest';
import {
  fitIsotonic,
  evalIsotonic,
  fitLinear,
  evalLinear,
  buildHeuristicCalibrationReport,
  samplesToCalibrationInput,
  SCORE_KEYS_FOR_CALIBRATION,
  type CalibrationSampleInput,
} from './heuristicCalibration';
import type { ScalpHeuristicScores, ScalpRawMetrics } from './scalpFeatures';
import type { TrainingSample } from '../db';

// ---------- کمک‌تابع‌های قطعی ----------

/** فیچر مصنوعی — تنها نقشش «شناسهٔ نمونه» است و predictor تزریقی از آن استفاده می‌کند */
function fakeFeatures(id: number): ScalpRawMetrics {
  return {
    brightness: id,
    whiteFlakeRatio: 0, rednessRatio: 0, hairCoverageRatio: 0,
    textureVariance: 0, avgR: 0, avgG: 0, avgB: 0,
    shineRatio: 0, edgeDensity: 0, patchinessRaw: 0, pigmentationRaw: 0,
  };
}

/** برچسب قطعی در بازهٔ [5,60] — طوری که 1.4*L+10 هیچ‌وقت به سقف ۱۰۰ نمی‌رسد */
function latentLabel(i: number, keyIdx: number): number {
  return 5 + ((i * 7919 + keyIdx * 104729) % 56);
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * ساخت مجموعهٔ آزمایشی که در آن heuristic دائماً سوگیری دارد:
 *   heuristic = clamp(label * 1.4 + 10)
 * پس نگاشت خطیِ یادگرفته‌شده باید تقریباً دقیق آن را معکوس کند.
 */
function makeBiasedDataset(n: number) {
  const labels: ScalpHeuristicScores[] = [];
  const inputs: CalibrationSampleInput[] = [];
  for (let i = 0; i < n; i++) {
    const label: Record<string, number> = {};
    const score: Record<string, number> = {};
    SCORE_KEYS_FOR_CALIBRATION.forEach((key, k) => {
      const l = latentLabel(i, k);
      label[key] = l;
      score[key] = clamp100(l * 1.4 + 10);
    });
    labels.push(label as unknown as ScalpHeuristicScores);
    inputs.push({ features: fakeFeatures(i), label: label as Partial<ScalpHeuristicScores> });
  }
  const scoreTable = inputs.map((_, i) => {
    const row: Record<string, number> = {};
    SCORE_KEYS_FOR_CALIBRATION.forEach((key, k) => {
      row[key] = clamp100(latentLabel(i, k) * 1.4 + 10);
    });
    return row;
  });
  const predictor = (f: ScalpRawMetrics) =>
    scoreTable[Math.round(f.brightness)] as unknown as ScalpHeuristicScores;
  return { inputs, labels, predictor };
}

describe('fitIsotonic (PAVA)', () => {
  it('خروجی باید صعودیِ نانزولی باشد حتی با دادهٔ نویزدار و نقض ترتیب', () => {
    const x = [5, 1, 3, 2, 4, 6, 7, 8];
    const y = [2, 1, 9, 1, 6, 5, 20, 18]; // نقض‌های متعدد
    const curve = fitIsotonic(x, y);
    for (let i = 1; i < curve.ys.length; i++) {
      expect(curve.ys[i]).toBeGreaterThanOrEqual(curve.ys[i - 1] - 1e-9);
    }
    // xs باید صعودی باشد
    for (let i = 1; i < curve.xs.length; i++) {
      expect(curve.xs[i]).toBeGreaterThan(curve.xs[i - 1]);
    }
  });

  it('دادهٔ کاملاً صعودی را دست‌نخورده برمی‌گرداند', () => {
    const x = [0, 1, 2, 3, 4];
    const y = [10, 20, 30, 40, 50];
    const curve = fitIsotonic(x, y);
    expect(curve.xs).toEqual(x);
    expect(curve.ys).toEqual(y);
  });

  it('xهای تکراری به میانگین وزن‌دار درست ادغام می‌شوند', () => {
    const x = [1, 1, 1, 2];
    const y = [0, 3, 6, 10]; // میانگین x=1 برابر 3
    const curve = fitIsotonic(x, y);
    expect(curve.xs).toEqual([1, 2]);
    expect(curve.ys[0]).toBeCloseTo(3, 9);
    expect(curve.ys[1]).toBeCloseTo(10, 9);
  });
});

describe('evalIsotonic', () => {
  const curve = fitIsotonic([0, 1, 2, 3], [0, 10, 20, 30]);

  it('بین نقاط شکست به‌صورت خطی درون‌یابی می‌کند', () => {
    expect(evalIsotonic(curve, 0.5)).toBeCloseTo(5, 9);
    expect(evalIsotonic(curve, 2.5)).toBeCloseTo(25, 9);
  });

  it('خارج از بازه روی لبه‌ها گیر می‌کند (clamp)', () => {
    expect(evalIsotonic(curve, -5)).toBeCloseTo(0, 9);
    expect(evalIsotonic(curve, 99)).toBeCloseTo(30, 9);
  });

  it('منحنی خالی بازده صفر دارد (به‌جای کرش)', () => {
    expect(evalIsotonic({ xs: [], ys: [] }, 1)).toBe(0);
  });
});

describe('fitLinear / evalLinear', () => {
  it('ضریب و عرض از مبدأِ معلوم را بازیابی می‌کند', () => {
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 40; i++) {
      x.push(i);
      y.push(2 * i + 7);
    }
    const m = fitLinear(x, y);
    expect(m.a).toBeCloseTo(2, 9);
    expect(m.b).toBeCloseTo(7, 9);
    expect(evalLinear(m, 10)).toBeCloseTo(27, 9);
  });

  it('x ثابت: به جای قفر شدن، افت به میانگین y می‌کند', () => {
    const m = fitLinear([4, 4, 4, 4], [2, 6, 10, 14]);
    expect(m.a).toBe(0);
    expect(m.b).toBeCloseTo(8, 9);
  });

  it('دادهٔ خالی، نگاشت همانی برمی‌گرداند', () => {
    const m = fitLinear([], []);
    expect(m).toEqual({ a: 1, b: 0 });
  });
});

describe('buildHeuristicCalibrationReport — ارزیابی قبل/بعد', () => {
  it('وقتی heuristic سوگیری نظام‌مند دارد، MAE بعد از کالیبراسیون به‌شکل معناداری کمتر است', () => {
    const { inputs, predictor } = makeBiasedDataset(80);
    const report = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    expect(report.perScore.length).toBeGreaterThan(0);
    // هر امتیازِ دارای داده باید بهبود ببیند
    for (const row of report.perScore) {
      expect(row.maeAfterChosen).toBeLessThan(row.maeBefore);
      expect(row.deltaMae).toBeGreaterThan(0);
    }
    // معکوس خطیِ دقیق: MAE کل بعد باید خیلی کمتر از نصف MAE قبل باشد
    expect(report.overallMaeAfter).toBeLessThan(report.overallMaeBefore * 0.5);
  });

  it('سقف قانون پارسونی: در تساویِ عملکرد، نگاشت خطی انتخاب می‌شود (isotonic فقط با برتری سخت)', () => {
    const { inputs, predictor } = makeBiasedDataset(80);
    const report = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    for (const row of report.perScore) {
      if (!(row.maeAfterIsotonic < row.maeAfterLinear - 1e-9)) {
        expect(row.chosen).toBe('linear');
      }
    }
  });

  it('گیج بلوغ: با نمونهٔ کمتر از حد نصاب maturityReady=false می‌شود و note صادقانه هشدار می‌دهد', () => {
    const { inputs, predictor } = makeBiasedDataset(60);
    const report = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    expect(report.maturityReady).toBe(false);
    expect(report.expertSampleCount).toBe(60);
    expect(report.note).toContain('فقط پیش‌نمایش');
  });

  it('با رد کردن حد نصاب (۱۵۰) maturityReady=true می‌شود', () => {
    const { inputs, predictor } = makeBiasedDataset(160);
    const report = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    expect(report.maturityReady).toBe(true);
    expect(report.expertSampleCount).toBe(160);
    expect(report.note).toContain('parity');
  });

  it('جراحی قطعی بودن: دو فراخوانی با ورودی یکسان، گزارش برابر می‌دهند', () => {
    const { inputs, predictor } = makeBiasedDataset(60);
    const a = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    const b = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    expect(a.overallMaeBefore).toBe(b.overallMaeBefore);
    expect(a.overallMaeAfter).toBe(b.overallMaeAfter);
    expect(a.perScore).toEqual(b.perScore);
  });

  it('کلیدهای با جفتٔ ناکافی رد می‌شوند و گزارش کرش نمی‌کند', () => {
    const { inputs, predictor } = makeBiasedDataset(10);
    // فقط ۱۰ نمونه → با folds=5 به folds*2=10 جفت می‌رسد؛ با حذف یک کلید از برچسب‌ها
    inputs.forEach((s) => { delete (s.label as Record<string, unknown>).hairThickness; });
    const report = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    const keys = report.perScore.map((r) => r.key);
    expect(keys).not.toContain('hairThickness');
    expect(report.perScore.length).toBeGreaterThan(0);
  });

  it('دادهٔ خالی: گزارش تهی — بدون کرش', () => {
    const report = buildHeuristicCalibrationReport({ samples: [], predictor: () => ({} as ScalpHeuristicScores) });
    expect(report.expertSampleCount).toBe(0);
    expect(report.perScore).toEqual([]);
    expect(report.overallMaeBefore).toBe(0);
    expect(report.maturityReady).toBe(false);
  });

  it('مقادیر نامتناهی در برچسب یا خروجی heuristic نادیده گرفته می‌شوند', () => {
    const { inputs, predictor } = makeBiasedDataset(30);
    (inputs[0].label as Record<string, number>).oiliness = NaN;
    (inputs[1].label as Record<string, number>).oiliness = Infinity;
    const report = buildHeuristicCalibrationReport({ samples: inputs, predictor });
    const oil = report.perScore.find((r) => r.key === 'oiliness');
    if (oil) {
      expect(oil.pairs).toBe(28); // دو جفت نامعتبر حذف شدند
      expect(Number.isFinite(oil.maeBefore)).toBe(true);
      expect(Number.isFinite(oil.maeAfterChosen)).toBe(true);
    }
  });
});

describe('samplesToCalibrationInput — پالای نمونه‌های واقعی', () => {
  it('فقط نمونه‌های expert دارای features و label عبور می‌کنند', () => {
    const base: TrainingSample = {
      id: 's1',
      features: fakeFeatures(1) as unknown as TrainingSample['features'],
      label: { oiliness: 40 } as TrainingSample['label'],
      labelSource: 'expert',
      createdAt: '2026-07-01T00:00:00.000Z',
    } as TrainingSample;
    const aiSample: TrainingSample = { ...base, id: 's2', labelSource: 'online_ai' };
    const noFeatures: TrainingSample = { ...base, id: 's3', features: undefined as unknown as TrainingSample['features'] };

    const out = samplesToCalibrationInput([base, aiSample, noFeatures]);
    expect(out.length).toBe(1);
    expect(out[0].label.oiliness).toBe(40);
  });
});
