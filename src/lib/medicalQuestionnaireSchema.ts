/**
 * اسکیمای ساختاریافتهٔ پرسشنامهٔ پزشکی + مقایسهٔ تغییرات بین مراجعات.
 * فیلدهای چندانتخابی (سابقه / دارو / درمان قبلی) به‌جای متن آزاد ذخیره می‌شوند
 * تا Diff و یادگیری ماشین قابل اتکا باشند؛ گزینهٔ «سایر» متن آزاد نگه می‌دارد.
 */

export type QuestionnaireFieldKey =
  | 'age'
  | 'gender'
  | 'history'
  | 'medications'
  | 'allergies'
  | 'previousTreatments'
  | 'familyHistory'
  | 'stressLevel'
  | 'sleepQuality'
  | 'dietType'
  | 'lifestyle';

/** فیلد چندانتخابی: شناسه‌های انتخاب‌شده + متن آزاد برای «سایر» */
export interface StructuredListValue {
  selected: string[];
  other: string;
}

export interface MedicalQuestionnaireStructured {
  age?: string;
  gender?: 'male' | 'female' | '';
  history?: StructuredListValue;
  medications?: StructuredListValue;
  allergies?: string;
  previousTreatments?: StructuredListValue;
  familyHistory?: string;
  stressLevel?: string;
  sleepQuality?: string;
  dietType?: string;
  lifestyle?: string;
}

export type MedicalQuestionnaireValues = MedicalQuestionnaireStructured;

/** تبدیل به Record برای ذخیره در لایهٔ دیتابیس */
export function toQuestionnaireRecord(
  values: MedicalQuestionnaireStructured,
): Record<string, unknown> {
  return { ...values };
}

export interface CatalogOption {
  id: string;
  fa: string;
  en: string;
}

export const HISTORY_OPTIONS: CatalogOption[] = [
  { id: 'none', fa: 'ندارد', en: 'None' },
  { id: 'thyroid', fa: 'اختلال تیروئید', en: 'Thyroid disorder' },
  { id: 'pcos', fa: 'PCOS / سندرم تخمدان پلی‌کیستیک', en: 'PCOS' },
  { id: 'anemia', fa: 'کم‌خونی', en: 'Anemia' },
  { id: 'diabetes', fa: 'دیابت', en: 'Diabetes' },
  { id: 'autoimmune', fa: 'بیماری خودایمنی', en: 'Autoimmune disease' },
  { id: 'hormonal', fa: 'اختلال هورمونی', en: 'Hormonal imbalance' },
  { id: 'scalpInfection', fa: 'عفونت پوست سر', en: 'Scalp infection' },
  { id: 'other', fa: 'سایر', en: 'Other' },
];

export const MEDICATION_OPTIONS: CatalogOption[] = [
  { id: 'none', fa: 'ندارد', en: 'None' },
  { id: 'minoxidil', fa: 'ماینوکسیدیل', en: 'Minoxidil' },
  { id: 'finasteride', fa: 'فیناستراید / دوتاستراید', en: 'Finasteride / Dutasteride' },
  { id: 'contraceptives', fa: 'قرص ضدبارداری', en: 'Oral contraceptives' },
  { id: 'thyroidMeds', fa: 'داروی تیروئید', en: 'Thyroid medication' },
  { id: 'steroids', fa: 'کورتون / استروئید', en: 'Steroids' },
  { id: 'supplements', fa: 'مکمل ویتامین / آهن', en: 'Vitamins / iron supplements' },
  { id: 'other', fa: 'سایر', en: 'Other' },
];

export const PREVIOUS_TREATMENT_OPTIONS: CatalogOption[] = [
  { id: 'none', fa: 'ندارد', en: 'None' },
  { id: 'minoxidilTopical', fa: 'ماینوکسیدیل موضعی', en: 'Topical minoxidil' },
  { id: 'prp', fa: 'PRP', en: 'PRP' },
  { id: 'mesotherapy', fa: 'مزوتراپی', en: 'Mesotherapy' },
  { id: 'transplant', fa: 'کاشت مو', en: 'Hair transplant' },
  { id: 'laser', fa: 'لیزر کم‌توان', en: 'Low-level laser' },
  { id: 'topicalSteroids', fa: 'کورتون موضعی', en: 'Topical steroids' },
  { id: 'other', fa: 'سایر', en: 'Other' },
];

export const STRUCTURED_LIST_FIELDS = ['history', 'medications', 'previousTreatments'] as const;
export type StructuredListFieldKey = (typeof STRUCTURED_LIST_FIELDS)[number];

export const QUESTIONNAIRE_COMPARE_KEYS: QuestionnaireFieldKey[] = [
  'age',
  'gender',
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

/** کلیدهایی که در تب تریکولوژیست برای نشان «تغییر» نمایش داده می‌شوند (بدون سن/جنسیت) */
export const TRICHO_CHANGE_MARKER_KEYS: QuestionnaireFieldKey[] = QUESTIONNAIRE_COMPARE_KEYS.filter(
  key => key !== 'age' && key !== 'gender',
);

function emptyList(): StructuredListValue {
  return { selected: [], other: '' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** تبدیل متن آزاد قدیمی یا شکل ناقص به StructuredListValue */
export function normalizeStructuredList(raw: unknown): StructuredListValue {
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return emptyList();
    return { selected: ['other'], other: text };
  }
  if (Array.isArray(raw)) {
    return {
      selected: raw.filter((id): id is string => typeof id === 'string'),
      other: '',
    };
  }
  if (isRecord(raw)) {
    const selected = Array.isArray(raw.selected)
      ? raw.selected.filter((id): id is string => typeof id === 'string')
      : [];
    const other = typeof raw.other === 'string' ? raw.other : '';
    return { selected, other };
  }
  return emptyList();
}

function normalizeGender(raw: unknown): MedicalQuestionnaireStructured['gender'] {
  return raw === 'male' || raw === 'female' ? raw : '';
}

/** نرمال‌سازی هر شکل ذخیره‌شده (قدیم یا جدید) به اسکیمای فعلی */
export function normalizeQuestionnaireValues(raw: unknown): MedicalQuestionnaireStructured {
  const source = isRecord(raw) ? raw : {};
  return {
    age: source.age == null || source.age === '' ? '' : String(source.age),
    gender: normalizeGender(source.gender),
    history: normalizeStructuredList(source.history),
    medications: normalizeStructuredList(source.medications),
    allergies: typeof source.allergies === 'string' ? source.allergies : '',
    previousTreatments: normalizeStructuredList(source.previousTreatments),
    familyHistory: typeof source.familyHistory === 'string' ? source.familyHistory : '',
    stressLevel: typeof source.stressLevel === 'string' ? source.stressLevel : '',
    sleepQuality: typeof source.sleepQuality === 'string' ? source.sleepQuality : '',
    dietType: typeof source.dietType === 'string' ? source.dietType : '',
    lifestyle: typeof source.lifestyle === 'string' ? source.lifestyle : '',
  };
}

function canonicalizeList(value: StructuredListValue): string {
  const selected = [...new Set(value.selected)].sort();
  const other = selected.includes('other') ? value.other.trim() : '';
  return JSON.stringify({ selected, other });
}

function fieldComparable(key: QuestionnaireFieldKey, values: MedicalQuestionnaireStructured): string {
  if (key === 'history' || key === 'medications' || key === 'previousTreatments') {
    return canonicalizeList(values[key] || emptyList());
  }
  const scalar = values[key];
  return typeof scalar === 'string' ? scalar.trim() : '';
}

/**
 * Diff بین نسخهٔ final قبلی و مقادیر فعلی.
 * فقط فیلدهایی که واقعاً عوض شده‌اند برمی‌گردند.
 */
export function diffQuestionnaireFields(
  previous: unknown | null | undefined,
  current: unknown,
): QuestionnaireFieldKey[] {
  const prev = normalizeQuestionnaireValues(previous ?? {});
  const curr = normalizeQuestionnaireValues(current);
  return QUESTIONNAIRE_COMPARE_KEYS.filter(key => fieldComparable(key, prev) !== fieldComparable(key, curr));
}

/** تاگل یک گزینه در فیلد چندانتخابی؛ «ندارد» با بقیه ناسازگار است */
export function toggleStructuredOption(
  current: StructuredListValue,
  optionId: string,
): StructuredListValue {
  const has = current.selected.includes(optionId);
  if (optionId === 'none') {
    return has
      ? { selected: [], other: '' }
      : { selected: ['none'], other: '' };
  }
  let selected = current.selected.filter(id => id !== 'none');
  if (has) selected = selected.filter(id => id !== optionId);
  else selected = [...selected, optionId];
  return {
    selected,
    other: selected.includes('other') ? current.other : '',
  };
}

export function catalogOptionsFor(field: StructuredListFieldKey): CatalogOption[] {
  if (field === 'history') return HISTORY_OPTIONS;
  if (field === 'medications') return MEDICATION_OPTIONS;
  return PREVIOUS_TREATMENT_OPTIONS;
}
