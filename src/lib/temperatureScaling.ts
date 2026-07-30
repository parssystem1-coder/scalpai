/**
 * temperatureScaling.ts — موج ۴ (D3): کالیبراسیون دمای واقعی برای خروجی‌های چندبرچسبی
 * -----------------------------------------------------------------------
 * مدل محلی ۶۶ خروجی برچسب دارد که هر کدام احتمال sigmoid هستند. وقتی این
 * احتمال‌ها «خوش‌کالیبره» نیستند (ECE بالا)، خوانش کاربر از خروجی به‌اشتباه
 * اعتماد/بی‌اعتماد می‌شود. راه‌حل استاندارد صنعت: یک دمای اسکالر T که روی
 * logit اعمال می‌شود:  p_calibrated = sigmoid(logit(p) / T)
 *
 * انضباط استقرار (توافق نقشه‌راه):
 *  ۱) گیت علمی: فقط وقتی holdout ≥ ۶۰ نمونه و ECE قبل > 0.10 (فاز D1 اندازه می‌گیرد)
 *  ۲) T روی **validation** برازش می‌شود نه holdout (بی‌طرفی holdout حفظ می‌شود)
 *  ۳) پذیرش فقط اگر ECEِ **holdout** واقعی بهتر شد (A/B قبل/بعد گزارش می‌شود)
 *  ۴) بدون تغییر معماری مدل و بدون بامپ نسخهٔ فیچر (post-hoc است)
 *
 * اگر T پذیرفته شود، آستانه‌های برچسب هم روی احتمال کالیبره‌شدهٔ validation
 * دوباره کالیبره می‌شوند (نباید آستانهٔ دلخواهِ احتمال خام را به احتمال دماشده
 * چسباند) و در predict هم همان T اعمال می‌شود (predict-time == eval-time).
 */

import { computeCalibrationMetrics } from './mlEvaluation';

export const TEMPERATURE_ECE_GATE = 0.10;
export const TEMPERATURE_MIN_HOLDOUT_SAMPLES = 60;
/** فیت T روی val با نمونهٔ خیلی کم بی‌ثبات است؛ زیر این سقف تلاش هم نمی‌کنیم */
export const TEMPERATURE_MIN_VAL_SAMPLES = 30;
/** محدودهٔ جست‌وجوی دما — بیرون از این بازه یعنی مدل/داده مشکل بنیادی دارد */
export const TEMPERATURE_SEARCH_MIN = 0.25;
export const TEMPERATURE_SEARCH_MAX = 6.0;
/** محاسبات golden-section */
const TEMPERATURE_SEARCH_ITERS = 60;

const EPS = 1e-7;

export function probToLogit(p: number): number {
  const c = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(c / (1 - c));
}

export function logitToProb(l: number): number {
  // شکل پایدار sigmoid تا برای l بزرگ/کوچک سرریز نشود
  if (l >= 0) {
    const e = Math.exp(-l);
    return 1 / (1 + e);
  }
  const e = Math.exp(l);
  return e / (1 + e);
}

/** sigmoid(logit(p)/T) برای یک سطر پیش‌بینی — T=1 بدون تغییر */
export function applyTemperatureToRow(row: number[], T: number): number[] {
  if (T === 1) return row.slice();
  return row.map((p) => logitToProb(probToLogit(p) / T));
}

export function applyTemperature(rows: number[][], T: number): number[][] {
  if (T === 1) return rows.map((row) => row.slice());
  return rows.map((row) => applyTemperatureToRow(row, T));
}

/** میانگین NLL (باینری) روی همهٔ نمونه‌ها و برچسب‌ها */
export function binaryNll(yTrue: number[][], yPred: number[][]): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < yTrue.length; i++) {
    const tRow = yTrue[i];
    const pRow = yPred[i];
    if (!tRow || !pRow) continue;
    for (let k = 0; k < tRow.length; k++) {
      const t = tRow[k] ?? 0;
      const p = Math.min(1 - EPS, Math.max(EPS, pRow[k] ?? 0));
      sum += -(t * Math.log(p) + (1 - t) * Math.log(1 - p));
      count += 1;
    }
  }
  return count > 0 ? sum / count : Infinity;
}

/**
 * برازش دما با جست‌وجوی golden-section روی لگاریتم T (بازهٔ تصادفی=لگاریتمی،
 * نتیجه نزدیک‌تر به آمار واقعی) — کمینه‌سازی NLL روی validation.
 * logitها یک‌بار پیش‌محاسبه می‌شوند تا هر پرس‌وجو O(n·k) بماند.
 */
export function fitTemperature(yTrue: number[][], yPred: number[][]): number {
  const logits = yPred.map((row) => row.map(probToLogit));
  const objective = (t: number): number => {
    if (t <= 0 || !Number.isFinite(t)) return Infinity;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const tRow = yTrue[i];
      const lRow = logits[i];
      if (!tRow || !lRow) continue;
      for (let k = 0; k < tRow.length; k++) {
        const p = Math.min(1 - EPS, Math.max(EPS, logitToProb(lRow[k] / t)));
        const y = tRow[k] ?? 0;
        sum += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
        count += 1;
      }
    }
    return count > 0 ? sum / count : Infinity;
  };

  let lo = Math.log(TEMPERATURE_SEARCH_MIN);
  let hi = Math.log(TEMPERATURE_SEARCH_MAX);
  const invPhi = (Math.sqrt(5) - 1) / 2;
  let c = hi - invPhi * (hi - lo);
  let d = lo + invPhi * (hi - lo);
  let fc = objective(Math.exp(c));
  let fd = objective(Math.exp(d));
  for (let i = 0; i < TEMPERATURE_SEARCH_ITERS; i++) {
    if (fc < fd) {
      hi = d; d = c; fd = fc;
      c = hi - invPhi * (hi - lo);
      fc = objective(Math.exp(c));
    } else {
      lo = c; c = d; fc = fd;
      d = lo + invPhi * (hi - lo);
      fd = objective(Math.exp(d));
    }
  }
  return Math.exp((lo + hi) / 2);
}

export interface TemperatureScalingDecision {
  /** آیا اصلاً تلاشی برای برازش انجام شد؟ (گیت‌های نقشه‌راه) */
  attempted: boolean;
  /** آیا T نهایی پذیرفته شد؟ فقط با بهبود واقعی ECE روی holdout */
  adopted: boolean;
  /** دلیل فارسیِ قابل‌نمایش (رد/پذیرش/گیت) */
  reason: string;
  fittedT?: number;
  eceBefore?: number;
  eceAfter?: number;
  sampleSizes: { validation: number; holdout: number };
}

/**
 * تصمیم D3 — گیت‌های نقشه‌راه را پیاده می‌کند. ورودی‌ها فقط ستون‌های برچسب
 * (۶۶ تای انتهایی) باید باشند.
 */
export function decideTemperatureScaling(options: {
  validationTrue: number[][];
  validationPred: number[][];
  holdoutTrue: number[][];
  holdoutPred: number[][];
  labelCount: number;
  eceGate?: number;
  minHoldoutSamples?: number;
  minValidationSamples?: number;
}): TemperatureScalingDecision {
  const {
    validationTrue, validationPred, holdoutTrue, holdoutPred, labelCount,
  } = options;
  const eceGate = options.eceGate ?? TEMPERATURE_ECE_GATE;
  const minHoldout = options.minHoldoutSamples ?? TEMPERATURE_MIN_HOLDOUT_SAMPLES;
  const minVal = options.minValidationSamples ?? TEMPERATURE_MIN_VAL_SAMPLES;
  const sizes = { validation: validationTrue.length, holdout: holdoutTrue.length };

  // گیت ۱: تعداد نمونهٔ معتبر برای ادعای ECE
  if (holdoutTrue.length < minHoldout) {
    return {
      attempted: false,
      adopted: false,
      reason: `دادهٔ holdout برای داوری ECE کافی نیست (${holdoutTrue.length} < ${minHoldout}) — کالیبراسیون دما تعلیق شد.`,
      sampleSizes: sizes,
    };
  }

  // گیت ۲: «پیش‌شرط علمی» — فقط وقتی ECE واقعاً بالاست کالیبراسیون دما لازم است
  const eceBefore = computeCalibrationMetrics(holdoutTrue, holdoutPred, labelCount).ece;
  if (eceBefore <= eceGate) {
    return {
      attempted: false,
      adopted: false,
      reason: `مدل همین حالا خوش‌کالیبره است (ECE=${eceBefore.toFixed(3)} ≤ ${eceGate}) — دما لازم نیست.`,
      eceBefore,
      sampleSizes: sizes,
    };
  }

  // گیت ۳: validation برای برازش پایدار
  if (validationTrue.length < minVal) {
    return {
      attempted: false,
      adopted: false,
      reason: `دادهٔ validation برای برازش پایدار T ناکافی است (${validationTrue.length} < ${minVal}).`,
      eceBefore,
      sampleSizes: sizes,
    };
  }

  const fittedT = fitTemperature(validationTrue, validationPred);
  if (!Number.isFinite(fittedT)) {
    return {
      attempted: true,
      adopted: false,
      reason: 'جست‌وجوی دما همگرا نشد؛ کالیبراسیون اعمال نشد.',
      eceBefore,
      sampleSizes: sizes,
    };
  }

  // A/B روی holdout — پذیرش فقط با بهبود واقعی
  const eceAfter = computeCalibrationMetrics(
    holdoutTrue,
    applyTemperature(holdoutPred, fittedT),
    labelCount,
  ).ece;

  if (!(eceAfter < eceBefore)) {
    return {
      attempted: true,
      adopted: false,
      reason: `دما بهبودی نساخت (ECE: ${eceBefore.toFixed(3)} → ${eceAfter.toFixed(3)}) — کنار گذاشته شد.`,
      fittedT,
      eceBefore,
      eceAfter,
      sampleSizes: sizes,
    };
  }

  return {
    attempted: true,
    adopted: true,
    reason: `ECE از ${eceBefore.toFixed(3)} به ${eceAfter.toFixed(3)} کاهش یافت؛ T=${fittedT.toFixed(2)} پذیرفته شد.`,
    fittedT,
    eceBefore,
    eceAfter,
    sampleSizes: sizes,
  };
}
