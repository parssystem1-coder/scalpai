/**
 * رمزگذاری پرسشنامه به بردار فیچر برای مدل محلی v4.
 *
 * اصول ضدنشت:
 * - شناسهٔ مشتری وارد نمی‌شود
 * - سن به‌صورت نرمال‌شدهٔ درشت (۰–۱) است نه شناسه
 * - شرایط/داروها multi-hot ثابت‌اند (بدون متن آزاد)
 * - پرچم تغییر نسبت به مراجعه قبل برای تمایز visit-level
 *
 * این بردار فقط وقتی به آموزش v4 می‌رود که حد نصاب نمونه/مشتری برقرار باشد
 * و مدل v4 روی holdout مبتنی بر مشتری از مدل تصویر-فقط بهتر شود.
 */
import {
  HISTORY_OPTIONS,
  MEDICATION_OPTIONS,
  PREVIOUS_TREATMENT_OPTIONS,
  normalizeQuestionnaireValues,
  type MedicalQuestionnaireStructured,
  type QuestionnaireFieldKey,
} from './medicalQuestionnaireSchema';

/** نسخهٔ فیچر تصویر+پرسشنامه — فعال نمی‌شود مگر برتری holdout اثبات شود */
export const FEATURE_VERSION_WITH_QUESTIONNAIRE = 'v4.1-observation-catalog';

/** حداقل نمونهٔ دارای پرسشنامه برای شروع آزمایش v4 */
export const MIN_QUESTIONNAIRE_SAMPLES_FOR_V4 = 30;
/** حداقل مشتری متمایز با پرسشنامه — برای جلوگیری از حفظ هویت */
export const MIN_QUESTIONNAIRE_CLIENTS_FOR_V4 = 5;

const CHANGE_FLAGS: QuestionnaireFieldKey[] = [
  'history',
  'medications',
  'allergies',
  'previousTreatments',
  'familyHistory',
  'stressLevel',
  'sleepQuality',
  'dietType',
  'lifestyle',
];

const STRESS = ['', 'low', 'medium', 'high'] as const;
const SLEEP = ['', 'good', 'moderate', 'poor'] as const;
const DIET = ['', 'balanced', 'vegetarian', 'lowProtein', 'fastFood'] as const;
const FAMILY = ['', 'none', 'father', 'mother', 'both'] as const;
const GENDER = ['', 'male', 'female'] as const;

function oneHot(options: readonly string[], value: string | undefined): number[] {
  const v = value || '';
  return options.map(option => (option === v ? 1 : 0));
}

function multiHot(
  catalog: { id: string }[],
  selected: string[] | undefined,
): number[] {
  const set = new Set(selected || []);
  // گزینهٔ other را نگه می‌داریم ولی متن آزاد را وارد نمی‌کنیم
  return catalog.map(option => (set.has(option.id) ? 1 : 0));
}

/** طول ثابت بردار پرسشنامه — اگر عوض شد FEATURE_VERSION_WITH_QUESTIONNAIRE را بالا ببر */
export function questionnaireFeatureSize(): number {
  return encodeQuestionnaireFeatures({}).length;
}

/**
 * رمزگذاری ساختاریافتهٔ پرسشنامه به بردار ۰/۱ و اسکالرهای نرمال.
 */
export function encodeQuestionnaireFeatures(
  values: MedicalQuestionnaireStructured | Record<string, unknown> | null | undefined,
  changedFields: string[] = [],
): number[] {
  const q = normalizeQuestionnaireValues(values ?? {});
  const ageNum = Number(q.age);
  const ageNorm = Number.isFinite(ageNum) ? Math.max(0, Math.min(1, ageNum / 100)) : 0;
  const changed = new Set(changedFields);

  return [
    ageNorm,
    ...oneHot(GENDER, q.gender || ''),
    ...multiHot(HISTORY_OPTIONS, q.history?.selected),
    ...multiHot(MEDICATION_OPTIONS, q.medications?.selected),
    ...multiHot(PREVIOUS_TREATMENT_OPTIONS, q.previousTreatments?.selected),
    ...oneHot(FAMILY, q.familyHistory),
    ...oneHot(STRESS, q.stressLevel),
    ...oneHot(SLEEP, q.sleepQuality),
    ...oneHot(DIET, q.dietType),
    // فقط وجود آلرژی/سبک‌زندگی — نه متن آزاد (ضدنشت و ضد نویز Prompt)
    (q.allergies || '').trim() ? 1 : 0,
    (q.lifestyle || '').trim() ? 1 : 0,
    ...CHANGE_FLAGS.map(key => (changed.has(key) ? 1 : 0)),
  ];
}

export function hasUsableQuestionnaireFeatures(vector: number[] | undefined | null): boolean {
  if (!vector || vector.length !== questionnaireFeatureSize()) return false;
  // حداقل یک سیگنال غیرصفر (غیر از همه صفر = بدون پرسشنامه)
  return vector.some(v => Math.abs(v) > 1e-9);
}

/** بردار پرسشنامه فقط اگر سیگنال قابل‌استفاده داشته باشد؛ وگرنه undefined */
export function buildQuestionnaireFeatureVector(
  values: MedicalQuestionnaireStructured | Record<string, unknown> | null | undefined,
  changedFields: string[] = [],
): number[] | undefined {
  const vector = encodeQuestionnaireFeatures(values, changedFields);
  return hasUsableQuestionnaireFeatures(vector) ? vector : undefined;
}

export function zeroQuestionnaireFeatures(): number[] {
  return new Array(questionnaireFeatureSize()).fill(0);
}
