/**
 * scalpFeatures.ts
 * -----------------------------------------------------------------------
 * منبع واحد استخراج فیچر از تصویر پوست سر — هم مسیر «تحلیل آفلاین» (موتور
 * مرورگر) و هم هوک ذخیره‌سازی نمونهٔ آموزشی در «تحلیل آنلاین» (AIAnalysis)
 * دقیقاً از همین ماژول استفاده می‌کنند. این یعنی فیچرهایی که برای مدل محلی
 * ذخیره می‌شوند، همیشه با همان فرمولی محاسبه شده‌اند که تحلیل آفلاین برای
 * نمایش استفاده می‌کند — بدون افتادن در دام دو پیاده‌سازی ناهماهنگ.
 *
 * نکته: مسیر Python (python/analyze.py) به‌عنوان یک موتور جایگزین (fallback)
 * برای دسکتاپ نگه داشته شده، اما فرمول‌هایش عمداً همیشه با این فایل هم‌تراز
 * نگه داشته می‌شود (دستی، چون دو زبان جدا نمی‌توانند واقعاً کد را share کنند)
 * تا کاربر دسکتاپ صرف‌نظر از این‌که کدام موتور اجرا شود، همان مجموعهٔ کامل
 * شاخص‌ها را ببیند — دقیقاً مثل نسخهٔ مرورگر/وب.
 */

import { resolveObservations, type ObservationId } from './diagnosisCatalog';
import {
  GRID_SIZE,
  HEURISTIC_FEATURE_SCALE,
  HEURISTIC_METRIC_RECOMMEND,
  HEURISTIC_SCORE_RECOMMEND,
} from './heuristicConstants';
import { overlayLesionBoxes, findHotspotSquares } from './lesionVisualization';

// نسخهٔ فرمول استخراج فیچر — هر بار که فرمول یا تعداد/ترتیب فیچرها عوض شد،
// این را افزایش بده. مدل‌های آموزش‌دیده با نسخهٔ قدیمی باید دوباره آموزش ببینند.
// v3: خروجی مدل شامل برچسب‌های تشخیص کلینیکی (observations) هم شد.
export const FEATURE_VERSION = 'v3.1-observation-catalog';
export const LEGACY_FEATURE_VERSIONS = ['v3'] as const;

// GRID_SIZE از shared/scalp-constants.json می‌آید (مشترک با python/analyze.py)

export interface ScalpRawMetrics {
  brightness: number;
  whiteFlakeRatio: number;
  rednessRatio: number;
  hairCoverageRatio: number;
  textureVariance: number;
  avgR: number;
  avgG: number;
  avgB: number;
  // ----- شاخص‌های تخصصی‌تر (تقریبی، مبتنی بر پیکسل — نه تشخیص بالینی) -----
  shineRatio: number;        // براقی/انعکاس نور (پروکسی چربی سطحی/سبوره)
  edgeDensity: number;       // چگالی لبه‌ها (پروکسی ریزی/ضخامت نسبی تار مو)
  patchinessRaw: number;     // پراکندگی پوشش مو بین نواحی تصویر (لکه‌ای بودن ریزش)
  pigmentationRaw: number;   // ناهمگونی رنگ/روشنایی بین نواحی تصویر (بی‌رنگی موضعی)
}

// ترتیب ثابت فیچرها برای تبدیل به بردار عددی (ورودی مدل)
export const FEATURE_KEYS: (keyof ScalpRawMetrics)[] = [
  'brightness',
  'whiteFlakeRatio',
  'rednessRatio',
  'hairCoverageRatio',
  'textureVariance',
  'avgR',
  'avgG',
  'avgB',
  'shineRatio',
  'edgeDensity',
  'patchinessRaw',
  'pigmentationRaw',
];

// مقیاس تقریبی هر فیچر برای نرمال‌سازی ورودی مدل (تخمینی، نه دقیق — فقط
// برای اینکه هیچ فیچری روی مقیاس بقیه غالب نشود)
const FEATURE_SCALE: Record<keyof ScalpRawMetrics, number> = {
  brightness: 255,
  whiteFlakeRatio: 1,
  rednessRatio: 1,
  hairCoverageRatio: 1,
  textureVariance: 200,
  avgR: 255,
  avgG: 255,
  avgB: 255,
  shineRatio: 1,
  edgeDensity: 1,
  patchinessRaw: 0.5,
  pigmentationRaw: 80,
};

export interface ScalpHeuristicScores {
  oiliness: number;
  dryness: number;
  dandruff: number;
  redness: number;
  densityScore: number;
  // شاخص‌های تخصصی جدید (۰ تا ۱۰۰)
  shine: number;          // براقی/سبوره سطحی
  patchiness: number;     // لکه‌ای بودن ریزش (شاخص هشدار الگوی نامنظم)
  pigmentation: number;   // ناهمگونی رنگدانه/بی‌رنگی موضعی
  hairThickness: number;  // ضخامت نسبی تار مو (تخمینی — عدد بالاتر یعنی تارهای درشت‌تر)
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function computeRawMetrics(data: Uint8ClampedArray, width: number, height: number): ScalpRawMetrics {
  let totalR = 0, totalG = 0, totalB = 0;
  let whiteFlakes = 0;
  let redPixels = 0;
  let darkPixels = 0;
  let shinePixels = 0;
  let edgePixels = 0;
  let varianceSum = 0;

  const step = 4;
  const sampleCount = Math.floor(data.length / (4 * step));

  const cellCount = GRID_SIZE * GRID_SIZE;
  const cellHairCount = new Array(cellCount).fill(0);
  const cellPixelCount = new Array(cellCount).fill(0);
  const cellBrightnessSum = new Array(cellCount).fill(0);

  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalR += r;
    totalG += g;
    totalB += b;

    const brightness = (r + g + b) / 3;
    const isWhiteFlake = brightness > 200 && r > 180 && g > 180 && b > 180;
    if (isWhiteFlake) whiteFlakes++;
    if (r > g + 25 && r > b + 25 && r > 100) redPixels++;
    const isDark = brightness < 60;
    if (isDark) darkPixels++;

    // براقی/سبوره: نقاط خیلی روشن و تقریباً بی‌رنگ (بازتاب نور)، آستانه‌ای
    // بالاتر از شوره تا با پوسته‌های مات (whiteFlake) اشتباه نشود
    const maxChannelDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (brightness > 245 && maxChannelDiff < 12) shinePixels++;

    const localIdx = Math.min(i + 4 * step, data.length - 4);
    const dr = r - data[localIdx];
    const dg = g - data[localIdx + 1];
    const db = b - data[localIdx + 2];
    const gradMagnitude = Math.sqrt(dr * dr + dg * dg + db * db);
    varianceSum += gradMagnitude;
    if (gradMagnitude > 30) edgePixels++;

    // موقعیت پیکسل برای تخصیص به خانهٔ شبکه (لکه‌ای بودن/ناهمگونی رنگدانه)
    const pixelIndex = i / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (y < height) {
      const cellX = Math.min(GRID_SIZE - 1, Math.floor((x / width) * GRID_SIZE));
      const cellY = Math.min(GRID_SIZE - 1, Math.floor((y / height) * GRID_SIZE));
      const cellIdx = cellY * GRID_SIZE + cellX;
      cellPixelCount[cellIdx]++;
      cellBrightnessSum[cellIdx] += brightness;
      if (isDark) cellHairCount[cellIdx]++;
    }
  }

  const count = sampleCount || 1;
  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;

  // انحراف‌معیار پوشش مو و روشنایی بین خانه‌های شبکه — شاخص لکه‌ای بودن و
  // ناهمگونی رنگدانه
  const cellCoverages: number[] = [];
  const cellBrightnesses: number[] = [];
  for (let c = 0; c < cellCount; c++) {
    if (cellPixelCount[c] > 0) {
      cellCoverages.push(cellHairCount[c] / cellPixelCount[c]);
      cellBrightnesses.push(cellBrightnessSum[c] / cellPixelCount[c]);
    }
  }
  const stdev = (arr: number[]): number => {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  };

  return {
    brightness: (avgR + avgG + avgB) / 3,
    whiteFlakeRatio: whiteFlakes / count,
    rednessRatio: redPixels / count,
    hairCoverageRatio: darkPixels / count,
    textureVariance: varianceSum / count,
    avgR,
    avgG,
    avgB,
    shineRatio: shinePixels / count,
    edgeDensity: edgePixels / count,
    patchinessRaw: stdev(cellCoverages),
    pigmentationRaw: stdev(cellBrightnesses),
  };
}

export interface ExtractedImageFeatures {
  metrics: ScalpRawMetrics;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

/**
 * تصویر را از URL/DataURL بارگذاری، به سایز استاندارد ۶۴۰ می‌رساند و فیچرهای
 * خام پیکسلی را استخراج می‌کند. canvas خروجی برای رسم overlay در فراخوان
 * نگه داشته می‌شود تا محاسبات دوباره تکرار نشود.
 */
export async function extractImageFeatures(imageUrl: string): Promise<ExtractedImageFeatures> {
  const img = await loadImage(imageUrl);
  const maxSize = 640;
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas not available');

  ctx.drawImage(img, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const metrics = computeRawMetrics(imageData.data, width, height);

  return { metrics, width, height, canvas };
}

/** تبدیل فیچرهای خام به بردار عددی نرمال‌شده (ورودی مدل محلی) */
export function featureVectorToArray(metrics: ScalpRawMetrics): number[] {
  return FEATURE_KEYS.map((key) => {
    const value = metrics[key];
    if (typeof value !== 'number' || Number.isNaN(value)) return 0; // نمونه‌های قدیمی‌تر ممکن است این فیلد را نداشته باشند
    const scale = FEATURE_SCALE[key];
    return scale ? Math.max(0, Math.min(1, value / scale)) : value;
  });
}

function clampScore(v: number): number {
  return Math.min(100, Math.max(0, Math.round(v)));
}

/** امتیازهای heuristic (قانون‌محور) — همان فرمول‌هایی که در python/analyze.py هم پیاده‌سازی شده‌اند */
export function heuristicScoresFromMetrics(metrics: ScalpRawMetrics): ScalpHeuristicScores {
  const s = HEURISTIC_FEATURE_SCALE;
  const dandruff = clampScore(metrics.whiteFlakeRatio * s.dandruffFromWhiteFlake);
  const redness = clampScore(metrics.rednessRatio * s.rednessFromRatio);
  const oiliness = clampScore((metrics.textureVariance / s.oilinessTextureDivisor) * 100);
  const dryness = clampScore((s.drynessBrightnessBase - metrics.brightness) / s.drynessBrightnessDivisor);
  const densityScore = clampScore(metrics.hairCoverageRatio * s.densityFromCoverage);

  const shine = clampScore(metrics.shineRatio * s.shineFromRatio);
  const patchiness = clampScore(metrics.patchinessRaw * s.patchinessFromRaw);
  const pigmentation = clampScore(metrics.pigmentationRaw * s.pigmentationFromRaw);
  // چگالی لبهٔ کمتر نسبت به میزان پوشش مو یعنی تار درشت‌تر (کمتر خرد شده در
  // نمونه‌گیری پیکسلی) — این یک تخمین غیرمستقیم است، نه اندازه‌گیری دقیق قطر مو
  const hairArea = Math.max(metrics.hairCoverageRatio, s.minHairArea);
  const edgeToHairRatio = metrics.edgeDensity / hairArea;
  const hairThickness = clampScore(100 - edgeToHairRatio * s.hairThicknessEdgeFactor);

  return { oiliness, dryness, dandruff, redness, densityScore, shine, patchiness, pigmentation, hairThickness };
}

export function buildRecommendations(metrics: ScalpRawMetrics, isRtl: boolean): string[] {
  const t = HEURISTIC_METRIC_RECOMMEND;
  const recs: string[] = [];
  if (metrics.whiteFlakeRatio > t.whiteFlakeDandruff) {
    recs.push(isRtl ? 'احتمال شوره: شامپوی ضدشوره و شستشوی منظم توصیه می‌شود' : 'Possible dandruff: anti-dandruff shampoo recommended');
  }
  if (metrics.rednessRatio > t.rednessRatio) {
    recs.push(isRtl ? 'قرمزی پوست سر: از محصولات ملایم و بدون الکل استفاده کنید' : 'Scalp redness: use gentle alcohol-free products');
  }
  if (metrics.textureVariance > t.textureOiliness && metrics.brightness < t.brightnessDark) {
    recs.push(isRtl ? 'چربی احتمالی: شستشوی منظم و محصولات متعادل‌کننده چربی' : 'Possible oiliness: regular washing and oil-balancing products');
  }
  if (metrics.brightness > t.brightnessSparse && metrics.hairCoverageRatio < t.hairCoverageSparse) {
    recs.push(isRtl ? 'تراکم مو پایین: مشاوره تخصصی برای ارزیابی ریزش مو' : 'Low hair density: specialist consultation recommended');
  }
  if (metrics.shineRatio > t.shineHigh) {
    recs.push(isRtl ? 'براقی/چربی سطحی بالا: احتمال ترشح بیش‌ازحد سبوم — شامپوی کنترل‌چربی' : 'High surface shine: possible excess sebum — oil-control shampoo recommended');
  }
  if (metrics.patchinessRaw > t.patchinessIrregular) {
    recs.push(isRtl ? 'پراکندگی نامنظم پوشش مو مشاهده شد: بررسی احتمال ریزش موضعی (لکه‌ای) توسط متخصص' : 'Irregular hair coverage detected: specialist review for possible patchy hair loss recommended');
  }
  if (metrics.pigmentationRaw > t.pigmentationUneven) {
    recs.push(isRtl ? 'ناهمگونی رنگ پوست سر بین نواحی مختلف: بررسی از نظر بی‌رنگی یا التهاب موضعی' : 'Uneven scalp pigmentation across regions: check for localized discoloration or irritation');
  }
  if (recs.length === 0) {
    recs.push(isRtl ? 'وضعیت کلی قابل قبول: مراقبت روزانه و پیگیری دوره‌ای' : 'Overall acceptable: daily care and periodic follow-up');
  }
  return recs;
}

/** پیشنهادات بر اساس امتیازهای مدل/هیوریستیک (۰–۱۰۰) — برای موتور مدل اولویت دارد */
export function buildRecommendationsFromScores(scores: ScalpHeuristicScores, isRtl: boolean): string[] {
  const t = HEURISTIC_SCORE_RECOMMEND;
  const recs: string[] = [];
  if (scores.dandruff >= t.dandruff) {
    recs.push(isRtl ? 'شوره قابل‌توجه: شامپوی ضدشوره و فاصله‌گذاری شستشو را بررسی کنید' : 'Notable dandruff: consider anti-dandruff shampoo and wash cadence');
  }
  if (scores.redness >= t.redness) {
    recs.push(isRtl ? 'قرمزی پوست سر: محصولات ملایم و بدون عطر/الکل توصیه می‌شود' : 'Scalp redness: prefer gentle fragrance/alcohol-free products');
  }
  if (scores.oiliness >= t.oiliness) {
    recs.push(isRtl ? 'چربی بالا: شامپوی متعادل‌کننده چربی و شستشوی منظم' : 'High oiliness: oil-balancing shampoo and regular washing');
  }
  if (scores.dryness >= t.dryness) {
    recs.push(isRtl ? 'خشکی پوست سر: مرطوب‌کننده ملایم و پرهیز از شویندهٔ قوی' : 'Scalp dryness: gentle moisturizer and avoid harsh cleansers');
  }
  if (scores.densityScore <= t.densityLow) {
    recs.push(isRtl ? 'تراکم پایین: پیگیری تخصصی برای ارزیابی ریزش مو' : 'Low density: specialist follow-up for hair-loss assessment');
  }
  if (scores.shine >= t.shine) {
    recs.push(isRtl ? 'براقی/سبوره سطحی بالا: کنترل چربی سطحی توصیه می‌شود' : 'High surface shine/sebum: surface oil control recommended');
  }
  if (scores.patchiness >= t.patchiness) {
    recs.push(isRtl ? 'الگوی لکه‌ای: بررسی ریزش موضعی توسط متخصص' : 'Patchy pattern: specialist review for localized loss');
  }
  if (scores.pigmentation >= t.pigmentation) {
    recs.push(isRtl ? 'ناهمگونی رنگدانه: ارزیابی نواحی تغییررنگ پوست سر' : 'Pigmentation irregularity: evaluate discolored scalp regions');
  }
  if (recs.length === 0) {
    recs.push(isRtl ? 'وضعیت کلی قابل قبول: مراقبت روزانه و پیگیری دوره‌ای' : 'Overall acceptable: daily care and periodic follow-up');
  }
  return recs;
}

function densityLevelLabel(score: number, isRtl: boolean): string {
  return score > 65 ? (isRtl ? 'زیاد' : 'High') : score > 35 ? (isRtl ? 'متوسط' : 'Medium') : (isRtl ? 'کم' : 'Low');
}

function lossLevelLabel(densityScore: number, isRtl: boolean): string {
  return densityScore > 50 ? (isRtl ? 'خفیف' : 'Mild') : densityScore > 25 ? (isRtl ? 'متوسط' : 'Moderate') : (isRtl ? 'شدید' : 'Severe');
}

export interface ComposedOfflineResult {
  lesions: { type: string; confidence: number; bbox: number[] }[];
  observations: ObservationId[];
  hairDensity: { level: string; score: number };
  scalpCondition: {
    oiliness: number; dryness: number; redness: number; dandruff: number;
    shine: number; patchiness: number; pigmentation: number; hairThickness: number;
  };
  hairLoss: { level: string; pattern: string };
  recommendations: string[];
  metrics: {
    brightness: number;
    rednessRatio: number;
    whiteFlakeRatio: number;
    textureVariance: number;
    hairCoverageRatio: number;
    shineRatio: number;
    edgeDensity: number;
    patchinessRaw: number;
    pigmentationRaw: number;
  };
  chartData: { label: string; value: number }[];
  annotatedImageBase64: string;
  engine: 'browser' | 'model';
  observationsFilledFromHeuristic: boolean;
}

/**
 * از فیچرهای خام + امتیازها (چه heuristic چه خروجی مدل محلی) یک نتیجهٔ
 * کامل و قابل نمایش می‌سازد. این تابع مشترک باعث می‌شود موتور heuristic و
 * موتور مبتنی بر مدل، دقیقاً همان ساختار خروجی/نمودار/برچسب را تولید کنند.
 */
export function composeOfflineResult(
  extracted: ExtractedImageFeatures,
  scores: ScalpHeuristicScores,
  isRtl: boolean,
  engine: 'browser' | 'model',
  patternLabel?: string,
  observationsOverride?: ObservationId[],
): ComposedOfflineResult {
  const { metrics, width, height, canvas } = extracted;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  const resolvedObs = resolveObservations(observationsOverride, scores);
  const observations = resolvedObs.ids;
  const imageData = ctx.getImageData(0, 0, width, height);

  const lesions: ComposedOfflineResult['lesions'] = [];
  if (scores.dandruff > 18) {
    for (const bbox of findHotspotSquares(imageData.data, width, height, 'flake', 4)) {
      lesions.push({
        type: 'dandruff',
        confidence: scores.dandruff / 100,
        bbox: [...bbox],
      });
    }
  }
  if (scores.redness > 15) {
    for (const bbox of findHotspotSquares(imageData.data, width, height, 'red', 4)) {
      lesions.push({
        type: 'inflammation',
        confidence: scores.redness / 100,
        bbox: [...bbox],
      });
    }
  }
  if (scores.patchiness > 22) {
    for (const bbox of findHotspotSquares(imageData.data, width, height, 'darkGap', 3)) {
      lesions.push({
        type: 'alopecia',
        confidence: scores.patchiness / 100,
        bbox: [...bbox],
      });
    }
  }
  if (scores.pigmentation > 25) {
    for (const bbox of findHotspotSquares(imageData.data, width, height, 'pigment', 2)) {
      lesions.push({
        type: 'lesions',
        confidence: Math.min(1, scores.pigmentation / 100),
        bbox: [...bbox],
      });
    }
  }

  const densityLevel = densityLevelLabel(scores.densityScore, isRtl);
  const lossLevel = lossLevelLabel(scores.densityScore, isRtl);

  // رسم کادرهای مربعی روی تصویر حاشیه‌نویسی‌شده (برچسب فارسی/انگلیسی)
  overlayLesionBoxes(canvas, lesions, { lang: isRtl ? 'fa' : 'en' });

  const chartData = [
    { label: isRtl ? 'تراکم' : 'Density', value: scores.densityScore },
    { label: isRtl ? 'چربی' : 'Oiliness', value: scores.oiliness },
    { label: isRtl ? 'خشکی' : 'Dryness', value: scores.dryness },
    { label: isRtl ? 'شوره' : 'Dandruff', value: scores.dandruff },
    { label: isRtl ? 'قرمزی' : 'Redness', value: scores.redness },
    { label: isRtl ? 'براقی/سبوره' : 'Shine', value: scores.shine },
    { label: isRtl ? 'لکه‌ای بودن' : 'Patchiness', value: scores.patchiness },
    { label: isRtl ? 'ناهمگونی رنگدانه' : 'Pigmentation', value: scores.pigmentation },
    { label: isRtl ? 'ضخامت تار مو' : 'Hair thickness', value: scores.hairThickness },
  ];

  return {
    lesions,
    observations,
    hairDensity: { level: densityLevel, score: scores.densityScore },
    scalpCondition: {
      oiliness: scores.oiliness,
      dryness: scores.dryness,
      redness: scores.redness,
      dandruff: scores.dandruff,
      shine: scores.shine,
      patchiness: scores.patchiness,
      pigmentation: scores.pigmentation,
      hairThickness: scores.hairThickness,
    },
    hairLoss: {
      level: lossLevel,
      pattern: patternLabel ?? (engine === 'model'
        ? (isRtl ? 'مدل آموزش‌دیده محلی' : 'Trained local model')
        : (isRtl ? 'تحلیل محلی' : 'Local analysis')),
    },
    recommendations: engine === 'model'
      ? buildRecommendationsFromScores(scores, isRtl)
      : buildRecommendations(metrics, isRtl),
    metrics: {
      brightness: Math.round(metrics.brightness),
      rednessRatio: metrics.rednessRatio,
      whiteFlakeRatio: metrics.whiteFlakeRatio,
      textureVariance: metrics.textureVariance,
      hairCoverageRatio: metrics.hairCoverageRatio,
      shineRatio: metrics.shineRatio,
      edgeDensity: metrics.edgeDensity,
      patchinessRaw: metrics.patchinessRaw,
      pigmentationRaw: metrics.pigmentationRaw,
    },
    chartData,
    annotatedImageBase64: canvas.toDataURL('image/png'),
    engine,
    observationsFilledFromHeuristic: resolvedObs.filledFromHeuristic,
  };
}
