import type { ConditionKey, SeverityLevel } from "@scalpai/education";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
export function useConditionMapping({ selectedPatient, aiResult, setEducationCondition, setEducationSeverity, openEducation }: any) {
  const CONDITION_MATCHERS: Record<ConditionKey, string[]> = {
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
  // Map patient scalp condition or AI scores to 3D Education Storyboard & Severity.
  // NOTE: the matchers below are DATA matchers against the stored `scalpCondition`
  // free-text field, not UI copy — they stay out of i18n on purpose, otherwise
  // switching the UI language would change the diagnosis.
  // TODO: Migrate DB to store ConditionKey instead of free-text Persian strings.
  const condText = (selectedPatient?.scalpCondition || "").toLowerCase();
  let condKey: ConditionKey = "androgenetic_alopecia";

  for (const [key, matchers] of Object.entries(CONDITION_MATCHERS)) {
    if (matchers.some((m) => condText.includes(m.toLowerCase()))) {
      condKey = key as ConditionKey;
      break;
    }
  }
  if (condKey === "androgenetic_alopecia" && aiResult.scores.redness > 35) {
    condKey = "seborrheic_dermatitis";
  }

    let sev: SeverityLevel;
    if (aiResult.severity < 20) {
      sev = "mild";
    } else if (aiResult.severity > 45) {
      sev = "severe";
    } else {
      sev = "moderate";
    }

    setEducationCondition(condKey);
    setEducationSeverity(sev);
    openEducation();
  };

  return { handleOpenAiEducation };
}
