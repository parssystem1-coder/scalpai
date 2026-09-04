export type ConditionKey =
  | "androgenetic_alopecia"
  | "telogen_effluvium"
  | "seborrheic_dermatitis"
  | "folliculitis"
  | "hyperseborrhea"
  | "scalp_dryness"
  | "erythema"
  | "follicular_plugging";

export type SeverityLevel = "mild" | "moderate" | "severe";

export interface StoryboardNarration {
  fa: string;
  en: string;
}

export interface StoryboardDefinition {
  id: ConditionKey;
  title: { fa: string; en: string };
  scene: string;
  cameraPath: string[];
  highlight: string;
  reviewedBy: string; // Mandatory scientific reviewer per §11
  disclaimer: { fa: string; en: string };
  severityRules: {
    mild: {
      thresholdMin: number;
      thresholdMax: number;
      visualState: number; // e.g. state-machine input 1
      narration: StoryboardNarration;
    };
    moderate: {
      thresholdMin: number;
      thresholdMax: number;
      visualState: number; // e.g. state-machine input 2
      narration: StoryboardNarration;
    };
    severe: {
      thresholdMin: number;
      thresholdMax: number;
      visualState: number; // e.g. state-machine input 3
      narration: StoryboardNarration;
    };
  };
}

export interface ClinicalAnalysisInput {
  hairLossScore?: number; // 0..100
  hairDiameterDiversity?: number; // 0..100 (%)
  telogenFraction?: number; // 0..100 (%)
  rednessScore?: number; // 0..100 (erythema)
  sebumScore?: number; // 0..100 (hyperseborrhea vs dryness)
  scalingScore?: number; // 0..100 (seborrheic flakes)
  follicularInflammation?: number; // 0..100 (folliculitis)
  pluggingCount?: number; // count or 0..100 (keratotic plugs)
}

export interface MappedStoryboard {
  condition: ConditionKey;
  definition: StoryboardDefinition;
  severity: SeverityLevel;
  score: number;
  stateMachineInput: number;
  currentNarration: StoryboardNarration;
}
