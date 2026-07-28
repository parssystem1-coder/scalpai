import type { Analysis } from '../../db';
import type { QuestionnaireFieldKey } from '../../lib/medicalQuestionnaireSchema';

export interface TreatmentStep {
  id: string;
  title: string;
  description: string;
  duration: string;
  products: string;
  cost: string;
}

/** پراپ‌های مشترک تب‌هایی که روی تحلیل جاری کار می‌کنند */
export interface AnalysisFormProps {
  currentAnalysis: Partial<Analysis>;
  isReadOnly: boolean;
  updateQuestionnaire: (key: string, value: unknown) => void;
  /** کلید فیلدهایی که نسبت به مراجعه قبل تغییر کرده‌اند */
  changedFields?: QuestionnaireFieldKey[];
  /** نمایش سن/جنسیت — فقط در صفحهٔ مستقل پرسشنامه پزشکی */
  showDemographics?: boolean;
}

export interface ObservationsTabProps extends AnalysisFormProps {
  toggleObservation: (id: string) => void;
}

export interface RecommendationsTabProps {
  recommendations: string;
  isReadOnly: boolean;
  onChange: (value: string) => void;
}

export interface TreatmentTabProps {
  treatmentSteps: TreatmentStep[];
  isReadOnly: boolean;
  addTreatmentStep: () => void;
  updateTreatmentStep: (id: string, field: keyof TreatmentStep, value: string) => void;
  removeTreatmentStep: (id: string) => void;
}
