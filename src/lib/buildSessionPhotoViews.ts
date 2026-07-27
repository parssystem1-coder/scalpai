/**
 * ساخت لیست تصویرسازی چندعکسی یک جلسه
 */
import type { Analysis, GalleryItem } from '../db';
import { db, resolveGalleryItemUrl } from '../db';
import type { SessionPhotoView } from '../pages/ai-analysis/VisualizationTab';
import { getAnalysisClinicalResult, type ResultSource } from './sessionVisit';

export async function buildSessionPhotoViews(
  visitAnalyses: Analysis[],
  gallery: GalleryItem[],
  source: ResultSource,
  labelForIndex: (index: number) => string,
): Promise<SessionPhotoView[]> {
  const views: SessionPhotoView[] = [];
  for (let i = 0; i < visitAnalyses.length; i++) {
    const a = visitAnalyses[i];
    const clinical = getAnalysisClinicalResult(a, source);
    // لیست‌ها تصویر annotate‌شده را حمل نمی‌کنند (فقط پرچم hasAnnotatedImage)،
    // پس اگر پرچم روشن بود تصویر را on-demand می‌گیریم.
    let annotated = clinical?.annotatedImageBase64;
    if (!annotated && clinical?.hasAnnotatedImage) {
      try {
        annotated = (await db.getAnalysisAnnotatedImage(a.id)) || undefined;
      } catch (err) {
        console.warn('Loading annotated analysis image failed:', err);
      }
    }
    let imageUrl = annotated || '';
    let hasAnnotated = Boolean(annotated);

    if (!imageUrl && a.galleryItemId) {
      const item = gallery.find(g => g.id === a.galleryItemId);
      if (item) {
        imageUrl = await resolveGalleryItemUrl(item);
        hasAnnotated = false;
      }
    }

    if (!imageUrl) continue;
    views.push({
      analysisId: a.id,
      imageUrl,
      lesions: clinical?.lesions ?? [],
      label: labelForIndex(i),
      hasAnnotated: source === 'ai' ? hasAnnotated : false,
    });
  }
  return views;
}
