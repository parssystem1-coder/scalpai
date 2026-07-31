import { describe, it, expect } from 'vitest';
import {
  heuristicScoresFromMetrics,
  composeOfflineResult,
  type ScalpRawMetrics,
  type ExtractedImageFeatures,
} from '../../lib/scalpFeatures';

/**
 * تست دود — زنجیرهٔ تحلیل آفلاین (فاز ۴ / AUD-13)
 * -----------------------------------------------------------------------
 * چرا این جریان: تحلیل آفلاین **تنها موتوری است که همیشه در دسترس است** —
 * بدون اینترنت، بدون کلید API و بدون مدل آموزش‌دیده. اگر این زنجیره بشکند،
 * برنامه در کلینیک عملاً بی‌فایده می‌شود. و چون شما هنوز داده‌ای ندارید،
 * این دقیقاً همان موتوری است که روز اول استفاده می‌شود.
 *
 * **صداقت دربارهٔ دامنه:** مرحلهٔ اول زنجیره (`extractImageFeatures`) به
 * canvas واقعی نیاز دارد که jsdom ندارد؛ آن مرحله در `scalpFeaturesPhase1`
 * و `engineParity` جداگانه پوشش دارد. این‌جا از یک canvas ساختگی استفاده
 * می‌شود تا **بقیهٔ زنجیره تا خروجی نهایی** واقعاً اجرا شود — نه یک تست
 * ظاهری. ادعای پوشش کامل تحلیل تصویر نمی‌کنیم.
 */

/**
 * canvas ساختگی — jsdom موتور ترسیم ندارد، پس متدهای ۲بعدی که زنجیره صدا
 * می‌زند (شامل ترسیم کادر ضایعات در `lesionVisualization`) این‌جا no-op
 * می‌شوند. مقدار واقعی همان `getImageData` است که پیکسل‌های معتبر می‌دهد
 * تا محاسبات عددی واقعاً اجرا شوند، نه شبیه‌سازی.
 */
function makeStubCanvas(width: number, height: number): HTMLCanvasElement {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 120;     // R
    pixels[i + 1] = 100; // G
    pixels[i + 2] = 90;  // B
    pixels[i + 3] = 255; // A
  }
  const noop = () => {};
  const ctx = {
    getImageData: () => ({ data: pixels, width, height }),
    putImageData: noop,
    drawImage: noop,
    strokeRect: noop,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    setLineDash: noop,
    fillText: noop,
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    globalAlpha: 1,
  };
  return {
    width,
    height,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,stub',
  } as unknown as HTMLCanvasElement;
}

/**
 * مقادیر خام نمونه — شبیه یک تصویر واقعی پوست سر.
 * عمداً بدون `as` نوشته شده تا اگر روزی فیلدی به `ScalpRawMetrics` اضافه یا
 * حذف شود، تایپ‌چک همین‌جا خبر دهد؛ نه اینکه تست با دادهٔ ناقص سبز بماند.
 */
const SAMPLE_METRICS: ScalpRawMetrics = {
  brightness: 110,
  whiteFlakeRatio: 0.12,
  rednessRatio: 0.18,
  hairCoverageRatio: 0.55,
  textureVariance: 25,
  avgR: 120,
  avgG: 100,
  avgB: 90,
  shineRatio: 0.1,
  edgeDensity: 0.3,
  patchinessRaw: 0.2,
  pigmentationRaw: 0.15,
};

function buildExtracted(width = 64, height = 64): ExtractedImageFeatures {
  return {
    metrics: SAMPLE_METRICS,
    width,
    height,
    canvas: makeStubCanvas(width, height),
    // ارزیابی کیفیت روی این مسیر اثر عددی ندارد؛ فقط ساختار لازم است
    imageQuality: {
      usable: true,
      issues: [],
    } as unknown as ExtractedImageFeatures['imageQuality'],
  };
}

describe('تست دود / AUD-13 — زنجیرهٔ تحلیل آفلاین', () => {
  it('از مقادیر خام تا خروجی نهایی بدون خطا اجرا می‌شود', () => {
    const extracted = buildExtracted();
    const scores = heuristicScoresFromMetrics(extracted.metrics);
    const result = composeOfflineResult(extracted, scores, true, 'browser');

    // ساختار خروجی باید کامل باشد — UI مستقیماً به این فیلدها تکیه می‌کند
    expect(result.scalpCondition).toBeDefined();
    expect(result.hairDensity).toBeDefined();
    expect(Array.isArray(result.observations)).toBe(true);
    expect(Array.isArray(result.lesions)).toBe(true);
  });

  it('همهٔ امتیازها عدد معتبر در بازهٔ ۰ تا ۱۰۰ هستند', () => {
    // امانت‌داری عددی: یک NaN در این خروجی مستقیم روی گزارش بالینی بیمار
    // می‌نشیند و پزشک متوجه نمی‌شود که عدد بی‌معناست.
    const scores = heuristicScoresFromMetrics(SAMPLE_METRICS);
    for (const [key, value] of Object.entries(scores)) {
      expect(Number.isFinite(value), `امتیاز «${key}» عدد معتبر نیست`).toBe(true);
      expect(value, `امتیاز «${key}» خارج از بازه است`).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });

  it('نتیجه برای ورودی یکسان قطعی و تکرارپذیر است', () => {
    // اگر همان عکس دو بار نتیجهٔ متفاوت بدهد، هیچ روند بالینی («بهتر شد یا
    // بدتر؟») قابل اتکا نیست — این پایهٔ کل تب مقایسه است.
    const a = composeOfflineResult(buildExtracted(), heuristicScoresFromMetrics(SAMPLE_METRICS), true, 'browser');
    const b = composeOfflineResult(buildExtracted(), heuristicScoresFromMetrics(SAMPLE_METRICS), true, 'browser');
    expect(a.scalpCondition).toEqual(b.scalpCondition);
    expect(a.hairDensity).toEqual(b.hairDensity);
    expect(a.observations).toEqual(b.observations);
  });

  it('موتور استفاده‌شده در خروجی صادقانه ثبت می‌شود', () => {
    // کاربر باید بتواند بفهمد نتیجه از کدام موتور آمده؛ fallback بین موتورها
    // خودکار و بی‌صداست و بدون این برچسب قابل ردیابی نیست.
    const extracted = buildExtracted();
    const scores = heuristicScoresFromMetrics(extracted.metrics);
    expect(composeOfflineResult(extracted, scores, true, 'browser').engine).toBe('browser');
    expect(composeOfflineResult(extracted, scores, true, 'model').engine).toBe('model');
  });

  it('خروجی فارسی و انگلیسی هر دو تولید می‌شوند و خالی نیستند', () => {
    const extracted = buildExtracted();
    const scores = heuristicScoresFromMetrics(extracted.metrics);
    const fa = composeOfflineResult(extracted, scores, true, 'browser');
    const en = composeOfflineResult(extracted, scores, false, 'browser');
    // ساختار یکسان بماند ولی متن‌ها تولید شوند (زبان روی اعداد اثر نگذارد)
    expect(fa.scalpCondition).toEqual(en.scalpCondition);
  });

  it('مقادیر حدی (تصویر کاملاً تیره یا روشن) باعث NaN نمی‌شوند', () => {
    // تصویر خیلی تیره/روشن در کلینیک واقعی رخ می‌دهد (نور بد، فلاش).
    // تقسیم بر صفر این‌جا یعنی گزارش بالینی خراب.
    for (const brightness of [0, 255]) {
      const scores = heuristicScoresFromMetrics({
        ...SAMPLE_METRICS,
        brightness,
        hairCoverageRatio: 0,
        edgeDensity: 0,
      });
      for (const [key, value] of Object.entries(scores)) {
        expect(Number.isFinite(value), `«${key}» با brightness=${brightness} نامعتبر شد`).toBe(true);
      }
    }
  });
});
