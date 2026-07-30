import { describe, it, expect } from 'vitest';
import type { TrainingSample } from '../db/types';
import { findDhashDuplicate, DHASH_TWIN_THRESHOLD } from './imageDedup';
import { auditVisualTwins } from './datasetAudit';
import { planFeatureRecompute, runFeatureRecomputeBatch } from './featureRecompute';
import { FEATURE_VERSION } from './scalpFeatures';

/**
 * تست‌های موج ۱ — اتصال ماژول‌های یتیم به جریان محصول:
 *  - W1-2: تصمیم دوقلوی بصری dHash در گالری + گزارش دوقلو در ممیزی دیتاست
 *  - W1-4: برنامه و اجرای بازمحاسبهٔ فیچر از تصویر خام
 */

// ---------- ابزار ساخت نمونهٔ ساختگی ----------
function makeSample(id: string, overrides: Partial<TrainingSample> = {}): TrainingSample {
  return {
    id,
    features: {
      brightness: 100, whiteFlakeRatio: 0.1, rednessRatio: 0.1, hairCoverageRatio: 0.5,
      textureVariance: 50, avgR: 100, avgG: 100, avgB: 100,
      shineRatio: 0.1, edgeDensity: 0.2, patchinessRaw: 0.1, pigmentationRaw: 5,
    },
    label: { oiliness: 50, dryness: 50, dandruff: 50, redness: 50, densityScore: 50 },
    labelSource: 'expert',
    createdAt: '2026-01-01T10:00:00.000Z',
    featureVersion: FEATURE_VERSION,
    ...overrides,
  };
}

/** dHash مبنای ساختگی (۱۶ رقم hex) */
const BASE_HASH = '0000000000000000';

describe('W1-2 — findDhashDuplicate (تصمیم دوقلوی بصری در گالری)', () => {
  it('بدون نامزد یا ورودی نامعتبر → null', () => {
    expect(findDhashDuplicate(BASE_HASH, [])).toBeNull();
    expect(findDhashDuplicate('', [{ id: 'a', dhash: BASE_HASH }])).toBeNull();
    expect(findDhashDuplicate('abc', [{ id: 'a', dhash: BASE_HASH }])).toBeNull();
    expect(findDhashDuplicate(BASE_HASH, [{ id: 'a', dhash: 'short' }])).toBeNull();
  });

  it('تصویر دقیقاً یکسان (فاصلهٔ صفر) تشخیص داده می‌شود', () => {
    const hit = findDhashDuplicate(BASE_HASH, [{ id: 'g1', dhash: BASE_HASH }]);
    expect(hit).not.toBeNull();
    expect(hit!.id).toBe('g1');
    expect(hit!.distance).toBe(0);
  });

  it('آستانهٔ همینگ دقیق اعمال می‌شود (۱ قابل‌قبول، ۸ غیرقابل‌قبول)', () => {
    // '1' در مبنای ۱۶ = 0001 → فاصلهٔ ۱ بیت؛ 'ff' = ۸ بیت فاصله
    const within = findDhashDuplicate('0000000000000001', [{ id: 'g1', dhash: BASE_HASH }]);
    expect(within).not.toBeNull();
    expect(within!.distance).toBe(1);
    const atThreshold = findDhashDuplicate('000000000000000f', [{ id: 'g1', dhash: BASE_HASH }]);
    expect(atThreshold).not.toBeNull();
    expect(atThreshold!.distance).toBe(DHASH_TWIN_THRESHOLD); // 'f' = ۴ بیت = خود آستانه
    const beyond = findDhashDuplicate('00000000000000ff', [{ id: 'g1', dhash: BASE_HASH }]);
    expect(beyond).toBeNull(); // فاصلهٔ ۸ > ۴
  });

  it('نزدیک‌ترین نامزد برمی‌گردد، نه اولین', () => {
    const hit = findDhashDuplicate(BASE_HASH, [
      { id: 'far-ish', dhash: '0000000000000001' },   // فاصلهٔ ۱
      { id: 'exact', dhash: BASE_HASH },               // فاصلهٔ ۰
    ]);
    expect(hit!.id).toBe('exact');
  });
});

describe('W1-2 — auditVisualTwins (گزارش دوقلوهای بصری استخر آموزشی)', () => {
  const samples = [
    makeSample('s1', { galleryItemId: 'g1' }),
    makeSample('s2', { galleryItemId: 'g2' }),
    makeSample('s3', { galleryItemId: 'g3' }),
    makeSample('s4'), // بدون تصویر — نباید حساب شود
  ];
  const items = [
    { id: 'g1', metadata: { dhash: BASE_HASH } },
    { id: 'g2', metadata: { dhash: '0000000000000001' } }, // دوقلوی g1 (فاصلهٔ ۱)
    { id: 'g3', metadata: { dhash: 'ffffffffffffffff' } }, // کاملاً متفاوت
    { id: 'g4', metadata: {} }, // بدون dHash — باید نادیده گرفته شود
  ];

  it('تصاویر دوقلو در یک گروه گزارش می‌شوند و تصاویر سالم جدا می‌مانند', () => {
    const twins = auditVisualTwins(samples, items);
    expect(twins).toHaveLength(1);
    expect(twins[0].galleryItemIds.sort()).toEqual(['g1', 'g2']);
    expect(twins[0].sampleIds.sort()).toEqual(['s1', 's2']);
    expect(twins[0].minDistance).toBe(1);
  });

  it('چند نمونه روی یک تصویر فقط یک گره می‌شود، نه دوقلوی مصنوعی', () => {
    const dupSamples = [
      makeSample('s1', { galleryItemId: 'g1' }),
      makeSample('s2', { galleryItemId: 'g1' }),
    ];
    const twins = auditVisualTwins(dupSamples, items);
    expect(twins).toHaveLength(0);
  });

  it('آستانهٔ دقیق دوقلویی محترم است', () => {
    const strict = auditVisualTwins(samples, items, 0);
    expect(strict).toHaveLength(0); // فاصلهٔ ۱ با آستانهٔ ۰ دوقلو نیست
  });

  it('بدون dHash گزارشی تولید نمی‌شود', () => {
    expect(auditVisualTwins(samples, [{ id: 'g4', metadata: {} }])).toHaveLength(0);
  });
});

describe('W1-4 — planFeatureRecompute (طبقه‌بندی نمونه‌ها)', () => {
  it('نمونه‌ها به سه دستهٔ ارتقاپذیر، بدون‌تصویر و جاری تقسیم می‌شوند', () => {
    const samples = [
      makeSample('old-version', { featureVersion: 'v3.2-normalized-adaptive-grid', galleryItemId: 'g1' }),
      makeSample('legacy-version', { featureVersion: 'v3', galleryItemId: 'g2' }),
      makeSample('no-image', { featureVersion: 'v3.2-normalized-adaptive-grid' }),
      makeSample('current', { featureVersion: FEATURE_VERSION, galleryItemId: 'g3' }),
    ];
    const plan = planFeatureRecompute(samples);
    expect(plan.upgradable.map(s => s.id).sort()).toEqual(['legacy-version', 'old-version']);
    expect(plan.noImage.map(s => s.id)).toEqual(['no-image']);
    expect(plan.current.map(s => s.id)).toEqual(['current']);
  });
});

describe('W1-4 — runFeatureRecomputeBatch (اجرای دسته‌ای با تزریق وابستگی)', () => {
  const fakeSnapshot = () => ({
    brightness: 42, whiteFlakeRatio: 0.2, rednessRatio: 0.2, hairCoverageRatio: 0.6,
    textureVariance: 60, avgR: 42, avgG: 42, avgB: 42,
    shineRatio: 0.2, edgeDensity: 0.3, patchinessRaw: 0.2, pigmentationRaw: 6,
  });

  const oldSamples = [
    makeSample('a', { featureVersion: 'v3.2-normalized-adaptive-grid', galleryItemId: 'g1' }),
    makeSample('b', { featureVersion: 'v3.2-normalized-adaptive-grid', galleryItemId: 'g2' }),
    makeSample('c', { featureVersion: 'v3.2-normalized-adaptive-grid', galleryItemId: 'g3' }),
  ];

  it('نمونه‌ها با فرمول جدید بازمحاسبه و به نسخهٔ فعلی ارتقا می‌یابند', async () => {
    const { updates, summary } = await runFeatureRecomputeBatch(oldSamples, {
      getImageUrl: async id => (id ? `data:image/jpeg;base64,${id}` : null),
      extractMetrics: async () => fakeSnapshot(),
    });
    expect(summary.planned).toBe(3);
    expect(summary.recomputed).toBe(3);
    expect(summary.failed).toBe(0);
    expect(updates).toHaveLength(3);
    expect(updates[0].featureVersion).toBe(FEATURE_VERSION);
    expect(updates[0].features.brightness).toBe(42);
  });

  it('تصویر دردسترس‌نبودن (null) به‌جای شکست، «بدون تصویر» شمرده می‌شود', async () => {
    const { updates, summary } = await runFeatureRecomputeBatch(oldSamples, {
      getImageUrl: async () => null,
      extractMetrics: async () => fakeSnapshot(),
    });
    expect(updates).toHaveLength(0);
    expect(summary.skippedNoImage).toBe(3);
    expect(summary.failed).toBe(0);
  });

  it('شکست استخراج یک نمونه، بقیهٔ دسته را متوقف نمی‌کند', async () => {
    const { updates, summary } = await runFeatureRecomputeBatch(oldSamples, {
      getImageUrl: async id => `url-${id}`,
      extractMetrics: async url => {
        if (url === 'url-g2') throw new Error('corrupt image');
        return fakeSnapshot();
      },
    });
    expect(updates.map(u => u.sampleId).sort()).toEqual(['a', 'c']);
    expect(summary.failed).toBe(1);
  });

  it('لغو در میانهٔ دسته، خلاصهٔ صادقانه برمی‌گرداند', async () => {
    let calls = 0;
    const { updates, summary } = await runFeatureRecomputeBatch(
      oldSamples,
      {
        getImageUrl: async id => `url-${id}`,
        extractMetrics: async () => fakeSnapshot(),
      },
      undefined,
      () => {
        calls++;
        return calls > 1; // بعد از اولین نمونه لغو فعال می‌شود
      },
    );
    expect(summary.canceled).toBe(true);
    expect(updates.length).toBeLessThan(3);
  });

  it('گزارش پیشرفت به‌ازای هر نمونه صدا زده می‌شود', async () => {
    const progress: [number, number][] = [];
    await runFeatureRecomputeBatch(
      oldSamples,
      { getImageUrl: async id => `url-${id}`, extractMetrics: async () => fakeSnapshot() },
      (done, total) => progress.push([done, total]),
    );
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });
});
