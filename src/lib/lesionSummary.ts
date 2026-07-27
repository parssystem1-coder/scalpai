import type { Analysis, GalleryItem, LesionSummary, LesionSummaryItem, LesionSummaryRegion } from '../db';
import { readScalpRegionFromMetadata } from './scalpRegions';
import { readTrichoscopeModeFromMetadata } from './trichoscopeModes';
import { resolveObservationToken, observationsInGroup } from './diagnosisCatalog';
import type { LesionCategory, LesionEvidenceLevel } from '../db';

/**
 * Builds a reporting summary without destroying raw per-image lesion boxes.
 * One lesion type is shown once in the global chart; occurrences remain
 * available through occurrenceCount and the per-region breakdown.
 */
export function buildLesionSummary(
  analyses: Analysis[],
  source: 'ai' | 'offline',
  gallery: GalleryItem[] = [],
): LesionSummary {
  const galleryById = new Map(gallery.map(item => [item.id, item]));
  type Occurrence = { photoKey: string; regionId: string | null; lensMode: string; confidence: number; category: LesionCategory; evidenceLevel?: LesionEvidenceLevel };
  const byType = new Map<string, Occurrence[]>();
  const availableRegionIds = new Set<string>();
  const availableLensModes = new Set<string>();
  const trichoscopyIds = new Set(observationsInGroup('trichoscopy').map(item => item.id));
  const resolveCategory = (type: string, category?: LesionCategory): LesionCategory => {
    if (category) return category;
    const id = resolveObservationToken(type);
    return id && trichoscopyIds.has(id) ? 'trichoscopy' : 'condition';
  };

  for (const analysis of analyses) {
    const result = source === 'ai' ? analysis.aiResults : analysis.offlineResults;
    if (!result) continue;
    const galleryItem = analysis.galleryItemId ? galleryById.get(analysis.galleryItemId) : undefined;
    const regionId = galleryItem ? readScalpRegionFromMetadata(galleryItem.metadata) : null;
    // Legacy region images without lens metadata are White Light (NL), matching
    // the upload/session logic elsewhere in the app.
    const lensMode = galleryItem ? (readTrichoscopeModeFromMetadata(galleryItem.metadata) ?? 'NL') : 'NL';
    const photoKey = analysis.galleryItemId || analysis.id;
    availableRegionIds.add(regionId || 'unknown');
    availableLensModes.add(lensMode);
    for (const lesion of result.lesions ?? []) {
      if (!lesion.type) continue;
      const list = byType.get(lesion.type) || [];
      list.push({
        photoKey,
        regionId,
        lensMode,
        confidence: Math.max(0, Math.min(1, lesion.confidence || 0)),
        category: resolveCategory(lesion.type, lesion.category),
        evidenceLevel: lesion.evidenceLevel,
      });
      byType.set(lesion.type, list);
    }
  }

  const summarize = (occurrences: Occurrence[]): Omit<LesionSummaryItem, 'type' | 'regions'> => {
    const photos = new Set(occurrences.map(item => item.photoKey));
    const photoRegions = new Set(occurrences.map(item => `${item.photoKey}:${item.regionId || 'unknown'}`));
    const confidenceTotal = occurrences.reduce((sum, item) => sum + item.confidence, 0);
    return {
      affectedPhotoCount: photos.size,
      affectedPhotoRegionCount: photoRegions.size,
      occurrenceCount: occurrences.length,
      averageConfidence: occurrences.length ? confidenceTotal / occurrences.length : 0,
      maxConfidence: occurrences.reduce((max, item) => Math.max(max, item.confidence), 0),
    };
  };

  const summarizeRegions = (occurrences: Occurrence[]): LesionSummaryRegion[] => {
    const byRegion = new Map<string, Occurrence[]>();
    for (const occurrence of occurrences) {
      const key = occurrence.regionId || 'unknown';
      const list = byRegion.get(key) || [];
      list.push(occurrence);
      byRegion.set(key, list);
    }
    return [...byRegion.entries()].map(([key, list]) => ({
      regionId: key === 'unknown' ? null : key,
      ...summarize(list),
    }));
  };

  const evidenceFor = (occurrences: Occurrence[]): LesionEvidenceLevel | undefined =>
    occurrences.some(item => item.evidenceLevel === 'requires_confirmation')
      ? 'requires_confirmation'
      : occurrences.some(item => item.evidenceLevel === 'possible')
        ? 'possible'
        : occurrences.some(item => item.evidenceLevel === 'observed')
          ? 'observed'
          : undefined;

  const global = [...byType.entries()]
    .map(([type, occurrences]) => ({
      type,
      category: occurrences[0]?.category,
      evidenceLevel: evidenceFor(occurrences),
      ...summarize(occurrences),
      regions: summarizeRegions(occurrences),
    }))
    .sort((a, b) => b.affectedPhotoRegionCount - a.affectedPhotoRegionCount || b.maxConfidence - a.maxConfidence);

  const regionOccurrences = new Map<string, Occurrence[]>();
  for (const occurrences of byType.values()) {
    for (const occurrence of occurrences) {
      const key = occurrence.regionId || 'unknown';
      const list = regionOccurrences.get(key) || [];
      list.push(occurrence);
      regionOccurrences.set(key, list);
    }
  }

  const itemsByRegion: Record<string, LesionSummaryItem[]> = {};
  for (const regionKey of regionOccurrences.keys()) {
    const types = new Map<string, Occurrence[]>();
    for (const [type, typeOccurrences] of byType) {
      const selected = typeOccurrences.filter(item => (item.regionId || 'unknown') === regionKey);
      if (selected.length) types.set(type, selected);
    }
    itemsByRegion[regionKey] = [...types.entries()]
      .map(([type, list]) => ({
        type,
        category: list[0]?.category,
        evidenceLevel: evidenceFor(list),
        ...summarize(list),
        regions: summarizeRegions(list),
      }))
      .sort((a, b) => b.affectedPhotoRegionCount - a.affectedPhotoRegionCount);
  }

  const itemsByRegionAndLens: Record<string, Record<string, LesionSummaryItem[]>> = {};
  for (const regionKey of availableRegionIds) {
    itemsByRegionAndLens[regionKey] = {};
    for (const lensMode of availableLensModes) {
      const entries = [...byType.entries()]
        .map(([type, occurrences]) => {
          const selected = occurrences.filter(item => (item.regionId || 'unknown') === regionKey && item.lensMode === lensMode);
          if (!selected.length) return null;
          const summaryItem: LesionSummaryItem = { type, category: selected[0].category, evidenceLevel: evidenceFor(selected), ...summarize(selected), regions: summarizeRegions(selected) };
          return summaryItem;
        })
        .filter((item): item is LesionSummaryItem => item !== null)
        .sort((a, b) => b.affectedPhotoRegionCount - a.affectedPhotoRegionCount);
      if (entries.length) itemsByRegionAndLens[regionKey][lensMode] = entries;
    }
  }

  const byRegion = [...regionOccurrences.entries()].map(([key, occurrences]) => ({
    regionId: key === 'unknown' ? null : key,
    ...summarize(occurrences),
  }));

  return {
    global,
    byRegion,
    itemsByRegion,
    itemsByRegionAndLens,
    availableRegionIds: [...availableRegionIds],
    availableLensModes: [...availableLensModes],
  };
}
