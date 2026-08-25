import type { GrayImage } from "./gray.js";

export interface QualityMetrics {
  /** variance of the 4-neighbour Laplacian response — low = soft/blurry */
  blurVariance: number;
  /** mean luma 0..255 — too dark/too bright both fail */
  brightnessMean: number;
  /** share of pixels with meaningful gradient — flat/empty frames fail */
  edgePixelRatio: number;
}

export interface QualityVerdict {
  status: "pass" | "reject";
  metrics: QualityMetrics;
  /** Persian, user-facing reasons when rejected — empty on pass. */
  reasons: string[];
}

export const QUALITY_THRESHOLDS = {
  minBlurVariance: 35,
  minBrightness: 40,
  maxBrightness: 218,
  minEdgeRatio: 0.02,
  minDimension: 16,
} as const;

/**
 * §10.1 quality gate — pure, deterministic, local-first. Runs on the raw
 * grayscale plane so the exact same code works server-side (Node) and
 * client-side (WASM) later.
 */
export function computeQuality(img: GrayImage): QualityVerdict {
  const metrics = measureQuality(img);
  const reasons: string[] = [];
  if (metrics.blurVariance < QUALITY_THRESHOLDS.minBlurVariance) {
    reasons.push("تصویر تار است؛ لطفاً عکس را دوباره بگیرید");
  }
  if (metrics.brightnessMean < QUALITY_THRESHOLDS.minBrightness) {
    reasons.push("نور تصویر کم است؛ در محیط روشن‌تر عکس بگیرید");
  }
  if (metrics.brightnessMean > QUALITY_THRESHOLDS.maxBrightness) {
    reasons.push("تصویر بیش‌ازحد روشن/شسته شده است");
  }
  if (metrics.edgePixelRatio < QUALITY_THRESHOLDS.minEdgeRatio) {
    reasons.push("کادر خالی است؛ ناحیه موردنظر باید داخل کادر باشد");
  }
  return reasons.length === 0 ? { status: "pass", metrics, reasons } : { status: "reject", metrics, reasons };
}

export function measureQuality(img: GrayImage): QualityMetrics {
  const { data, width, height } = img;
  if (width < QUALITY_THRESHOLDS.minDimension || height < QUALITY_THRESHOLDS.minDimension) {
    throw new Error("image too small for quality analysis");
  }

  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const brightnessMean = sum / data.length;

  // Laplacian (4-neighbourhood) over the interior; variance of response.
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  // Sobel-ish gradient magnitude for edge ratio (interior only).
  let edgePixels = 0;
  let gradCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * data[i] - data[i - 1] - data[i + 1] - data[i - width] - data[i + width];
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
      const gx = data[i + 1] - data[i - 1];
      const gy = data[i + width] - data[i - width];
      if (Math.hypot(gx, gy) > 24) edgePixels++;
      gradCount++;
    }
  }
  const lapMean = lapSum / lapCount;
  const blurVariance = lapSqSum / lapCount - lapMean * lapMean;
  return { blurVariance, brightnessMean, edgePixelRatio: edgePixels / gradCount };
}
