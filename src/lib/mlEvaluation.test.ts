/**
 * تست‌های فاز ۲ — عقلانی‌سازی فضای خروجی یادگیری ماشین.
 */
import { describe, expect, it } from 'vitest';
import {
  MIN_POSITIVE_SUPPORT,
  calibrateThresholds,
  computeClassificationSummary,
  computeLabelSupport,
  computePositiveClassWeights,
  inactiveLabelIds,
  summarizeRepeatedRuns,
} from './mlEvaluation';
import { evaluateRetrainGate } from './localModel';
import { MODEL_ARCHITECTURE } from './localModelConstants';

const FV = 'v3.2-normalized-adaptive-grid';

describe('فاز ۲٫۲ — سنجش support و تفکیک برچسب‌های نادر', () => {
  it('برچسب پرتکرار فعال و برچسب نادر غیرفعال می‌شود', () => {
    // برچسب ۰ در همهٔ ۱۰ نمونه، برچسب ۱ فقط در ۱ نمونه
    const y = Array.from({ length: 10 }, (_, i) => [1, i === 0 ? 1 : 0]);
    const support = computeLabelSupport(y, ['common', 'rare']);
    expect(support[0]).toMatchObject({ positives: 10, active: true });
    expect(support[1]).toMatchObject({ positives: 1, active: false });
  });

  it('دقیقاً روی مرز MIN_POSITIVE_SUPPORT فعال می‌شود', () => {
    const y = Array.from({ length: 20 }, (_, i) => [i < MIN_POSITIVE_SUPPORT ? 1 : 0]);
    expect(computeLabelSupport(y, ['x'])[0].active).toBe(true);
    const y2 = Array.from({ length: 20 }, (_, i) => [i < MIN_POSITIVE_SUPPORT - 1 ? 1 : 0]);
    expect(computeLabelSupport(y2, ['x'])[0].active).toBe(false);
  });

  it('prevalence درست محاسبه می‌شود', () => {
    const y = [[1], [1], [0], [0]];
    expect(computeLabelSupport(y, ['x'])[0].prevalence).toBe(0.5);
  });

  it('inactiveLabelIds فقط برچسب‌های کم‌داده را برمی‌گرداند', () => {
    const y = Array.from({ length: 10 }, (_, i) => [1, i === 0 ? 1 : 0]);
    expect(inactiveLabelIds(computeLabelSupport(y, ['common', 'rare']))).toEqual(['rare']);
  });

  it('دیتاست خالی امن است', () => {
    expect(computeLabelSupport([], ['a', 'b'])).toHaveLength(2);
    expect(computeLabelSupport([], ['a'])[0].prevalence).toBe(0);
  });
});

describe('فاز ۲٫۵ — وزن کلاس برای loss نامتوازن', () => {
  it('کلاس نادر وزن بیشتری می‌گیرد', () => {
    // کلاس ۰: ۵۰٪ مثبت، کلاس ۱: ۱۰٪ مثبت
    const y = Array.from({ length: 10 }, (_, i) => [i < 5 ? 1 : 0, i === 0 ? 1 : 0]);
    const w = computePositiveClassWeights(y, 2);
    expect(w[0]).toBeCloseTo(1, 5);
    expect(w[1]).toBeCloseTo(9, 5);
    expect(w[1]).toBeGreaterThan(w[0]);
  });

  it('وزن به سقف محدود می‌شود تا گرادیان منفجر نشود', () => {
    const y = Array.from({ length: 1000 }, (_, i) => [i === 0 ? 1 : 0]);
    expect(computePositiveClassWeights(y, 1, 12)[0]).toBe(12);
  });

  it('کلاس بدون نمونهٔ مثبت یا تماماً مثبت وزن خنثی می‌گیرد', () => {
    expect(computePositiveClassWeights([[0], [0]], 1)[0]).toBe(1);
    expect(computePositiveClassWeights([[1], [1]], 1)[0]).toBe(1);
  });
});

describe('فاز ۲٫۱ — متریک per-class و تفاوت میکرو/ماکرو', () => {
  it('پیش‌بینی کامل درست، F1 برابر ۱ می‌دهد', () => {
    const y = [[1, 0], [0, 1]];
    const p = [[0.9, 0.1], [0.1, 0.9]];
    const s = computeClassificationSummary(y, p, ['a', 'b'], 0.5);
    expect(s.microF1).toBeCloseTo(1, 5);
    expect(s.macroF1).toBeCloseTo(1, 5);
  });

  it('ماکرو ضعف روی کلاس نادر را آشکار می‌کند در حالی که میکرو آن را پنهان می‌کند', () => {
    // کلاس ۰ پرتکرار و همیشه درست؛ کلاس ۱ نادر و همیشه اشتباه
    const y: number[][] = [];
    const p: number[][] = [];
    for (let i = 0; i < 20; i++) {
      y.push([1, i === 0 ? 1 : 0]);
      p.push([0.9, 0.01]);
    }
    const s = computeClassificationSummary(y, p, ['common', 'rare'], 0.5);
    expect(s.microF1).toBeGreaterThan(0.9);
    expect(s.macroF1).toBeLessThan(0.6);
    expect(s.perClass[1].f1).toBe(0);
  });

  it('کلاس بدون نمونهٔ مثبت در میانگین ماکرو شرکت نمی‌کند', () => {
    const y = [[1, 0], [1, 0]];
    const p = [[0.9, 0.1], [0.9, 0.1]];
    const s = computeClassificationSummary(y, p, ['a', 'never'], 0.5);
    expect(s.evaluatedClassCount).toBe(1);
    expect(s.macroF1).toBeCloseTo(1, 5);
  });

  it('آستانهٔ متفاوت به‌ازای هر کلاس اعمال می‌شود', () => {
    const y = [[1], [1]];
    const p = [[0.3], [0.3]];
    expect(computeClassificationSummary(y, p, ['a'], 0.5).perClass[0].f1).toBe(0);
    expect(computeClassificationSummary(y, p, ['a'], [0.2]).perClass[0].f1).toBeCloseTo(1, 5);
  });

  it('precision و recall جداگانه درست محاسبه می‌شوند', () => {
    // ۲ مثبت واقعی، مدل ۳ تا مثبت می‌زند که ۲ تا درست است
    const y = [[1], [1], [0], [0]];
    const p = [[0.9], [0.9], [0.9], [0.1]];
    const c = computeClassificationSummary(y, p, ['a'], 0.5).perClass[0];
    expect(c.recall).toBeCloseTo(1, 5);
    expect(c.precision).toBeCloseTo(2 / 3, 5);
  });
});

describe('فاز ۲٫۳ — کالیبراسیون آستانه', () => {
  it('آستانه‌ای انتخاب می‌شود که کلاس واقعاً تشخیص داده شود', () => {
    // همهٔ مثبت‌ها احتمال ~۰٫۳ دارند؛ آستانهٔ ۰٫۴۵ همه را از دست می‌دهد
    const y = [[1], [1], [1], [1], [0], [0], [0], [0]];
    const p = [[0.3], [0.32], [0.31], [0.33], [0.05], [0.04], [0.06], [0.03]];
    const thr = calibrateThresholds(y, p, 1, 0.45);
    expect(thr[0]).toBeLessThan(0.45);
    const after = computeClassificationSummary(y, p, ['a'], thr).perClass[0].f1;
    expect(after).toBeCloseTo(1, 5);
  });

  it('کلاس با support ناکافی آستانهٔ پیش‌فرض را نگه می‌دارد (جلوگیری از overfit)', () => {
    const y = [[1], [0], [0], [0], [0], [0]];
    const p = [[0.3], [0.05], [0.04], [0.06], [0.03], [0.02]];
    expect(calibrateThresholds(y, p, 1, 0.45)[0]).toBe(0.45);
  });

  it('برای هر کلاس یک آستانه برمی‌گرداند', () => {
    const y = [[1, 0], [0, 1]];
    const p = [[0.9, 0.1], [0.1, 0.9]];
    expect(calibrateThresholds(y, p, 2, 0.45)).toHaveLength(2);
  });

  it('مجموعهٔ خالی، آستانهٔ پیش‌فرض می‌دهد', () => {
    expect(calibrateThresholds([], [], 3, 0.45)).toEqual([0.45, 0.45, 0.45]);
  });
});

describe('فاز ۲٫۴ — تجمیع اجراهای تکراری', () => {
  it('میانگین و انحراف‌معیار درست است', () => {
    const s = summarizeRepeatedRuns([10, 12, 14]);
    expect(s.mean).toBeCloseTo(12, 5);
    expect(s.runs).toBe(3);
    expect(s.std).toBeGreaterThan(0);
  });

  it('مقادیر undefined نادیده گرفته می‌شوند', () => {
    const s = summarizeRepeatedRuns([10, undefined, 10]);
    expect(s.runs).toBe(2);
    expect(s.std).toBeCloseTo(0, 5);
  });

  it('ورودی تماماً خالی امن است', () => {
    expect(summarizeRepeatedRuns([undefined, undefined])).toMatchObject({ runs: 0, mean: 0 });
  });
});

describe('فاز ۲٫۱ — گیت بازآموزی با F1 ماکرو', () => {
  const base = {
    version: 3,
    architecture: MODEL_ARCHITECTURE,
    featureVersion: FV,
    holdoutMae: 10,
    holdoutObsF1: 0.9,
    holdoutMacroF1: 0.5,
  };

  it('وقتی ماکرو موجود است، افت ماکرو مدل را رد می‌کند حتی اگر میکرو ثابت بماند', () => {
    const d = evaluateRetrainGate(base, {
      holdoutMae: 10,
      holdoutObsF1: 0.9, // میکرو دست‌نخورده
      holdoutMacroF1: 0.2, // ولی کیفیت روی کلاس‌های نادر فروریخته
      featureVersion: FV,
    });
    expect(d.shouldReplace).toBe(false);
    expect(d.reason).toContain('ماکرو');
  });

  it('بهبود ماکرو پذیرفته می‌شود', () => {
    const d = evaluateRetrainGate(base, {
      holdoutMae: 10,
      holdoutObsF1: 0.9,
      holdoutMacroF1: 0.7,
      featureVersion: FV,
    });
    expect(d.shouldReplace).toBe(true);
  });

  it('نبود ماکرو در یکی از دو طرف، به مقایسهٔ میکرو برمی‌گردد', () => {
    const d = evaluateRetrainGate(
      { ...base, holdoutMacroF1: undefined },
      { holdoutMae: 10, holdoutObsF1: 0.2, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(false);
    expect(d.reason).not.toContain('ماکرو');
  });
});
