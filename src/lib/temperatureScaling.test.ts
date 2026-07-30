/**
 * تست‌های موج ۴ (D3) — کالیبراسیون دمای واقعی.
 * همهٔ سناریوها روی دادهٔ مصنوعی تعیین‌شده (درست‌استایل) اجرا می‌شوند:
 * هیچ عددی از دادهٔ ناکافی هنری ساخته نمی‌شود؛ فقط قواعد ریاضی بررسی می‌شوند.
 */
import { describe, it, expect } from 'vitest';
import {
  probToLogit,
  logitToProb,
  applyTemperature,
  applyTemperatureToRow,
  binaryNll,
  fitTemperature,
  decideTemperatureScaling,
  TEMPERATURE_ECE_GATE,
  TEMPERATURE_MIN_HOLDOUT_SAMPLES,
  TEMPERATURE_MIN_VAL_SAMPLES,
} from './temperatureScaling';
import { computeCalibrationMetrics } from './mlEvaluation';

/** نویز pseudo قطعی (بدون Math.random — بازتولیدپذیر) */
function detNoise(i: number, j: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * مولد قطعی: حقیقت زمینی z با برچسب تصادفی p(z) ~ sigmoid(z) — این‌جوری برخلاف
 * برچسب ۰/۱ سفت، بیش‌اعتمادی واقعی ECE بالایی می‌سازد.
 */
function makeBinaryMatrix(n: number, k: number, confidence: 'over' | 'good'): { yTrue: number[][]; yPred: number[][] } {
  const yTrue: number[][] = [];
  const yPred: number[][] = [];
  for (let i = 0; i < n; i++) {
    const tRow: number[] = [];
    const pRow: number[] = [];
    for (let j = 0; j < k; j++) {
      const z = Math.sin(i * 0.37 + j * 0.91) * 2.2;
      const truth = detNoise(i, j) < logitToProb(z) ? 1 : 0;
      tRow.push(truth);
      pRow.push(logitToProb(z * (confidence === 'over' ? 4.0 : 1.0)));
    }
    yTrue.push(tRow);
    yPred.push(pRow);
  }
  return { yTrue, yPred };
}

const LABELS = 8;

describe('مبانی دما', () => {
  it('logit/prob وارون هم هستند', () => {
    for (const p of [0.001, 0.1, 0.5, 0.9, 0.999]) {
      expect(logitToProb(probToLogit(p))).toBeCloseTo(p, 6);
    }
  });

  it('T=1 دقیقاً همان احتمال‌ها را برمی‌گرداند', () => {
    const row = [0.2, 0.5, 0.8];
    expect(applyTemperatureToRow(row, 1)).toEqual(row);
  });

  it('T>1 به سمت ۰٫۵ می‌کشد و T<1 دورتر می‌برد', () => {
    const row = [0.9];
    const softer = applyTemperatureToRow(row, 3)[0];
    const sharper = applyTemperatureToRow(row, 0.5)[0];
    expect(softer).toBeLessThan(0.9);
    expect(softer).toBeGreaterThan(0.5);
    expect(sharper).toBeGreaterThan(0.9);
  });

  it('برچسب‌های شناخته‌شده با مقدارهای ۰/۱ سرریز نشان نمی‌دهند', () => {
    const row = applyTemperatureToRow([0, 1, 0.5], 2);
    expect(row.every((v) => v >= 0 && v <= 1 && Number.isFinite(v))).toBe(true);
  });
});

describe('برازش T', () => {
  it('مدل «بیش‌اعتماد» → T بزرگ‌تر از ۱ پیدا می‌شود', () => {
    const { yTrue, yPred } = makeBinaryMatrix(200, LABELS, 'over');
    const T = fitTemperature(yTrue, yPred);
    expect(T).toBeGreaterThan(1);
    // NLL بعد از دما باید کمتر شود
    const nllBefore = binaryNll(yTrue, yPred);
    const nllAfter = binaryNll(yTrue, applyTemperature(yPred, T));
    expect(nllAfter).toBeLessThan(nllBefore);
  });

  it('مدل خوش‌کالیبره → T نزدیک ۱ می‌ماند', () => {
    const { yTrue, yPred } = makeBinaryMatrix(200, LABELS, 'good');
    const T = fitTemperature(yTrue, yPred);
    expect(T).toBeGreaterThan(0.6);
    expect(T).toBeLessThan(1.7);
  });
});

describe('تصمیم D3 (گیت‌ها)', () => {
  it('با کم‌تر از ۶۰ نمونهٔ holdout هیچ تلاشی نمی‌کند (گیت نقشه‌راه)', () => {
    const { yTrue, yPred } = makeBinaryMatrix(TEMPERATURE_MIN_HOLDOUT_SAMPLES - 1, LABELS, 'over');
    const d = decideTemperatureScaling({
      validationTrue: yTrue, validationPred: yPred, holdoutTrue: yTrue, holdoutPred: yPred, labelCount: LABELS,
    });
    expect(d.attempted).toBe(false);
    expect(d.adopted).toBe(false);
    expect(d.reason).toContain('holdout');
  });

  it('با ECE پایین تلاش نمی‌کند (مدل خوش‌کالیبره)', () => {
    // با ۴۰۰ نمونه، ECE مدل خوش‌کالیبره به‌خاطر نویز نمونه‌برداری به‌آرامی زیر گیت می‌ماند
    const { yTrue, yPred } = makeBinaryMatrix(400, LABELS, 'good');
    const d = decideTemperatureScaling({
      validationTrue: yTrue, validationPred: yPred, holdoutTrue: yTrue, holdoutPred: yPred, labelCount: LABELS,
    });
    expect(d.attempted).toBe(false);
    expect(d.eceBefore).toBeDefined();
    expect(d.eceBefore!).toBeLessThanOrEqual(TEMPERATURE_ECE_GATE);
  });

  it('با validation ناپایدار رد می‌کند', () => {
    const val = makeBinaryMatrix(TEMPERATURE_MIN_VAL_SAMPLES - 1, LABELS, 'over');
    const hold = makeBinaryMatrix(80, LABELS, 'over');
    const d = decideTemperatureScaling({
      validationTrue: val.yTrue, validationPred: val.yPred,
      holdoutTrue: hold.yTrue, holdoutPred: hold.yPred, labelCount: LABELS,
    });
    expect(d.attempted).toBe(false);
    expect(d.adopted).toBe(false);
  });

  it('سناریوی کامل پذیرش: ECE بالا + داده کافی → T پذیرفته و ECE واقعی کاهش می‌یابد', () => {
    const val = makeBinaryMatrix(80, LABELS, 'over');
    const hold = makeBinaryMatrix(160, LABELS, 'over');
    const d = decideTemperatureScaling({
      validationTrue: val.yTrue, validationPred: val.yPred,
      holdoutTrue: hold.yTrue, holdoutPred: hold.yPred, labelCount: LABELS,
    });
    const eceRaw = computeCalibrationMetrics(hold.yTrue, hold.yPred, LABELS).ece;
    expect(eceRaw).toBeGreaterThan(TEMPERATURE_ECE_GATE); // پیش‌شرط تست خودش معتبر است
    expect(d.attempted).toBe(true);
    expect(d.adopted).toBe(true);
    expect(d.fittedT).toBeGreaterThan(1);
    expect(d.eceAfter!).toBeLessThan(d.eceBefore!);
    // یکparچگی: دمای پذیرفته‌شده واقعاً همان بهبود را می‌دهد
    const eceCheck = computeCalibrationMetrics(hold.yTrue, applyTemperature(hold.yPred, d.fittedT!), LABELS).ece;
    expect(eceCheck).toBeCloseTo(d.eceAfter!, 10);
  });

  it('بدون بهبود واقعی، T کنار گذاشته می‌شود حتی با ECE بالا', () => {
    // validation با holdout ناسازگار است (توزیع متفاوت) — بهترین T روی holdout بهتر نمی‌شود
    const valHold = { yTrue: [] as number[][], yPred: [] as number[][] };
    const valN = 80;
    for (let i = 0; i < valN; i++) {
      const z = Math.sin(i * 0.61) * 2.0;
      valHold.yTrue.push([z > 0 ? 1 : 0]);
      valHold.yPred.push([logitToProb(z * 3)]);
    }
    const holdN = 120;
    const holdTrue: number[][] = [];
    const holdPred: number[][] = [];
    for (let i = 0; i < holdN; i++) {
      // holdout: برچسب برعکسی از الگوی val ولی پیش‌بینی همچنان بیش‌اعتماد
      const z = Math.sin(i * 0.61 + Math.PI) * 2.0;
      holdTrue.push([z > 0 ? 1 : 0]);
      holdPred.push([logitToProb(-z * 3)]);
    }
    const eceRaw = computeCalibrationMetrics(holdTrue, holdPred, 1).ece;
    const d = decideTemperatureScaling({
      validationTrue: valHold.yTrue, validationPred: valHold.yPred,
      holdoutTrue: holdTrue, holdoutPred: holdPred, labelCount: 1,
    });
    if (eceRaw > TEMPERATURE_ECE_GATE) {
      expect(d.attempted).toBe(true);
      expect(d.adopted).toBe(false);
    } else {
      // اگر دادهٔ مصنوعی این هندسه شرط ECE را برآورده نکرد، حداقل تصمیم را باید ساخت یافته بگیریم
      expect(d.attempted).toBe(false);
    }
  });
});
