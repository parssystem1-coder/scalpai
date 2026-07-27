/**
 * امتیاز کلی سلامت پوست سر (۰ تا ۱۰۰) — مشترک بین تحلیل آنلاین و آفلاین.
 * تراکم مو تأثیر مثبت دارد؛ چربی/خشکی/شوره/قرمزی هرچه کمتر بهتر است.
 */

export interface HealthScoreInput {
  hairDensity: { score: number };
  scalpCondition: {
    oiliness?: number;
    dryness?: number;
    dandruff?: number;
    redness?: number;
    patchiness?: number;
    pigmentation?: number;
  };
}

export function computeHealthScore(result: HealthScoreInput): number {
  const density = result.hairDensity.score;
  const oiliness = result.scalpCondition.oiliness ?? 0;
  const dryness = result.scalpCondition.dryness ?? 0;
  const dandruff = result.scalpCondition.dandruff ?? 0;
  const redness = result.scalpCondition.redness ?? 0;
  const patchiness = result.scalpCondition.patchiness ?? 0;
  const pigmentation = result.scalpCondition.pigmentation ?? 0;

  const issuesPenalty = (
    oiliness * 0.2 + dryness * 0.2 + dandruff * 0.25 + redness * 0.15 + patchiness * 0.1 + pigmentation * 0.1
  );
  const raw = density * 0.55 + (100 - issuesPenalty) * 0.45;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function healthScoreColor(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#10b981';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

export type HealthScoreTier = 'excellent' | 'good' | 'fair' | 'needsAttention';

export function healthScoreTier(score: number): HealthScoreTier {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'needsAttention';
}
