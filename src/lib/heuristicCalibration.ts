/**
 * heuristicCalibration.ts — موج ۴ (D2): لایهٔ شواهد کالیبراسیون آستانه‌های heuristic
 * -----------------------------------------------------------------------
 * نقشه‌راه (D2): وقتی گیج «۱۵۰ نمونه برای کالیبراسیون heuristic» سبز شد، برای
 * هر ۹ امتیاز، نگاشت یادگیری‌شده (isotonic یا خطی) بین خروجی heuristic و
 * برچسب متخصص یافته شود و ضرایب دستی جایگزین گردند — با بکاپ ضرایب و گزارش
 * قبل/بعد روی holdout.
 *
 * این ماژول «لایهٔ شواهد» است: با K-Fold تکرارشونده (پیش‌فرض ۳×۵) روی
 * نمونه‌های متخصص، MAE خروجی خام heuristic را با MAE نگاشتِ کالیبره‌شده
 * مقایسه می‌کند و گزارش قبل/بعد می‌دهد.
 *
 * آنچه آگاهانه این‌جا نیست (صادقانه): خود ضرایب مشترک (`scalp-constants.json`
 * ← heuristicConstants.ts ← python/analyze.py) را بازنویسی نمی‌کند. اعمال نهایی
 * به ضرایب، فقط وقتی تصمیم‌پذیر است که (الف) بهبود واقعی و پایدار دیده شود —
 * از جمله معیار نقشه‌راه (بهبود قابل‌اندازه‌گیری روی holdout) و (ب) حلقهٔ
 * parity عددی سه موتور (TS/Python) وجود داشته باشد. گزارش این ماژول، ورودیِ
 * همان تصمیم است و در UI فقط وقتی گیج بلوغ سبز است قابل اجراست.
 */

import type { TrainingSample } from '../db';
import type { ScalpHeuristicScores, ScalpRawMetrics } from './scalpFeatures';
import { heuristicScoresFromMetrics } from './scalpFeatures';

export const SCORE_KEYS_FOR_CALIBRATION: (keyof ScalpHeuristicScores)[] = [
  'oiliness', 'dryness', 'dandruff', 'redness', 'densityScore',
  'shine', 'patchiness', 'pigmentation', 'hairThickness',
];

// =============== برازش isotonic (PAVA) ===============

export interface IsotonicCurve {
  /** نقاط شکست صعودی به‌ترتیب x */
  xs: number[];
  ys: number[];
}

/** groupPoints: میانگین وزن‌دارِ y برای xهای تکراری + مرتب‌سازی صعودی بر اساس x */
function groupPoints(x: number[], y: number[]): { gx: number[]; gy: number[] } {
  const pairs = x.map((v, i) => ({ x: v, y: y[i] })).sort((a, b) => a.x - b.x);
  const gx: number[] = [];
  const gy: number[] = [];
  const counts: number[] = [];
  for (const p of pairs) {
    const last = gx.length - 1;
    if (last >= 0 && gx[last] === p.x) {
      // میانگین برخط با وزن درست (مهم وقتی یک x سه بار یا بیشتر تکرار شود)
      counts[last] += 1;
      gy[last] += (p.y - gy[last]) / counts[last];
    } else {
      gx.push(p.x);
      gy.push(p.y);
      counts.push(1);
    }
  }
  return { gx, gy };
}

/** Pool Adjacent Violators — خروجی منحنی صعودیِ کم‌مربع‌ترین */
export function fitIsotonic(x: number[], y: number[]): IsotonicCurve {
  const { gx, gy } = groupPoints(x, y);
  // بلوک‌ها: [start, end] با sum و count
  const blockStart: number[] = [];
  const blockEnd: number[] = [];
  const blockSum: number[] = [];
  const blockCount: number[] = [];
  const blockXSum: number[] = [];

  for (let i = 0; i < gx.length; i++) {
    blockStart.push(i);
    blockEnd.push(i);
    blockSum.push(gy[i]);
    blockCount.push(1);
    blockXSum.push(gx[i]);
    // ادغام بلوک‌های متخلف
    while (blockSum.length >= 2) {
      const b = blockSum.length - 1;
      const meanPrev = blockSum[b - 1] / blockCount[b - 1];
      const meanCur = blockSum[b] / blockCount[b];
      if (meanPrev <= meanCur) break;
      blockEnd[b - 1] = blockEnd[b];
      blockSum[b - 1] += blockSum[b];
      blockCount[b - 1] += blockCount[b];
      blockXSum[b - 1] += blockXSum[b];
      blockStart.pop(); blockEnd.pop(); blockSum.pop(); blockCount.pop(); blockXSum.pop();
    }
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (let b = 0; b < blockSum.length; b++) {
    xs.push(blockXSum[b] / blockCount[b]);
    ys.push(blockSum[b] / blockCount[b]);
  }
  return { xs, ys };
}

export function evalIsotonic(curve: IsotonicCurve, x: number): number {
  const { xs, ys } = curve;
  if (xs.length === 0) return 0;
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  // درون‌یابی خطی بین نقاط شکست
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

// =============== برازش خطی دو‌پارامتری ===============

export interface LinearMapping { a: number; b: number }

export function fitLinear(x: number[], y: number[]): LinearMapping {
  const n = Math.min(x.length, y.length);
  if (n === 0) return { a: 1, b: 0 };
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i];
  }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-12) {
    // x ثابت → فقط جابه‌جایی به میانگین
    return { a: 0, b: sy / n };
  }
  const a = (n * sxy - sx * sy) / denom;
  const b = (sy - a * sx) / n;
  return { a, b };
}

export function evalLinear(m: LinearMapping, x: number): number {
  return m.a * x + m.b;
}

// =============== گزارش K-Fold قبل/بعد ===============

export interface PerScoreCalibrationResult {
  key: keyof ScalpHeuristicScores;
  pairs: number;
  maeBefore: number;
  maeAfterIsotonic: number;
  maeAfterLinear: number;
  /** بهترین روش روی holdoutها — در صورت برابر، خطی (پارسونی) */
  chosen: 'isotonic' | 'linear';
  maeAfterChosen: number;
  deltaMae: number;
}

export interface HeuristicCalibrationReport {
  /** نمونه‌های متخصص واجد (دارای features و label) که استفاده شدند */
  expertSampleCount: number;
  folds: number;
  runs: number;
  /** آیا حد نصاب نقشه‌راه (۱۵۰ نمونه) رد شده؟ */
  maturityReady: boolean;
  targetSamples: number;
  overallMaeBefore: number;
  overallMaeAfter: number;
  overallDeltaMae: number;
  perScore: PerScoreCalibrationResult[];
  /**
   * توضیح فارسی برای UI — همیشه صادقانه می‌گوید این گزارش «شواهد» است
   * نه اعمال خودکار روی ضرایب مشترک.
   */
  note: string;
}

export interface CalibrationSampleInput {
  features: ScalpRawMetrics;
  label: Partial<Record<keyof ScalpHeuristicScores, number>>;
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * ساخت گزارش قبل/بعد. predictor تزریقی است تا: (الف) تست‌ها با heuristic مصنوعی
 * رانند شوند (بدون وابستگی به فرمول واقعی)، (ب) تولید به موتور واقعی وصل شود.
 */
export function buildHeuristicCalibrationReport(options: {
  samples: CalibrationSampleInput[];
  predictor?: (features: ScalpRawMetrics) => ScalpHeuristicScores;
  runs?: number;
  folds?: number;
  targetSamples?: number;
  seed?: number;
}): HeuristicCalibrationReport {
  const predictor = options.predictor ?? heuristicScoresFromMetrics;
  const runs = options.runs ?? 3;
  const targetSamples = options.targetSamples ?? 150;
  const seed = options.seed ?? 42;

  // جفت‌های (خروجی heuristic, برچسب متخصص) به تفکیک هر امتیاز
  const usable = options.samples.filter(
    (s) => s && s.features && s.label,
  );
  const expertSampleCount = usable.length;
  const folds = Math.max(2, Math.min(options.folds ?? 5, Math.max(2, usable.length)));

  // فقط امتیازهایی که حداقل یک جفت دارند
  const perKeyPairs = new Map<keyof ScalpHeuristicScores, { x: number; y: number }[]>();
  for (const key of SCORE_KEYS_FOR_CALIBRATION) perKeyPairs.set(key, []);
  for (const s of usable) {
    const scores = predictor(s.features);
    for (const key of SCORE_KEYS_FOR_CALIBRATION) {
      const y = s.label[key];
      const x = scores[key];
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
        perKeyPairs.get(key)!.push({ x, y });
      }
    }
  }

  const clampScore = (v: number) => Math.max(0, Math.min(100, v));
  const perScore: PerScoreCalibrationResult[] = [];
  let sumBefore = 0;
  let sumAfter = 0;

  for (const key of SCORE_KEYS_FOR_CALIBRATION) {
    const pairs = perKeyPairs.get(key)!;
    if (pairs.length < folds * 2) continue; // برای split معتبر کافی نیست

    let errBefore = 0;
    let errIso = 0;
    let errLin = 0;
    let evalCount = 0;

    for (let run = 0; run < runs; run++) {
      const shuffled = seededShuffle(pairs, seed + run * 1000);
      const foldSize = Math.floor(shuffled.length / folds);
      for (let f = 0; f < folds; f++) {
        const start = f * foldSize;
        const end = f === folds - 1 ? shuffled.length : start + foldSize;
        const holdSet = shuffled.slice(start, end);
        const trainSet = shuffled.slice(0, start).concat(shuffled.slice(end));
        if (!holdSet.length || !trainSet.length) continue;
        const iso = fitIsotonic(trainSet.map(p => p.x), trainSet.map(p => p.y));
        const lin = fitLinear(trainSet.map(p => p.x), trainSet.map(p => p.y));
        for (const p of holdSet) {
          errBefore += Math.abs(p.x - p.y);
          errIso += Math.abs(clampScore(evalIsotonic(iso, p.x)) - p.y);
          errLin += Math.abs(clampScore(evalLinear(lin, p.x)) - p.y);
          evalCount += 1;
        }
      }
    }

    const maeBefore = evalCount ? errBefore / evalCount : Infinity;
    const maeAfterIsotonic = evalCount ? errIso / evalCount : Infinity;
    const maeAfterLinear = evalCount ? errLin / evalCount : Infinity;
    const chosen: 'isotonic' | 'linear' = maeAfterIsotonic < maeAfterLinear - 1e-9 ? 'isotonic' : 'linear';
    const maeAfterChosen = chosen === 'isotonic' ? maeAfterIsotonic : maeAfterLinear;

    perScore.push({
      key,
      pairs: pairs.length,
      maeBefore,
      maeAfterIsotonic,
      maeAfterLinear,
      chosen,
      maeAfterChosen,
      deltaMae: maeBefore - maeAfterChosen,
    });
    sumBefore += maeBefore;
    sumAfter += maeAfterChosen;
  }

  const scoreCount = perScore.length;
  const overallMaeBefore = scoreCount ? sumBefore / scoreCount : 0;
  const overallMaeAfter = scoreCount ? sumAfter / scoreCount : 0;
  const maturityReady = expertSampleCount >= targetSamples;

  return {
    expertSampleCount,
    folds,
    runs,
    maturityReady,
    targetSamples,
    overallMaeBefore,
    overallMaeAfter,
    overallDeltaMae: overallMaeBefore - overallMaeAfter,
    perScore,
    note: maturityReady
      ? 'این گزارش بهبود بالقوهٔ کالیبراسیون را با K-Fold تکرارشونده نشان می‌دهد. اعمال نهایی به ضرایب مشترک سه موتور فقط با حلقهٔ parity عددی و رضایت مالک انجام می‌شود.'
      : `نمونهٔ متخصص کافی نیست (${expertSampleCount} < ${targetSamples})؛ این گزارش فقط پیش‌نمایش است و مبنای هیچ تغییری قرار نمی‌گیرد.`,
  };
}

/** ورودی‌سازی از نمونه‌های آموزشی واقعی: فقط متخصص + دادهٔ کاربردی */
export function samplesToCalibrationInput(samples: TrainingSample[]): CalibrationSampleInput[] {
  return samples
    .filter((s) => s.labelSource === 'expert' && s.features && s.label)
    .map((s) => ({ features: s.features, label: s.label as Partial<Record<keyof ScalpHeuristicScores, number>> }));
}
