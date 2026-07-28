import type { ScalpHeuristicScores } from './scalpFeatures';
import {
  getScalpRegion,
  readScalpRegionFromMetadata,
  type ScalpRegionId,
} from './scalpRegions';
import {
  getTrichoscopeMode,
  readTrichoscopeModeFromMetadata,
  type TrichoscopeModeId,
} from './trichoscopeModes';

export interface AnalysisAcquisitionContext {
  regionId: ScalpRegionId | null;
  regionName: string | null;
  lensModeId: TrichoscopeModeId | null;
  lensModeName: string | null;
}

export function readAnalysisAcquisitionContext(
  metadata: Record<string, unknown> | undefined,
): AnalysisAcquisitionContext {
  const region = getScalpRegion(readScalpRegionFromMetadata(metadata));
  const mode = getTrichoscopeMode(readTrichoscopeModeFromMetadata(metadata));
  return {
    regionId: region?.id ?? null,
    regionName: region?.en ?? null,
    lensModeId: mode?.id ?? null,
    lensModeName: mode?.en ?? null,
  };
}

export function acquisitionContextPrompt(
  context: AnalysisAcquisitionContext,
): string {
  const mode = getTrichoscopeMode(context.lensModeId);
  const modeGuidance: Partial<Record<TrichoscopeModeId, string>> = {
    NL: 'Prioritize surface scale, shaft structure, follicular openings and visible density.',
    PL: 'Prioritize erythema, vascular patterns and subsurface inflammation; specular shine is suppressed.',
    UV: 'Prioritize fluorescence patterns suggesting porphyrins, microbial/fungal activity or deep sebum; do not treat the violet/blue cast as visible-light redness.',
    IR: 'Prioritize depth-related contrast, perfusion/moisture patterns and root structure; visible-spectrum redness and pigmentation are low-reliability.',
  };
  const regionGuidance: Partial<Record<ScalpRegionId, string>> = {
    hairline: 'Account for naturally greater scalp exposure at the hairline.',
    rightTemporal: 'Account for naturally lower temporal density; assess recession pattern rather than raw exposure alone.',
    leftTemporal: 'Account for naturally lower temporal density; assess recession pattern rather than raw exposure alone.',
    crown: 'Distinguish a normal crown whorl from true vertex thinning.',
    occipital: 'Use the occipital donor zone as a relatively high-density anatomical reference.',
  };
  return [
    `- Scalp region: ${context.regionName ?? 'Not specified'}`,
    `- Trichoscope lens / illumination mode: ${context.lensModeName ?? 'Not specified'}`,
    `- Mode purpose: ${mode?.useEn ?? 'Not specified'}`,
    `- Mode-specific interpretation: ${
      context.lensModeId ? modeGuidance[context.lensModeId] ?? 'Use standard trichoscopy interpretation.' : 'No mode-specific adjustment available.'
    }`,
    `- Region-specific interpretation: ${
      context.regionId ? regionGuidance[context.regionId] ?? 'Interpret findings in this recorded anatomical location.' : 'No region-specific adjustment available.'
    }`,
  ].join('\n');
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const towardNeutral = (value: number, reliability: number) =>
  clamp(50 + (value - 50) * reliability);

/**
 * Offline engines only see pixels. This applies conservative reliability
 * weighting for illumination-induced colour changes and anatomical density
 * normalization for the recorded scalp region.
 *
 * IMPORTANT — documented heuristic only:
 * - These coefficients are NOT clinically validated calibrations.
 * - They adjust image-derived scores for acquisition artefacts (lens/region),
 *   never for medical-history / medication context.
 * - Questionnaire data must use the separate interpretation layer
 *   (`questionnaireOfflineInterpretation.ts`) which adds flags/recommendations
 *   without mutating numeric scores.
 */
export function calibrateScoresForAcquisition(
  scores: ScalpHeuristicScores,
  context: AnalysisAcquisitionContext,
): ScalpHeuristicScores {
  const calibrated = { ...scores };

  switch (context.lensModeId) {
    case 'PL':
      // Polarization suppresses specular reflection; shine is less reliable.
      calibrated.shine = towardNeutral(calibrated.shine, 0.35);
      calibrated.oiliness = towardNeutral(calibrated.oiliness, 0.75);
      break;
    case 'UV':
      // UV false colour invalidates visible-light redness/pigment/brightness
      // assumptions. Keep only a small contribution instead of false certainty.
      calibrated.redness = towardNeutral(calibrated.redness, 0.2);
      calibrated.pigmentation = towardNeutral(calibrated.pigmentation, 0.2);
      calibrated.dryness = towardNeutral(calibrated.dryness, 0.25);
      calibrated.shine = towardNeutral(calibrated.shine, 0.25);
      calibrated.oiliness = towardNeutral(calibrated.oiliness, 0.45);
      calibrated.densityScore = towardNeutral(calibrated.densityScore, 0.65);
      break;
    case 'IR':
      // IR intensity is not visible-spectrum colour; colour-derived findings
      // are down-weighted while structural hair features remain useful.
      calibrated.redness = towardNeutral(calibrated.redness, 0.15);
      calibrated.pigmentation = towardNeutral(calibrated.pigmentation, 0.2);
      calibrated.dandruff = towardNeutral(calibrated.dandruff, 0.45);
      calibrated.dryness = towardNeutral(calibrated.dryness, 0.35);
      calibrated.shine = towardNeutral(calibrated.shine, 0.35);
      break;
    default:
      break;
  }

  // Conservative anatomical normalization: temples/hairline and the crown
  // naturally expose more scalp than the occipital donor zone.
  const densityOffset: Partial<Record<ScalpRegionId, number>> = {
    hairline: 6,
    rightTemporal: 8,
    leftTemporal: 8,
    crown: 5,
    frontal: 3,
    occipital: -4,
  };
  calibrated.densityScore = clamp(
    calibrated.densityScore + (context.regionId ? densityOffset[context.regionId] ?? 0 : 0),
  );

  for (const key of Object.keys(calibrated) as (keyof ScalpHeuristicScores)[]) {
    calibrated[key] = clamp(calibrated[key]);
  }
  return calibrated;
}
