/**
 * datasetAudit.ts — فاز ۱٫۵
 *
 * ممیزی و مانیتورینگ دیتاست آموزش محلی.
 * شامل:
 *  - تشخیص برچسب‌های کم‌داده (under-supported)
 *  - تشخیص نمونه‌های تکراری (duplicate detection)
 *  - تحلیل آماری توزیع فیچرها (میانگین، انحراف‌معیار، چولگی)
 */

import { TrainingSample } from '../db/types';
import { FEATURE_KEYS } from './scalpFeatures';
import { calculateHammingDistance, DHASH_TWIN_THRESHOLD } from './imageDedup';

export interface FeatureStats {
  key: string;
  mean: number;
  std: number;
  min: number;
  max: number;
  skewness: number;
}

export interface DuplicateGroup {
  hash: string;
  sampleIds: string[];
}

export interface DatasetAuditReport {
  totalSamples: number;
  underSupportedLabels: string[];
  duplicates: DuplicateGroup[];
  featureStats: FeatureStats[];
}

export interface VisualTwinGroup {
  /** شناسهٔ آیتم‌های گالری عضو گروه دوقلو */
  galleryItemIds: string[];
  /** شناسهٔ نمونه‌های آموزشی متأثر */
  sampleIds: string[];
  /** کمترین فاصلهٔ همینگ مشاهده‌شده داخل گروه */
  minDistance: number;
}

/** آیتم گالری با متادیتا — فقط فیلد dhash از آن استفاده می‌شود */
export interface GalleryDhashSource {
  id: string;
  metadata?: Record<string, unknown>;
}

/**
 * موج ۱ (W1-2) — گروه‌بندی «دوقلوهای بصری» استخر آموزشی بر اساس dHash.
 *
 * دوقلو = چند آیتم گالری متمایز (آپلود جداگانه، resize/فشرده‌سازی متفاوت)
 * که فاصلهٔ همینگ dHash آن‌ها از آستانه کمتر است. چنین نمونه‌هایی ظرفیت
 * آموزش را می‌سوزانند و معیارها را خوش‌بینانه می‌کنند.
 *
 * نکتهٔ طراحی: این تابع فقط «گزارش» می‌دهد و هیچ حذف خودکاری انجام نمی‌شود —
 * عکس‌های قبل/بعد درمان عمداً بسیار شبیه‌اند و حذف خودکارشان دادهٔ ارزشمند
 * بالینی می‌سوزاند. تصمیم نهایی با متخصص است.
 * پیچیدگی: O(k²) روی آیتم‌های دارای dHash — با صدها تصویر محدودهٔ امن است.
 */
export function auditVisualTwins(
  samples: TrainingSample[],
  galleryItems: GalleryDhashSource[],
  maxDistance = DHASH_TWIN_THRESHOLD,
): VisualTwinGroup[] {
  // نگاشت آیتم گالری → dHash
  const dhashByItem = new Map<string, string>();
  for (const item of galleryItems) {
    const dh = item.metadata?.dhash;
    if (typeof dh === 'string' && dh.length === 16) {
      dhashByItem.set(item.id, dh);
    }
  }

  // فقط نمونه‌هایی که تصویرشان dHash دارد؛ چند نمونه روی یک تصویر یک گره می‌شوند
  const byItem = new Map<string, { dhash: string; sampleIds: string[] }>();
  for (const s of samples) {
    if (!s.galleryItemId) continue;
    const dh = dhashByItem.get(s.galleryItemId);
    if (!dh) continue;
    const entry = byItem.get(s.galleryItemId) ?? { dhash: dh, sampleIds: [] };
    entry.sampleIds.push(s.id);
    byItem.set(s.galleryItemId, entry);
  }

  const ids = [...byItem.keys()];
  if (ids.length < 2) return [];

  // Union-Find روی آیتم‌هایی که فاصلهٔ همینگشان ≤ آستانه است
  const parent = new Map<string, string>(ids.map(id => [id, id]));
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    return p;
  };
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b));
  };

  const edgeMinDistance = new Map<string, number>(); // "a|b" → fاصله
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byItem.get(ids[i])!.dhash;
      const b = byItem.get(ids[j])!.dhash;
      const distance = calculateHammingDistance(a, b);
      if (distance <= maxDistance) {
        union(ids[i], ids[j]);
        edgeMinDistance.set(`${ids[i]}|${ids[j]}`, distance);
      }
    }
  }

  // تجمیع گره‌های هم‌ریشه
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }

  const result: VisualTwinGroup[] = [];
  for (const memberIds of groups.values()) {
    if (memberIds.length < 2) continue;
    let minDistance = maxDistance;
    const sampleIds: string[] = [];
    for (const id of memberIds) {
      sampleIds.push(...byItem.get(id)!.sampleIds);
    }
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const d = edgeMinDistance.get(`${memberIds[i]}|${memberIds[j]}`)
          ?? edgeMinDistance.get(`${memberIds[j]}|${memberIds[i]}`);
        if (d !== undefined && d < minDistance) minDistance = d;
      }
    }
    result.push({ galleryItemIds: memberIds, sampleIds, minDistance });
  }

  return result.sort((a, b) => a.minDistance - b.minDistance);
}

const MIN_SAMPLES_SUPPORT = 5;

// شناسه‌های مشاهدات بالینی متداول در کاتالوگ
const OBSERVATION_IDS = [
  'dandruff', 'seborrheicDermatitis', 'perifollicularScaling',
  'oily', 'seborrhea', 'dry', 'inflammation', 'erythemaDiffuse',
  'folliculitis', 'psoriasis', 'fungal', 'hairLoss', 'alopecia',
  'androgenic', 'femalePattern', 'telogen', 'emptyFollicles',
  'scarring', 'thinning', 'miniaturization', 'yellowDots', 'whiteDots'
];

/**
 * محاسبهٔ چولگی (Skewness) داده‌ها برای تحلیل توزیع آماری فیچرها.
 * چولگی صفر یعنی توزیع کاملاً متقارن (نرمال). چولگی مثبت یعنی دم سمت راست کشیده‌تر است.
 */
function calculateSkewness(values: number[], mean: number, std: number): number {
  if (values.length < 3 || std === 0) return 0;
  let sumCubedDiff = 0;
  for (const v of values) {
    sumCubedDiff += Math.pow(v - mean, 3);
  }
  const n = values.length;
  const skew = (n * sumCubedDiff) / ((n - 1) * (n - 2) * Math.pow(std, 3));
  return Number.isFinite(skew) ? skew : 0;
}

/**
 * اجرای ممیزی کامل روی استخر تصاویر آموزشی.
 */
export function auditDataset(samples: TrainingSample[]): DatasetAuditReport {
  const totalSamples = samples.length;

  // ۱. بررسی برچسب‌های کم‌نمونه (Under-supported)
  // مشاهداتی که کمتر از MIN_SAMPLES_SUPPORT نمونهٔ مثبت دارند.
  const labelCounts: Record<string, number> = {};
  for (const id of OBSERVATION_IDS) {
    labelCounts[id] = 0;
  }

  for (const sample of samples) {
    const obs = sample.label?.observations ?? [];
    for (const o of obs) {
      if (labelCounts[o] !== undefined) {
        labelCounts[o]++;
      } else {
        labelCounts[o] = 1;
      }
    }
  }

  const underSupportedLabels = OBSERVATION_IDS.filter(id => labelCounts[id] < MIN_SAMPLES_SUPPORT);

  // ۲. تشخیص تصاویر تکراری (Duplicate detection)
  // به کمک galleryItemId یا شناسه‌های مشابه
  const dupMap = new Map<string, string[]>();
  for (const sample of samples) {
    if (sample.galleryItemId) {
      const existing = dupMap.get(sample.galleryItemId) ?? [];
      existing.push(sample.id);
      dupMap.set(sample.galleryItemId, existing);
    }
  }

  const duplicates: DuplicateGroup[] = [];
  for (const [galleryItemId, sampleIds] of dupMap.entries()) {
    if (sampleIds.length > 1) {
      duplicates.push({
        hash: galleryItemId,
        sampleIds
      });
    }
  }

  // ۳. تحلیل آماری توزیع ویژگی‌ها (Feature distribution)
  const featureStats: FeatureStats[] = [];

  for (const key of FEATURE_KEYS) {
    const values: number[] = [];
    for (const sample of samples) {
      // استخراج مقدار فیچر
      const featVal = (sample.features as unknown as Record<string, unknown>)?.[key];
      if (typeof featVal === 'number' && Number.isFinite(featVal)) {
        values.push(featVal);
      }
    }

    if (values.length === 0) {
      featureStats.push({
        key,
        mean: 0,
        std: 0,
        min: 0,
        max: 0,
        skewness: 0
      });
      continue;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    
    let sumSquaredDiff = 0;
    for (const v of values) {
      sumSquaredDiff += Math.pow(v - mean, 2);
    }
    const variance = sumSquaredDiff / values.length;
    const std = Math.sqrt(variance);

    const skewness = calculateSkewness(values, mean, std);

    featureStats.push({
      key,
      mean,
      std,
      min,
      max,
      skewness
    });
  }

  return {
    totalSamples,
    underSupportedLabels,
    duplicates,
    featureStats
  };
}
