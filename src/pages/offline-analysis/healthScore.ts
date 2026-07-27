import type { OfflineAnalysisResult } from '../../db';
import type { Lang } from '../../i18n';
import { offlineDict } from './strings';
import {
  computeHealthScore as computeShared,
  healthScoreColor as colorShared,
  healthScoreTier,
  type HealthScoreInput,
} from '../../lib/healthScore';

export function computeHealthScore(result: OfflineAnalysisResult | HealthScoreInput): number {
  return computeShared(result);
}

export function healthScoreLabel(score: number, lang: Lang): string {
  const tier = healthScoreTier(score);
  if (tier === 'excellent') return offlineDict.healthExcellent[lang];
  if (tier === 'good') return offlineDict.healthGood[lang];
  if (tier === 'fair') return offlineDict.healthFair[lang];
  return offlineDict.healthNeedsAttention[lang];
}

export function healthScoreColor(score: number): string {
  return colorShared(score);
}
