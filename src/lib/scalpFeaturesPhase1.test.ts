import { describe, it, expect } from 'vitest';
import {
  assessImageQuality,
  applyColorNormalization,
  computeAdaptiveGridDims,
} from './scalpFeatures';
import { COLOR_NORMALIZATION, IMAGE_QUALITY_THRESHOLDS, GRID_SIZE } from './heuristicConstants';
import sharedConstants from '@shared/scalp-constants.json';

/**
 * فاز ۱ — تست‌های واحد نرمال‌سازی نور/رنگ، دروازهٔ کیفیت تصویر و شبکهٔ
 * تطبیقی. اینجا فقط منطق TypeScript را می‌سنجیم (بدون DOM/canvas)؛ برابری
 * عددی با python/analyze.py به‌صورت دستی در حین توسعه با تصاویر واقعی
 * تأیید شده (چون اجرای واقعی OpenCV در CI موجود نیست) — رجوع کنید به
 * توضیحات بالای apply_color_normalization/assess_image_quality در آن فایل.
 */

function makeSolidRgba(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function makeNoiseRgba(width: number, height: number, seed: number): Uint8ClampedArray {
  const rand = seededRandom(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = Math.floor(rand() * 255);
    data[i * 4 + 1] = Math.floor(rand() * 255);
    data[i * 4 + 2] = Math.floor(rand() * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('ثابت‌های فاز ۱ مشترک', () => {
  it('COLOR_NORMALIZATION و IMAGE_QUALITY_THRESHOLDS دقیقاً از فایل مشترک می‌آیند', () => {
    expect(COLOR_NORMALIZATION).toEqual(sharedConstants.COLOR_NORMALIZATION);
    expect(IMAGE_QUALITY_THRESHOLDS).toEqual(sharedConstants.IMAGE_QUALITY_THRESHOLDS);
  });
});

describe('assessImageQuality', () => {
  it('تصویر کاملاً یک‌دست (flat) را تار و کم‌کنتراست تشخیص می‌دهد', () => {
    const data = makeSolidRgba(60, 40, 128, 128, 128);
    const q = assessImageQuality(data, 60, 40);
    expect(q.blurVariance).toBe(0);
    expect(q.brightnessStd).toBe(0);
    expect(q.isBlurry).toBe(true);
    expect(q.isLowContrast).toBe(true);
    expect(q.hasIssue).toBe(true);
  });

  it('تصویر خیلی تاریک را isTooDark علامت می‌زند', () => {
    const data = makeSolidRgba(60, 40, 10, 10, 10);
    const q = assessImageQuality(data, 60, 40);
    expect(q.isTooDark).toBe(true);
    expect(q.isTooBright).toBe(false);
    expect(q.meanBrightness).toBeCloseTo(10, 5);
  });

  it('تصویر خیلی روشن را isTooBright علامت می‌زند', () => {
    const data = makeSolidRgba(60, 40, 250, 250, 250);
    const q = assessImageQuality(data, 60, 40);
    expect(q.isTooBright).toBe(true);
    expect(q.isTooDark).toBe(false);
  });

  it('تصویر نویزی با کنتراست بالا را تار/کم‌کنتراست نمی‌داند', () => {
    const data = makeNoiseRgba(80, 60, 20260728);
    const q = assessImageQuality(data, 80, 60);
    expect(q.isBlurry).toBe(false);
    expect(q.isLowContrast).toBe(false);
    expect(q.hasIssue).toBe(false);
  });

  it('blurVariance و brightnessStd هرگز منفی نیستند', () => {
    for (const seed of [1, 2, 3, 99]) {
      const data = makeNoiseRgba(40, 40, seed);
      const q = assessImageQuality(data, 40, 40);
      expect(q.blurVariance).toBeGreaterThanOrEqual(0);
      expect(q.brightnessStd).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('applyColorNormalization', () => {
  it('یک تصویر کاملاً خنثی (خاکستری در سطح هدف) را تقریباً دست‌نخورده می‌گذارد', () => {
    const target = COLOR_NORMALIZATION.targetGrayBrightness;
    const data = makeSolidRgba(10, 10, target, target, target);
    const out = applyColorNormalization(data);
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBeCloseTo(target, -1); // اختلاف کوچک به‌خاطر round مجاز است
      expect(out[i + 1]).toBeCloseTo(target, -1);
      expect(out[i + 2]).toBeCloseTo(target, -1);
    }
  });

  it('کانال غالب (مثلاً قرمز خیلی بالا) را نسبت به بقیه کاهش می‌دهد (white balance)', () => {
    const data = makeSolidRgba(10, 10, 220, 100, 100); // قرمز غالب
    const out = applyColorNormalization(data);
    // بعد از نرمال‌سازی، فاصلهٔ نسبی بین کانال‌ها باید کمتر از قبل شود
    const beforeSpread = 220 - 100;
    const afterSpread = Math.abs(out[0] - out[1]);
    expect(afterSpread).toBeLessThan(beforeSpread);
  });

  it('بهرهٔ white-balance/exposure در محدودهٔ مجاز کلمپ می‌شود (خروجی هرگز NaN/Infinity نیست)', () => {
    const data = makeSolidRgba(5, 5, 1, 1, 250); // اختلاف کانال افراطی
    const out = applyColorNormalization(data);
    for (const v of out) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });

  it('طول بافر خروجی با ورودی برابر است و کانال آلفا دست‌نخورده می‌ماند', () => {
    const data = makeSolidRgba(8, 8, 90, 150, 200);
    data[3] = 128; // آلفای پیکسل اول را تغییر بده
    const out = applyColorNormalization(data);
    expect(out.length).toBe(data.length);
    expect(out[3]).toBe(128);
  });
});

describe('computeAdaptiveGridDims', () => {
  it('برای تصویر مربعی همان GRID_SIZE×GRID_SIZE سابق را نزدیک می‌ماند', () => {
    const { cols, rows } = computeAdaptiveGridDims(400, 400);
    expect(cols * rows).toBeGreaterThanOrEqual(GRID_SIZE * GRID_SIZE - 4);
    expect(cols * rows).toBeLessThanOrEqual(GRID_SIZE * GRID_SIZE + 4);
    expect(Math.abs(cols - rows)).toBeLessThanOrEqual(1);
  });

  it('برای تصویر خیلی کشیده (wide) ستون بیشتر از ردیف می‌دهد', () => {
    const { cols, rows } = computeAdaptiveGridDims(1600, 200);
    expect(cols).toBeGreaterThan(rows);
  });

  it('برای تصویر خیلی کشیدهٔ عمودی ردیف بیشتر از ستون می‌دهد', () => {
    const { cols, rows } = computeAdaptiveGridDims(200, 1600);
    expect(rows).toBeGreaterThan(cols);
  });

  it('همیشه حداقل ۲×۲ برمی‌گرداند (حتی برای ابعاد صفر/نامعتبر)', () => {
    const a = computeAdaptiveGridDims(0, 0);
    expect(a.cols).toBeGreaterThanOrEqual(2);
    expect(a.rows).toBeGreaterThanOrEqual(2);
  });

  it('مساحت کل شبکه با مساحت هدف (GRID_SIZE×GRID_SIZE) قابل مقایسه می‌ماند', () => {
    for (const [w, h] of [[300, 300], [640, 480], [480, 640], [1000, 100]]) {
      const { cols, rows } = computeAdaptiveGridDims(w, h);
      const target = GRID_SIZE * GRID_SIZE;
      // با گرد کردن دوطرفه ممکن است کمی فاصله بگیرد، ولی نباید نامتناسب بزرگ/کوچک شود
      expect(cols * rows).toBeGreaterThanOrEqual(Math.max(4, target * 0.5));
      expect(cols * rows).toBeLessThanOrEqual(target * 2.5);
    }
  });
});
