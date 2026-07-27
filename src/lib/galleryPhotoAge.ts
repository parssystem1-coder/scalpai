import type { GalleryItem } from '../db';

export type AnalysisAgeRef = {
  galleryItemId?: string;
  createdAt: string;
};

const FALLBACK_NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** آخرین زمان تحلیل برای تعیین مرز «مراجعهٔ جدید» */
export function latestAnalysisAt(analyses: AnalysisAgeRef[]): string | null {
  let latest = '';
  for (const a of analyses) {
    if (a.createdAt && a.createdAt > latest) latest = a.createdAt;
  }
  return latest || null;
}

/**
 * عکس «جدید این مراجعه» است اگر بعد از آخرین تحلیل گرفته شده باشد.
 * اگر هنوز تحلیلی نباشد: عکس‌های ۱۴ روز اخیر جدید، بقیه قبلی.
 */
export function isNewVisitPhoto(item: GalleryItem, analyses: AnalysisAgeRef[]): boolean {
  const cutoff = latestAnalysisAt(analyses);
  const created = new Date(item.createdAt || 0).getTime();
  if (Number.isNaN(created)) return false;
  if (cutoff) return created > new Date(cutoff).getTime();
  return Date.now() - created <= FALLBACK_NEW_WINDOW_MS;
}

export function partitionGalleryForAnalysis(
  items: GalleryItem[],
  analyses: AnalysisAgeRef[],
): { newItems: GalleryItem[]; previousItems: GalleryItem[] } {
  const byNewest = (a: GalleryItem, b: GalleryItem) =>
    (b.createdAt || '').localeCompare(a.createdAt || '');

  const newItems: GalleryItem[] = [];
  const previousItems: GalleryItem[] = [];
  for (const item of items) {
    if (isNewVisitPhoto(item, analyses)) newItems.push(item);
    else previousItems.push(item);
  }
  newItems.sort(byNewest);
  previousItems.sort(byNewest);
  return { newItems, previousItems };
}
