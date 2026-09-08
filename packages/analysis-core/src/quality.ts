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

  // M19 / `noUncheckedIndexedAccess`: every `data[i]` is typed `number |
  // undefined`. Each index below is provably in range — this loop is bounded by
  // `data.length`, and the loop further down only walks the interior of the
  // plane, whose existence the `minDimension` guard above proves. The `?? 0`
  // fallbacks are type-level guards that cannot be reached at runtime, so the
  // reported metrics are unchanged.
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
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
      // Read each neighbour once; the Laplacian and the gradient share them.
      const center = data[i] ?? 0;
      const left = data[i - 1] ?? 0;
      const right = data[i + 1] ?? 0;
      const up = data[i - width] ?? 0;
      const down = data[i + width] ?? 0;
      const lap = 4 * center - left - right - up - down;
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount++;
      const gx = right - left;
      const gy = down - up;
      if (Math.hypot(gx, gy) > 24) edgePixels++;
      gradCount++;
    }
  }
  const lapMean = lapSum / lapCount;
  const blurVariance = lapSqSum / lapCount - lapMean * lapMean;
  return { blurVariance, brightnessMean, edgePixelRatio: edgePixels / gradCount };
}
