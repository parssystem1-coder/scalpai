import type {
  ClinicalAnalysisInput,
  ConditionKey,
  MappedStoryboard,
  SeverityLevel,
  StoryboardDefinition,
} from "./types.js";
import { CLINICAL_STORYBOARDS } from "./storyboards.js";

function calculateSeverity(score: number, def: StoryboardDefinition): {
  severity: SeverityLevel;
  stateMachineInput: number;
  narration: { fa: string; en: string };
} {
  if (score >= def.severityRules.severe.thresholdMin) {
    return {
      severity: "severe",
      stateMachineInput: def.severityRules.severe.visualState,
      narration: def.severityRules.severe.narration,
    };
  }
  if (score >= def.severityRules.moderate.thresholdMin) {
    return {
      severity: "moderate",
      stateMachineInput: def.severityRules.moderate.visualState,
      narration: def.severityRules.moderate.narration,
    };
  }
  return {
    severity: "mild",
    stateMachineInput: def.severityRules.mild.visualState,
    narration: def.severityRules.mild.narration,
  };
}

export function mapAnalysisToStoryboards(input: ClinicalAnalysisInput): MappedStoryboard[] {
  const mapped: MappedStoryboard[] = [];

  const checkCondition = (key: ConditionKey, rawScore: number | undefined, triggerThreshold: number) => {
    const score = Math.max(0, Math.min(100, rawScore ?? 0));
    if (score >= triggerThreshold) {
      const def = CLINICAL_STORYBOARDS[key];
      const { severity, stateMachineInput, narration } = calculateSeverity(score, def);
      mapped.push({
        condition: key,
        definition: def,
        severity,
        score,
        stateMachineInput,
        currentNarration: narration,
      });
    }
  };

  // 1. Androgenetic Alopecia (hair loss score or hair diameter diversity)
  const agaScore = Math.max(input.hairLossScore ?? 0, (input.hairDiameterDiversity ?? 0) * 1.2);
  checkCondition("androgenetic_alopecia", agaScore, 15);

  // 2. Telogen Effluvium (telogen shed fraction)
  checkCondition("telogen_effluvium", input.telogenFraction, 20);

  // 3. Seborrheic Dermatitis (scaling score)
  checkCondition("seborrheic_dermatitis", input.scalingScore, 15);

  // 4. Folliculitis (follicular inflammation)
  checkCondition("folliculitis", input.follicularInflammation, 20);

  // 5. Hyperseborrhea (elevated sebum)
  checkCondition("hyperseborrhea", input.sebumScore, 40);

  // 6. Scalp Dryness (if sebum is critically depleted or dryness reported)
  if (input.sebumScore !== undefined && input.sebumScore < 30) {
    const drynessScore = Math.round((30 - input.sebumScore) * 3.3);
    checkCondition("scalp_dryness", drynessScore, 20);
  }

  // 7. Erythema (redness score)
  checkCondition("erythema", input.rednessScore, 15);

  // 8. Follicular Plugging (plugging count / score)
  checkCondition("follicular_plugging", input.pluggingCount, 20);

  // Sort by highest score first (highest clinical urgency)
  mapped.sort((a, b) => b.score - a.score);

  // If no condition crossed trigger, provide the primary AGA storyboard as baseline educational scene
  if (mapped.length === 0) {
    const defaultDef = CLINICAL_STORYBOARDS.androgenetic_alopecia;
    const { severity, stateMachineInput, narration } = calculateSeverity(20, defaultDef);
    mapped.push({
      condition: "androgenetic_alopecia",
      definition: defaultDef,
      severity,
      score: 20,
      stateMachineInput,
      currentNarration: narration,
    });
  }

  return mapped;
}

export function getStoryboardWithSeverity(
  key: ConditionKey,
  severity: SeverityLevel
): MappedStoryboard {
  const def = CLINICAL_STORYBOARDS[key];
  const rule = def.severityRules[severity];
  const midScore = Math.round((rule.thresholdMin + rule.thresholdMax) / 2);

  return {
    condition: key,
    definition: def,
    severity,
    score: midScore,
    stateMachineInput: rule.visualState,
    currentNarration: rule.narration,
  };
}

export function getAllStoryboardsList(): StoryboardDefinition[] {
  return Object.values(CLINICAL_STORYBOARDS);
}
