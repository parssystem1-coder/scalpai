import { describe, it, expect } from 'vitest';
import { heuristicScoresFromMetrics, type ScalpRawMetrics } from './scalpFeatures';
import { HEURISTIC_FEATURE_SCALE, GRID_SIZE } from './heuristicConstants';
import sharedConstants from '@shared/scalp-constants.json';

/**
 * برابری موتور مرورگر (TypeScript) و موتور Python.
 *
 * چرا مهم است: انتخاب موتور خودکار و بی‌صداست — اگر پایتون نصب باشد از آن
 * استفاده می‌شود، وگرنه fallback به مرورگر. اگر فرمول‌ها از هم فاصله بگیرند،
 * همان تصویر روی دو دستگاه دو نتیجهٔ متفاوت می‌دهد و کاربر هرگز نمی‌فهمد.
 *
 * اینجا فرمول‌های پایتون را عیناً بازپیاده‌سازی می‌کنیم (بدون نیاز به نصب
 * Python/OpenCV در CI) و خروجی را با تابع TypeScript مقایسه می‌کنیم.
 * هر دو باید از shared/scalp-constants.json تغذیه شوند.
 */

const S = HEURISTIC_FEATURE_SCALE;

/** معادل clamp_score در python/analyze.py */
const clampScorePy = (v: number, scale = 100) =>
  Math.max(0, Math.min(100, Math.round(v * scale)));

/** بازپیاده‌سازی دقیق بلوک امتیازدهی analyze.py */
function pythonScores(m: ScalpRawMetrics) {
  const hairArea = Math.max(m.hairCoverageRatio, S.minHairArea);
  const edgeToHairRatio = m.edgeDensity / hairArea;
  return {
    dandruff: clampScorePy(m.whiteFlakeRatio, S.dandruffFromWhiteFlake),
    redness: clampScorePy(m.rednessRatio, S.rednessFromRatio),
    oiliness: clampScorePy(m.textureVariance / S.oilinessTextureDivisor, 100),
    dryness: Math.max(
      0,
      Math.min(100, Math.round((S.drynessBrightnessBase - m.brightness) / S.drynessBrightnessDivisor)),
    ),
    densityScore: clampScorePy(m.hairCoverageRatio, S.densityFromCoverage),
    shine: clampScorePy(m.shineRatio, S.shineFromRatio),
    patchiness: clampScorePy(m.patchinessRaw, S.patchinessFromRaw),
    pigmentation: clampScorePy(m.pigmentationRaw, S.pigmentationFromRaw),
    hairThickness: Math.max(
      0,
      Math.min(100, Math.round(100 - edgeToHairRatio * S.hairThicknessEdgeFactor)),
    ),
  };
}

/** مولد شبه‌تصادفی با seed ثابت — تست باید قطعی باشد */
function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function randomMetrics(rand: () => number): ScalpRawMetrics {
  return {
    brightness: rand() * 255,
    rednessRatio: rand(),
    whiteFlakeRatio: rand(),
    textureVariance: rand() * 200,
    hairCoverageRatio: rand(),
    shineRatio: rand() * 0.2,
    edgeDensity: rand(),
    patchinessRaw: rand() * 0.5,
    pigmentationRaw: rand() * 60,
    avgR: rand() * 255,
    avgG: rand() * 255,
    avgB: rand() * 255,
  };
}

describe('برابری موتور TypeScript و Python', () => {
  it('روی ۲۰۰۰ ورودی تصادفی دقیقاً یک امتیاز می‌دهند', () => {
    const rand = seededRandom(20260727);
    const mismatches: string[] = [];

    for (let i = 0; i < 2000; i += 1) {
      const metrics = randomMetrics(rand);
      const ts = heuristicScoresFromMetrics(metrics);
      const py = pythonScores(metrics);

      for (const key of Object.keys(py) as Array<keyof typeof py>) {
        if (ts[key] !== py[key]) {
          mismatches.push(`${key}: ts=${ts[key]} py=${py[key]} @ ${JSON.stringify(metrics)}`);
        }
      }
      if (mismatches.length > 5) break;
    }

    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('روی مقادیر حدی هم یکسان‌اند', () => {
    const edgeCases: ScalpRawMetrics[] = [
      { brightness: 0, rednessRatio: 0, whiteFlakeRatio: 0, textureVariance: 0, hairCoverageRatio: 0, shineRatio: 0, edgeDensity: 0, patchinessRaw: 0, pigmentationRaw: 0, avgR: 0, avgG: 0, avgB: 0 },
      { brightness: 255, rednessRatio: 1, whiteFlakeRatio: 1, textureVariance: 1000, hairCoverageRatio: 1, shineRatio: 1, edgeDensity: 1, patchinessRaw: 1, pigmentationRaw: 100, avgR: 255, avgG: 255, avgB: 255 },
      { brightness: 180, rednessRatio: 0, whiteFlakeRatio: 0, textureVariance: 0, hairCoverageRatio: 0, shineRatio: 0, edgeDensity: 0, patchinessRaw: 0, pigmentationRaw: 0, avgR: 180, avgG: 180, avgB: 180 },
    ];
    for (const m of edgeCases) {
      expect(heuristicScoresFromMetrics(m)).toEqual(pythonScores(m));
    }
  });

  it('همهٔ امتیازها همیشه عدد صحیح ۰ تا ۱۰۰ هستند', () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const scores = heuristicScoresFromMetrics(randomMetrics(rand));
      for (const [key, value] of Object.entries(scores)) {
        expect(Number.isInteger(value), `${key} صحیح نیست`).toBe(true);
        expect(value, `${key} خارج از بازه`).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('ثابت‌های مشترک', () => {
  it('TypeScript همان مقادیر فایل مشترک را می‌بیند', () => {
    expect(HEURISTIC_FEATURE_SCALE).toEqual(sharedConstants.FEATURE_SCALE);
    expect(GRID_SIZE).toBe(sharedConstants.GRID_SIZE);
  });

  it('هیچ ضریبی صفر یا NaN نیست (تقسیم بر صفر)', () => {
    for (const [key, value] of Object.entries(HEURISTIC_FEATURE_SCALE)) {
      expect(Number.isFinite(value), `${key} عدد معتبر نیست`).toBe(true);
      expect(value, `${key} صفر است`).not.toBe(0);
    }
  });
});
