import type { OfflineAnalysisResult } from '../db';
import { extractImageFeatures, heuristicScoresFromMetrics, composeOfflineResult } from './scalpFeatures';

/**
 * موتور heuristic (قانون‌محور) تحلیل آفلاین — از ماژول مشترک scalpFeatures
 * برای استخراج فیچر و ساخت خروجی استفاده می‌کند تا فرمول‌ها با مسیر
 * آنلاین/آموزش مدل همیشه یکسان بمانند.
 */
export async function analyzeImageInBrowser(
  imageUrl: string,
  isRtl = true
): Promise<OfflineAnalysisResult> {
  const extracted = await extractImageFeatures(imageUrl);
  const scores = heuristicScoresFromMetrics(extracted.metrics);
  return composeOfflineResult(extracted, scores, isRtl, 'browser');
}
