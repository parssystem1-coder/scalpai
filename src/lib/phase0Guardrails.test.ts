/**
 * تست‌های فاز ۰ — گاردریل‌های جلوگیری از افت خاموش کیفیت.
 */
import { describe, expect, it } from 'vitest';
import { evaluateRetrainGate } from './localModel';
import { RETRAIN_F1_TOLERANCE, RETRAIN_MAE_TOLERANCE } from './localModelConstants';
import { MODEL_ARCHITECTURE } from './localModelConstants';
import { detectScoreObservationConflicts, detectLesionObservationGaps } from './aiResultConsistency';
import { sanitizeBBox } from './analysisSchemas';
import { findPriorAnalysisForImage, hashImagePayload } from './imageDedup';

const FV = 'v3.2-normalized-adaptive-grid';

function baseline(over: Partial<Parameters<typeof evaluateRetrainGate>[0] & object> = {}) {
  return {
    version: 3,
    architecture: MODEL_ARCHITECTURE,
    featureVersion: FV,
    holdoutMae: 10,
    holdoutObsF1: 0.6,
    ...over,
  };
}

describe('فاز ۰٫۱ — گیت champion/challenger برای بازآموزی', () => {
  it('اگر مدل فعال قبلی نباشد، مدل جدید ذخیره می‌شود', () => {
    const d = evaluateRetrainGate(null, { holdoutMae: 12, holdoutObsF1: 0.5, featureVersion: FV });
    expect(d.shouldReplace).toBe(true);
    expect(d.compared).toBe(false);
  });

  it('مدل بهتر جایگزین می‌شود', () => {
    const d = evaluateRetrainGate(baseline(), { holdoutMae: 8, holdoutObsF1: 0.7, featureVersion: FV });
    expect(d.shouldReplace).toBe(true);
    expect(d.compared).toBe(true);
  });

  it('مدل با افت معنادار MAE رد می‌شود و مدل قبلی می‌ماند', () => {
    const d = evaluateRetrainGate(
      baseline(),
      { holdoutMae: 10 + RETRAIN_MAE_TOLERANCE + 1, holdoutObsF1: 0.6, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(false);
    expect(d.compared).toBe(true);
    expect(d.reason).toContain('MAE');
  });

  it('مدل با افت معنادار F1 رد می‌شود', () => {
    const d = evaluateRetrainGate(
      baseline(),
      { holdoutMae: 10, holdoutObsF1: 0.6 - RETRAIN_F1_TOLERANCE - 0.05, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(false);
    expect(d.reason).toContain('F1');
  });

  it('افت کوچک‌تر از حاشیهٔ تحمل، رد نمی‌شود (نوسان طبیعی split)', () => {
    const d = evaluateRetrainGate(
      baseline(),
      { holdoutMae: 10 + RETRAIN_MAE_TOLERANCE / 2, holdoutObsF1: 0.6 - RETRAIN_F1_TOLERANCE / 2, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(true);
  });

  it('override دستی کاربر گیت را دور می‌زند', () => {
    const d = evaluateRetrainGate(
      baseline(),
      { holdoutMae: 99, holdoutObsF1: 0, featureVersion: FV },
      { force: true },
    );
    expect(d.shouldReplace).toBe(true);
    expect(d.forced).toBe(true);
  });

  it('تغییر نسخهٔ فیچر مقایسه را بی‌معنا می‌کند و مدل جدید ذخیره می‌شود', () => {
    const d = evaluateRetrainGate(
      baseline({ featureVersion: 'v3.1-old' }),
      { holdoutMae: 99, holdoutObsF1: 0, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(true);
    expect(d.compared).toBe(false);
  });

  it('تغییر معماری هم مقایسه را بی‌معنا می‌کند', () => {
    const d = evaluateRetrainGate(
      baseline({ architecture: 'mlp_multitask_v1' }),
      { holdoutMae: 99, holdoutObsF1: 0, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(true);
    expect(d.compared).toBe(false);
  });

  it('کاندید بدون متریک holdout رد می‌شود (افت ناشناخته پذیرفته نیست)', () => {
    const d = evaluateRetrainGate(baseline(), { holdoutMae: undefined, featureVersion: FV });
    expect(d.shouldReplace).toBe(false);
    expect(d.compared).toBe(true);
  });

  it('baseline بدون متریک holdout مانع ذخیره نمی‌شود', () => {
    const d = evaluateRetrainGate(
      baseline({ holdoutMae: undefined }),
      { holdoutMae: 12, holdoutObsF1: 0.5, featureVersion: FV },
    );
    expect(d.shouldReplace).toBe(true);
    expect(d.compared).toBe(false);
  });
});

describe('فاز ۰٫۲ — تشخیص تناقض امتیاز و تشخیص', () => {
  it('شوره گزارش‌شده با امتیاز شورهٔ نزدیک صفر تناقض است', () => {
    const c = detectScoreObservationConflicts(['dandruff'], { dandruff: 3 });
    expect(c).toHaveLength(1);
    expect(c[0].scoreKey).toBe('dandruff');
    expect(c[0].direction).toBe('expectedHigh');
  });

  it('ریزش مو گزارش‌شده با تراکم بسیار بالا تناقض است', () => {
    const c = detectScoreObservationConflicts(['hairLoss'], { densityScore: 95 });
    expect(c).toHaveLength(1);
    expect(c[0].direction).toBe('expectedLow');
  });

  it('نتیجهٔ سازگار هیچ تناقضی تولید نمی‌کند', () => {
    const c = detectScoreObservationConflicts(
      ['dandruff', 'hairLoss', 'oily'],
      { dandruff: 70, densityScore: 30, oiliness: 65 },
    );
    expect(c).toEqual([]);
  });

  it('امتیاز غایب باعث هشدار کاذب نمی‌شود', () => {
    expect(detectScoreObservationConflicts(['dandruff'], {})).toEqual([]);
    expect(detectScoreObservationConflicts(['dandruff'], { dandruff: undefined })).toEqual([]);
  });

  it('ورودی خالی امن است', () => {
    expect(detectScoreObservationConflicts(null, null)).toEqual([]);
    expect(detectScoreObservationConflicts([], { dandruff: 0 })).toEqual([]);
  });

  it('چند تناقض هم‌زمان گزارش می‌شود', () => {
    const c = detectScoreObservationConflicts(
      ['dandruff', 'hairLoss'],
      { dandruff: 2, densityScore: 98 },
    );
    expect(c).toHaveLength(2);
  });

  it('ضایعهٔ پراطمینان که در observations نیامده، شکاف محسوب می‌شود', () => {
    const gaps = detectLesionObservationGaps(
      [{ type: 'psoriasis', confidence: 0.9 }, { type: 'dandruff', confidence: 0.2 }],
      ['dandruff'],
    );
    expect(gaps).toEqual(['psoriasis']);
  });
});

describe('فاز ۰٫۳ — پاک‌سازی bbox', () => {
  it('ترتیب معکوس مختصات اصلاح می‌شود', () => {
    expect(sanitizeBBox([50, 60, 10, 20])).toEqual([10, 20, 50, 60]);
  });

  it('مقادیر منفی به صفر کلمپ می‌شوند', () => {
    expect(sanitizeBBox([-30, -5, 40, 50])).toEqual([0, 0, 40, 50]);
  });

  it('NaN و Infinity کل bbox را بی‌اعتبار می‌کند', () => {
    expect(sanitizeBBox([NaN, 0, 10, 10])).toEqual([]);
    expect(sanitizeBBox([0, 0, Infinity, 10])).toEqual([]);
  });

  it('bbox کوتاه یا غایب رد می‌شود', () => {
    expect(sanitizeBBox([0, 0])).toEqual([]);
    expect(sanitizeBBox(undefined)).toEqual([]);
    expect(sanitizeBBox(null)).toEqual([]);
  });

  it('bbox معتبر دست‌نخورده می‌ماند', () => {
    expect(sanitizeBBox([10, 20, 30, 40])).toEqual([10, 20, 30, 40]);
  });
});

describe('فاز ۰٫۴ — تشخیص تحلیل تکراری', () => {
  const analyses = [
    { id: 'a1', clientId: 'c1', type: 'ai', galleryItemId: 'g1', createdAt: '2026-01-01T10:00:00Z' },
    { id: 'a2', clientId: 'c1', type: 'ai', galleryItemId: 'g1', createdAt: '2026-02-01T10:00:00Z' },
    { id: 'a3', clientId: 'c1', type: 'offline', galleryItemId: 'g1', createdAt: '2026-03-01T10:00:00Z' },
    { id: 'a4', clientId: 'c2', type: 'ai', galleryItemId: 'g1', createdAt: '2026-04-01T10:00:00Z' },
  ];

  it('جدیدترین تحلیل قبلی همان تصویر/مشتری/نوع را برمی‌گرداند', () => {
    const found = findPriorAnalysisForImage(analyses, { clientId: 'c1', galleryItemId: 'g1', type: 'ai' });
    expect(found?.analysisId).toBe('a2');
    expect(found?.count).toBe(2);
  });

  it('تحلیل نوع دیگر یا مشتری دیگر تکراری محسوب نمی‌شود', () => {
    expect(findPriorAnalysisForImage(analyses, { clientId: 'c1', galleryItemId: 'g2', type: 'ai' })).toBeNull();
    expect(findPriorAnalysisForImage(analyses, { clientId: 'c3', galleryItemId: 'g1', type: 'ai' })).toBeNull();
  });

  it('ورودی خالی امن است', () => {
    expect(findPriorAnalysisForImage([], { clientId: 'c1', galleryItemId: 'g1', type: 'ai' })).toBeNull();
    expect(findPriorAnalysisForImage(analyses, { clientId: '', galleryItemId: 'g1', type: 'ai' })).toBeNull();
  });

  it('هش تصویر برای محتوای یکسان پایدار و برای محتوای متفاوت متمایز است', () => {
    const a = 'AAAABBBBCCCC'.repeat(500);
    const b = 'AAAABBBBCCCD'.repeat(500);
    expect(hashImagePayload(a)).toBe(hashImagePayload(a));
    expect(hashImagePayload(a)).not.toBe(hashImagePayload(b));
  });

  it('پیشوند data-url روی هش اثر ندارد', () => {
    const payload = 'ZZZZ'.repeat(400);
    expect(hashImagePayload(`data:image/jpeg;base64,${payload}`)).toBe(hashImagePayload(payload));
  });
});
