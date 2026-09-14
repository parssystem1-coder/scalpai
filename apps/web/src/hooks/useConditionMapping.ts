import type { ConditionKey, SeverityLevel } from "@scalpai/education";
import type { Dispatch, SetStateAction } from "react";
import type { AnalyticsData } from "../components/sections/AnalyticsSection";
import type { Patient } from "../data/dashboard-types";

interface ConditionMappingParams {
  selectedPatient: Patient | null;
  aiResult: AnalyticsData;
  setEducationCondition: Dispatch<SetStateAction<ConditionKey>>;
  setEducationSeverity: Dispatch<SetStateAction<SeverityLevel>>;
  openEducation: () => void;
}

export function useConditionMapping({
  selectedPatient,
  aiResult,
  setEducationCondition,
  setEducationSeverity,
  openEducation,
}: ConditionMappingParams) {
  const conditionMatchers: Record<ConditionKey, string[]> = {
    seborrheic_dermatitis: ["سبورئیک", "seborrheic"],
    telogen_effluvium: ["تلوژن", "telogen"],
    folliculitis: ["فولیکولیت", "folliculitis"],
    hyperseborrhea: ["چرب", "sebum"],
    scalp_dryness: ["خشک", "dry"],
    androgenetic_alopecia: [],
    erythema: [],
    follicular_plugging: [],
  };

const handleOpenAiEducation = () => {
  // Match stored scalp-condition data, not translated UI copy.
  const conditionText = (selectedPatient?.scalpCondition ?? "").toLowerCase();
  let conditionKey: ConditionKey = "androgenetic_alopecia";

  for (const [key, matchers] of Object.entries(conditionMatchers)) {
    if (matchers.some((matcher) => conditionText.includes(matcher.toLowerCase()))) {
      conditionKey = key as ConditionKey;
      break;
    }
  }
  if (conditionKey === "androgenetic_alopecia" && aiResult.scores.redness > 35) {
    conditionKey = "seborrheic_dermatitis";
  }

    const severity: SeverityLevel =
      aiResult.severity < 20 ? "mild" : aiResult.severity > 45 ? "severe" : "moderate";

    setEducationCondition(conditionKey);
    setEducationSeverity(severity);
    openEducation();
  };

  return { handleOpenAiEducation };
}
