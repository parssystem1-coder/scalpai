/**
 * mlEvaluation.ts — فاز ۲
 *
 * ابزارهای خالص (بدون وابستگی به TensorFlow) برای عقلانی‌سازی فضای خروجی مدل:
 *  - سنجش support هر برچسب در دیتاست
 *  - تفکیک برچسب‌های «هستهٔ فعال» از «نادر»
 *  - متریک per-class به‌جای F1 میکروی گمراه‌کننده
 *  - کالیبراسیون آستانهٔ هر کلاس روی validation
 *  - وزن کلاس برای loss نامتوازن
 *
 * چرا جدا از localModel.ts؟ تا بدون بارگذاری کل باندل TF.js قابل تست و
 * قابل استفاده در UI باشد.
 */

/** حداقل نمونهٔ مثبت لازم تا یک برچسب «قابل یادگیری» تلقی شود */
export const MIN_POSITIVE_SUPPORT = 8;
/** حداقل نمونهٔ مثبت در validation تا کالیبراسیون آستانه معنادار باشد */
export const MIN_SUPPORT_FOR_CALIBRATION = 4;
/** بازهٔ جست‌وجوی آستانه هنگام کالیبراسیون */
export const THRESHOLD_GRID = [
  0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
];
/** سقف وزن کلاس مثبت — جلوگیری از انفجار گرادیان روی برچسب‌های خیلی نادر */
export const MAX_POSITIVE_WEIGHT = 12;

export interface LabelSupport {
  /** شناسهٔ برچسب */
  id: string;
  /** تعداد نمونه‌های مثبت */
  positives: number;
  /** کل نمونه‌ها */
  total: number;
  /** نسبت مثبت‌ها */
  prevalence: number;
  /** آیا داده کافی برای یادگیری دارد؟ */
  active: boolean;
}

export interface PerClassMetric {
  id: string;
  support: number;
  predicted: number;
  truePositives: number;
  precision: number;
  recall: number;
  f1: number;
  threshold: number;
}

export interface ClassificationSummary {
  perClass: PerClassMetric[];
  /** F1 میکرو — تحت سلطهٔ کلاس‌های پرتکرار */
  microF1: number;
  /** F1 ماکرو روی کلاس‌های دارای support — معیار صادقانه‌تر */
  macroF1: number;
  /** تعداد کلاس‌هایی که در محاسبهٔ ماکرو شرکت کردند */
  evaluatedClassCount: number;
}

/**
 * support هر برچسب را در ماتریس برچسب باینری می‌شمارد.
 * `yTrue[i][k]` مقدار برچسب k برای نمونهٔ i است (۰ یا ۱، یا احتمال).
 */
export function computeLabelSupport(
  yTrue: number[][],
  labelIds: string[],
  minPositives = MIN_POSITIVE_SUPPORT,
): LabelSupport[] {
  const total = yTrue.length;
  return labelIds.map((id, k) => {
    let positives = 0;
    for (let i = 0; i < total; i++) {
      if ((yTrue[i]?.[k] ?? 0) >= 0.5) positives++;
    }
    return {
      id,
      positives,
      total,
      prevalence: total ? positives / total : 0,
      active: positives >= minPositives,
    };
  });
}

/**
 * فاز ۲٫۵ — وزن کلاس مثبت برای BCE نامتوازن.
 *
 * وزن = (منفی‌ها / مثبت‌ها)، محدودشده به `MAX_POSITIVE_WEIGHT`.
 * برای کلاس بدون نمونهٔ مثبت وزن ۱ برمی‌گردد (اثر خنثی؛ جریمهٔ اضافی روی
 * کلاسی که هیچ سیگنالی ندارد فقط نویز تولید می‌کند).
 */
export function computePositiveClassWeights(
  yTrue: number[][],
  labelCount: number,
  maxWeight = MAX_POSITIVE_WEIGHT,
): number[] {
  const total = yTrue.length;
  const weights: number[] = [];
  for (let k = 0; k < labelCount; k++) {
    let pos = 0;
    for (let i = 0; i < total; i++) {
      if ((yTrue[i]?.[k] ?? 0) >= 0.5) pos++;
    }
    if (pos === 0 || pos === total) {
      weights.push(1);
      continue;
    }
    const neg = total - pos;
    weights.push(Math.min(maxWeight, Math.max(1, neg / pos)));
  }
  return weights;
}

function f1From(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

/**
 * فاز ۲٫۱ — متریک به‌ازای هر کلاس + خلاصهٔ میکرو/ماکرو.
 *
 * نکتهٔ مهم: ماکرو فقط روی کلاس‌هایی محاسبه می‌شود که حداقل یک نمونهٔ مثبت
 * واقعی دارند. میانگین‌گیری روی کلاس‌های بدون نمونهٔ مثبت، عدد را به‌طور
 * مصنوعی به سمت صفر می‌کشد و بی‌معناست.
 */
export function computeClassificationSummary(
  yTrue: number[][],
  yPred: number[][],
  labelIds: string[],
  thresholds: number[] | number,
): ClassificationSummary {
  const thrAt = (k: number) =>
    typeof thresholds === 'number' ? thresholds : (thresholds[k] ?? 0.45);

  const perClass: PerClassMetric[] = [];
  let microTp = 0, microFp = 0, microFn = 0;

  for (let k = 0; k < labelIds.length; k++) {
    const thr = thrAt(k);
    let tp = 0, fp = 0, fn = 0, support = 0, predicted = 0;
    for (let i = 0; i < yTrue.length; i++) {
      const t = (yTrue[i]?.[k] ?? 0) >= 0.5;
      const p = (yPred[i]?.[k] ?? 0) >= thr;
      if (t) support++;
      if (p) predicted++;
      if (p && t) tp++;
      else if (p && !t) fp++;
      else if (!p && t) fn++;
    }
    microTp += tp; microFp += fp; microFn += fn;
    const { precision, recall, f1 } = f1From(tp, fp, fn);
    perClass.push({
      id: labelIds[k],
      support,
      predicted,
      truePositives: tp,
      precision,
      recall,
      f1,
      threshold: thr,
    });
  }

  const withSupport = perClass.filter(c => c.support > 0);
  const macroF1 = withSupport.length
    ? withSupport.reduce((s, c) => s + c.f1, 0) / withSupport.length
    : 0;

  return {
    perClass,
    microF1: f1From(microTp, microFp, microFn).f1,
    macroF1,
    evaluatedClassCount: withSupport.length,
  };
}

/**
 * فاز ۲٫۳ — کالیبراسیون آستانهٔ هر کلاس روی مجموعهٔ validation.
 *
 * برای هر کلاس، آستانه‌ای انتخاب می‌شود که F1 همان کلاس را بیشینه کند.
 * اگر کلاس نمونهٔ مثبت کافی نداشته باشد، آستانهٔ پیش‌فرض حفظ می‌شود —
 * چون بهینه‌سازی روی ۱ یا ۲ نمونه، overfit خالص است.
 */
export function calibrateThresholds(
  yTrue: number[][],
  yPred: number[][],
  labelCount: number,
  defaultThreshold: number,
  minSupport = MIN_SUPPORT_FOR_CALIBRATION,
): number[] {
  const out: number[] = [];
  for (let k = 0; k < labelCount; k++) {
    let support = 0;
    for (let i = 0; i < yTrue.length; i++) {
      if ((yTrue[i]?.[k] ?? 0) >= 0.5) support++;
    }
    if (support < minSupport) {
      out.push(defaultThreshold);
      continue;
    }
    let bestThr = defaultThreshold;
    let bestF1 = -1;
    for (const thr of THRESHOLD_GRID) {
      let tp = 0, fp = 0, fn = 0;
      for (let i = 0; i < yTrue.length; i++) {
        const t = (yTrue[i]?.[k] ?? 0) >= 0.5;
        const p = (yPred[i]?.[k] ?? 0) >= thr;
        if (p && t) tp++;
        else if (p && !t) fp++;
        else if (!p && t) fn++;
      }
      const { f1 } = f1From(tp, fp, fn);
      // در تساوی، آستانهٔ بالاتر ترجیح دارد (محافظه‌کارتر = هشدار کاذب کمتر)
      if (f1 > bestF1 + 1e-9) {
        bestF1 = f1;
        bestThr = thr;
      }
    }
    out.push(bestThr);
  }
  return out;
}

/**
 * فاز ۲٫۴ — تجمیع نتایج چند اجرای holdout.
 * میانگین و انحراف‌معیار برگردانده می‌شود تا بتوان «برتری واقعی» را از
 * «نوسان یک split خوش‌شانس» تفکیک کرد.
 */
export interface RepeatedMetricSummary {
  mean: number;
  std: number;
  runs: number;
  values: number[];
}

export function summarizeRepeatedRuns(values: (number | undefined)[]): RepeatedMetricSummary {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (!nums.length) return { mean: 0, std: 0, runs: 0, values: [] };
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
  return { mean, std: Math.sqrt(variance), runs: nums.length, values: nums };
}

/**
 * برچسب‌هایی که مدل نباید روی آن‌ها اظهارنظر کند (support ناکافی).
 * خروجی مدل برای این‌ها در زمان پیش‌بینی سرکوب می‌شود.
 */
export function inactiveLabelIds(support: LabelSupport[]): string[] {
  return support.filter(s => !s.active).map(s => s.id);
}

/**
 * فاز ۱٫۱ — محاسبهٔ MAE و R² برای تک‌تک امتیازهای عددی ۹ گانه.
 */
export interface ScoreMetric {
  key: string;
  mae: number;
  r2: number;
}

export function computeScoreMetrics(
  yTrue: number[][],
  yPred: number[][],
  scoreKeys: string[]
): ScoreMetric[] {
  const n = yTrue.length;
  const metrics: ScoreMetric[] = [];
  if (n === 0) return [];

  for (let k = 0; k < scoreKeys.length; k++) {
    let absDiffSum = 0;
    let sqDiffSum = 0;
    let trueSum = 0;

    for (let i = 0; i < n; i++) {
      const t = yTrue[i]?.[k] ?? 0;
      const p = yPred[i]?.[k] ?? 0;
      absDiffSum += Math.abs(t - p);
      sqDiffSum += Math.pow(t - p, 2);
      trueSum += t;
    }

    const meanTrue = trueSum / n;
    let totSumSq = 0;
    for (let i = 0; i < n; i++) {
      const t = yTrue[i]?.[k] ?? 0;
      totSumSq += Math.pow(t - meanTrue, 2);
    }

    const mae = absDiffSum / n;
    const r2 = totSumSq === 0 ? 0 : 1 - (sqDiffSum / totSumSq);

    metrics.push({
      key: scoreKeys[k],
      mae,
      r2
    });
  }

  return metrics;
}

/**
 * فاز ۱٫۳ — سنجش کالیبراسیون با ECE (Expected Calibration Error) و Brier Score.
 */
export interface CalibrationSummary {
  ece: number;
  brier: number;
}

export function computeCalibrationMetrics(
  yTrue: number[][],
  yPred: number[][],
  labelCount: number,
  numBins = 10
): CalibrationSummary {
  const n = yTrue.length;
  if (n === 0) return { ece: 0, brier: 0 };

  let totalBrier = 0;
  let totalEce = 0;
  let countsWithConfidence = 0;

  for (let k = 0; k < labelCount; k++) {
    const bins: { trueSum: number; predSum: number; count: number }[] = Array.from(
      { length: numBins },
      () => ({ trueSum: 0, predSum: 0, count: 0 })
    );

    for (let i = 0; i < n; i++) {
      const t = (yTrue[i]?.[k] ?? 0) >= 0.5 ? 1 : 0;
      const p = yPred[i]?.[k] ?? 0;

      totalBrier += Math.pow(t - p, 2);

      let binIdx = Math.floor(p * numBins);
      if (binIdx >= numBins) binIdx = numBins - 1;
      if (binIdx < 0) binIdx = 0;

      bins[binIdx].trueSum += t;
      bins[binIdx].predSum += p;
      bins[binIdx].count += 1;
    }

    let labelEce = 0;
    for (const bin of bins) {
      if (bin.count > 0) {
        const accuracy = bin.trueSum / bin.count;
        const confidence = bin.predSum / bin.count;
        labelEce += (bin.count / n) * Math.abs(accuracy - confidence);
      }
    }
    totalEce += labelEce;
    countsWithConfidence++;
  }

  return {
    ece: countsWithConfidence > 0 ? totalEce / countsWithConfidence : 0,
    brier: (n * labelCount) > 0 ? totalBrier / (n * labelCount) : 0
  };
}

/**
 * فاز ۱٫۲ — محاسبهٔ فاصله اطمینان ۹۵٪ آماری برای نتایج ارزیابی.
 */
export interface ConfidenceInterval {
  mean: number;
  margin: number;
  lower: number;
  upper: number;
}

export function computeConfidenceInterval(values: number[]): ConfidenceInterval {
  const n = values.length;
  if (n === 0) return { mean: 0, margin: 0, lower: 0, upper: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { mean, margin: 0, lower: mean, upper: mean };
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
  const std = Math.sqrt(variance);
  const margin = 1.96 * (std / Math.sqrt(n));
  return {
    mean,
    margin,
    lower: mean - margin,
    upper: mean + margin
  };
}
