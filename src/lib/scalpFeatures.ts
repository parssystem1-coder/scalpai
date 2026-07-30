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
  COLOR_NORMALIZATION,
  IMAGE_QUALITY_THRESHOLDS,
} from './heuristicConstants';
import { overlayLesionBoxes, findHotspotSquares } from './lesionVisualization';

// نسخهٔ فرمول استخراج فیچر — هر بار که فرمول یا تعداد/ترتیب فیچرها عوض شد،
// این را افزایش بده. مدل‌های آموزش‌دیده با نسخهٔ قدیمی باید دوباره آموزش ببینند.
// v3: خروجی مدل شامل برچسب‌های تشخیص کلینیکی (observations) هم شد.
// v3.2 (فاز ۱): قبل از استخراج فیچر یک نرمال‌سازی نور/رنگ (gray-world white
// balance + تعدیل نوردهی سراسری) و یک شبکهٔ تطبیقی (بر اساس نسبت ابعاد
// تصویر به‌جای شبکهٔ ثابت مربعی) اضافه شد. چون توزیع مقادیر فیچرهای خام
// واقعاً تغییر کرده (نه فقط برچسب نسخه)، این نسخه عمداً در LEGACY_FEATURE_VERSIONS
// قرار نمی‌گیرد — نمونه‌های آموزشی قدیمی باید دوباره تحلیل/برچسب‌گذاری شوند.
//
// v4.2 (موج ۱ / W1-4) — ترمیم انضباط نسخه برای سگمنتیشن Otsu:
// فاز ۲ (Otsu + ماسک پوست سر) توزیع فیچرها را واقعاً عوض کرد (rednessRatio،
// whiteFlakeRatio و hairCoverageRatio حالا maskدار و آستانه به‌جای ثابت ۶۰
// پویا از Otsu می‌آید) ولی نسخه بامپ نشد؛ در نتیجه نمونه‌های پیش‌‌از-Otsu و
// پس‌از-Otsu با برچسب یکسان v3.2 مخلوط شدند. این بامپ عقب‌افتاده آن جداسازی
// خاموش را می‌بندد. نمونه‌های v3.2 به‌صورت خودکار غیرواجد می‌شوند و با
// مکانیزم بازمحاسبهٔ فیچر (`featureRecompute.ts`) از تصویر خام به v4.2
// ارتقا می‌یابند — بدون سوزاندن برچسب‌های متخصص.
// نسخه با `FEATURE_VERSION_WITH_QUESTIONNAIRE` هم‌قدم بامپ شد چون بردار
// پرسشنامه‌دار همان بردار تصویری را هم شامل می‌شود.
export const FEATURE_VERSION = 'v4.2-otsu-scalp-mask';
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

/**
 * فاز ۱ — ارزیابی کیفیت تصویر ورودی، محاسبه‌شده روی پیکسل‌های خام (قبل از
 * نرمال‌سازی رنگ). هدف: هشدار به کاربر وقتی عکس آن‌قدر تار/کم‌نور/پرنور یا
 * کم‌کنتراست است که نتیجهٔ تحلیل عملاً بی‌معنی می‌شود — بدون مسدودکردن
 * کامل تحلیل (تصمیم نهایی با کاربر است).
 */
export interface ImageQualityAssessment {
  /** واریانس لاپلاسین سادهٔ گرادیان — پایین یعنی تصویر تار است */
  blurVariance: number;
  /** میانگین روشنایی خام (۰-۲۵۵) قبل از نرمال‌سازی */
  meanBrightness: number;
  /** انحراف‌معیار روشنایی خام — پایین یعنی تصویر کم‌کنتراست/صاف است */
  brightnessStd: number;
  isBlurry: boolean;
  isTooDark: boolean;
  isTooBright: boolean;
  isLowContrast: boolean;
  /** هر مشکلی که واقعاً شناسایی شده باشد */
  hasIssue: boolean;
}

export function assessImageQuality(data: Uint8ClampedArray, width: number, height: number): ImageQualityAssessment {
  const q = IMAGE_QUALITY_THRESHOLDS;

  // خاکستری‌سازی کامل تصویر (نه نمونه‌برداری‌شده) — ابعاد بعد از resize در
  // extractImageFeatures حداکثر ۶۴۰ پیکسل است، پس این یک پیمایش کامل ارزان
  // (کمتر از نیم‌میلیون پیکسل) است و دقت بیشتری نسبت به نمونه‌برداری می‌دهد.
  const gray = new Float64Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const idx = p * 4;
    gray[p] = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
  }

  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
    sumSq += gray[i] * gray[i];
  }
  const n = gray.length || 1;
  const meanBrightness = sum / n;
  const brightnessStd = Math.sqrt(Math.max(0, sumSq / n - meanBrightness * meanBrightness));

  // لاپلاسین گسسته با هستهٔ ۴-همسایه (همان هستهٔ پیش‌فرض ksize=1 در
  // cv2.Laplacian که python/analyze.py استفاده می‌کند) — معیار کلاسیک
  // «واریانس لاپلاسین» برای تشخیص تاری تصویر.
  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += lap;
      lapSumSq += lap * lap;
      lapCount++;
    }
  }
  const lapN = lapCount || 1;
  const lapMean = lapSum / lapN;
  const blurVariance = Math.max(0, lapSumSq / lapN - lapMean * lapMean);

  const isBlurry = blurVariance < q.blurVarianceMin;
  const isTooDark = meanBrightness < q.exposureDarkMean;
  const isTooBright = meanBrightness > q.exposureBrightMean;
  const isLowContrast = brightnessStd < q.lowContrastStdMin;

  return {
    blurVariance,
    meanBrightness,
    brightnessStd,
    isBlurry,
    isTooDark,
    isTooBright,
    isLowContrast,
    hasIssue: isBlurry || isTooDark || isTooBright || isLowContrast,
  };

}


/**
 * نرمال‌سازی نور/رنگ سادهٔ gray-world: هر کانال رنگی طوری مقیاس می‌شود که
 * میانگینش به میانگین کلی نزدیک شود (کاهش انحراف تعادل سفیدی/دمای رنگ)، و
 * سپس یک تعدیل نوردهی سراسری اعمال می‌شود تا میانگین روشنایی به یک مقدار
 * هدف ثابت نزدیک شود (کاهش حساسیت به فلاش/نور محیط تاریک یا روشن).
 * این تابع یک بافر RGBA *جدید* برمی‌گرداند — ورودی دست‌نخورده می‌ماند (canvas
 * اصلی برای رسم overlay بدون تغییر لازم است).
 *
 * هشدار مهاجرت: این فرمول باید دقیقاً با تابع معادل در python/analyze.py
 * هم‌تراز بماند (بازتولید دستی، مثل بقیهٔ فرمول‌های این فایل).
 */
export function applyColorNormalization(data: Uint8ClampedArray): Uint8ClampedArray {
  const c = COLOR_NORMALIZATION;
  let sumR = 0, sumG = 0, sumB = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
  }
  const meanR = sumR / pixelCount || 1;
  const meanG = sumG / pixelCount || 1;
  const meanB = sumB / pixelCount || 1;
  const grayMean = (meanR + meanG + meanB) / 3 || 1;

  const clampGain = (g: number) => Math.max(c.whiteBalanceGainMin, Math.min(c.whiteBalanceGainMax, g));
  const gainR = clampGain(grayMean / meanR);
  const gainG = clampGain(grayMean / meanG);
  const gainB = clampGain(grayMean / meanB);

  // تعدیل نوردهی سراسری: بعد از white-balance، میانگین خاکستری را به سمت
  // یک روشنایی هدف ثابت می‌کشد — نه کاملاً برابر (برای جلوگیری از تقویت
  // نویز روی عکس‌های خیلی تاریک)، بلکه با یک بهرهٔ محدود.
  const exposureGain = Math.max(
    c.exposureGainMin,
    Math.min(c.exposureGainMax, c.targetGrayBrightness / grayMean),
  );

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = data[i] * gainR * exposureGain;
    out[i + 1] = data[i + 1] * gainG * exposureGain;
    out[i + 2] = data[i + 2] * gainB * exposureGain;
    out[i + 3] = data[i + 3];
  }
  return out;
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

/**
 * اندازهٔ شبکهٔ تطبیقی برای شاخص‌های ناحیه‌ای (patchiness/pigmentation).
 * به‌جای شبکهٔ ثابت مربعی GRID_SIZE×GRID_SIZE، تعداد ستون/ردیف را متناسب با
 * نسبت ابعاد واقعی تصویر تنظیم می‌کند تا خانه‌های شبکه روی عکس‌های خیلی
 * کشیده (پرتره/وایدشات) هم تقریباً مربعی و معنادار بمانند. مساحت کل شبکه
 * (تعداد خانه‌ها) نزدیک GRID_SIZE×GRID_SIZE نگه داشته می‌شود تا مقیاس
 * آماری (انحراف‌معیار) با نسخهٔ قبلی/Python قابل مقایسه بماند.
 */
export function computeAdaptiveGridDims(width: number, height: number): { cols: number; rows: number } {
  const targetCells = GRID_SIZE * GRID_SIZE;
  const aspect = width > 0 && height > 0 ? width / height : 1;
  let cols = Math.max(2, Math.round(Math.sqrt(targetCells * aspect)));
  const rows = Math.max(2, Math.round(targetCells / cols));
  // اصلاح رفت‌وبرگشتی برای نزدیک ماندن ضرب نهایی به targetCells
  cols = Math.max(2, Math.round(targetCells / rows));
  return { cols, rows };
}


function otsuThreshold(histogram: number[], totalPixels: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * histogram[t];
  }

  let sumB = 0;
  let wB = 0;
  let wF = 0;

  let varMax = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varBetween = wB * wF * Math.pow(mB - mF, 2);

    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  return threshold;
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

  const histogram = new Array(256).fill(0);
  let pixelCount = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = Math.floor((r + g + b) / 3);
    histogram[brightness]++;
    pixelCount++;
  }
  const otsuThr = otsuThreshold(histogram, pixelCount);
  const hairThreshold = Math.max(50, Math.min(110, otsuThr));

  const { cols: gridCols, rows: gridRows } = computeAdaptiveGridDims(width, height);
  const cellCount = gridCols * gridRows;
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
    const isDark = brightness < hairThreshold;
    if (isDark) darkPixels++;

    const isScalp = !isDark;

    const isWhiteFlake = isScalp && brightness > 200 && r > 180 && g > 180 && b > 180;
    if (isWhiteFlake) whiteFlakes++;

    const isRed = isScalp && r > g + 25 && r > b + 25 && r > 100;
    if (isRed) redPixels++;

    const maxChannelDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (isScalp && brightness > 245 && maxChannelDiff < 12) shinePixels++;

    const localIdx = Math.min(i + 4 * step, data.length - 4);
    const dr = r - data[localIdx];
    const dg = g - data[localIdx + 1];
    const db = b - data[localIdx + 2];
    const gradMagnitude = Math.sqrt(dr * dr + dg * dg + db * db);
    varianceSum += gradMagnitude;
    if (gradMagnitude > 30) edgePixels++;

    const pixelIndex = i / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    if (y < height) {
      const cellX = Math.min(gridCols - 1, Math.floor((x / width) * gridCols));
      const cellY = Math.min(gridRows - 1, Math.floor((y / height) * gridRows));
      const cellIdx = cellY * gridCols + cellX;
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
  /** ارزیابی کیفیت تصویر خام (قبل از نرمال‌سازی رنگ) — برای هشدار در UI */
  imageQuality: ImageQualityAssessment;
}

/**
 * تصویر را از URL/DataURL بارگذاری، به سایز استاندارد ۶۴۰ می‌رساند، کیفیت
 * ورودی را روی پیکسل خام می‌سنجد، سپس یک نسخهٔ نرمال‌شدهٔ نور/رنگ برای
 * استخراج فیچر می‌سازد (canvas اصلی/نمایشی دست‌نخورده می‌ماند تا overlay و
 * نمایش به کاربر رنگ واقعی عکس را نشان دهد).
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
  const imageQuality = assessImageQuality(imageData.data, width, height);
  const normalizedData = applyColorNormalization(imageData.data);
  const metrics = computeRawMetrics(normalizedData, width, height);

  return { metrics, width, height, canvas, imageQuality };
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
  /** فاز ۱ — ارزیابی کیفیت تصویر ورودی خام (تار/نور/کنتراست)، برای هشدار در UI */
  imageQuality?: ImageQualityAssessment;
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
  const { metrics, width, height, canvas, imageQuality } = extracted;

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
    imageQuality,
  };
}

