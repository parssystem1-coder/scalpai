/**
 * ساخت بلوک Prompt پرسشنامه برای تحلیل آنلاین + پاک‌سازی متن آزاد.
 * دادهٔ پزشکی فقط وقتی به سرویس ابری می‌رود که کاربر در تنظیمات رضایت داده باشد.
 */
import type { Client, QuestionnaireRevision } from '../db';
import {
  HISTORY_OPTIONS,
  MEDICATION_OPTIONS,
  PREVIOUS_TREATMENT_OPTIONS,
  QUESTIONNAIRE_COMPARE_KEYS,
  normalizeQuestionnaireValues,
  type CatalogOption,
  type MedicalQuestionnaireStructured,
  type QuestionnaireFieldKey,
  type StructuredListValue,
} from './medicalQuestionnaireSchema';

const FREE_TEXT_MAX = 220;
const TOTAL_PROMPT_MAX = 1600;

export interface QuestionnaireAiContext {
  revisionId: string | null;
  status: QuestionnaireRevision['status'] | null;
  values: MedicalQuestionnaireStructured;
  changedFields: QuestionnaireFieldKey[];
  /** آیا این داده واقعاً داخل Prompt ابری قرار گرفت */
  includedInPrompt: boolean;
}

const FIELD_LABELS: Record<QuestionnaireFieldKey, string> = {
  age: 'Age',
  gender: 'Gender',
  history: 'Medical history',
  medications: 'Current medications',
  allergies: 'Allergies',
  previousTreatments: 'Previous hair treatments',
  familyHistory: 'Family history of hair loss',
  stressLevel: 'Stress level',
  sleepQuality: 'Sleep quality',
  dietType: 'Diet type',
  lifestyle: 'Lifestyle & habits',
};

const SCALAR_LABELS: Partial<Record<QuestionnaireFieldKey, Record<string, string>>> = {
  gender: { male: 'Male', female: 'Female' },
  familyHistory: { none: 'None', father: 'Father', mother: 'Mother', both: 'Both parents' },
  stressLevel: { low: 'Low', medium: 'Medium', high: 'High' },
  sleepQuality: { good: 'Good', moderate: 'Moderate', poor: 'Poor' },
  dietType: {
    balanced: 'Balanced',
    vegetarian: 'Vegetarian',
    lowProtein: 'Low protein',
    fastFood: 'High fast food',
  },
};

/** حذف کاراکترهای کنترلی و محدود کردن طول متن آزاد */
export function sanitizePromptText(raw: string, maxLen = FREE_TEXT_MAX): string {
  const cleaned = Array.from(String(raw || ''))
    .map(ch => {
      const code = ch.charCodeAt(0);
      // حذف کنترل‌کاراکترها به‌جز تب و فاصلهٔ معمولی؛ newline به فاصله تبدیل می‌شود
      if (code < 32 || code === 127) return ' ';
      return ch;
    })
    .join('')
    .replace(/`{3,}/g, "'''")
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxLen);
}

function optionLabel(options: CatalogOption[], id: string): string {
  return options.find(option => option.id === id)?.en ?? id;
}

function formatList(value: StructuredListValue | undefined, options: CatalogOption[]): string {
  if (!value || value.selected.length === 0) return 'Not specified';
  const parts = value.selected.map(id => {
    if (id === 'other') {
      const other = sanitizePromptText(value.other);
      return other ? `Other (${other})` : 'Other';
    }
    return optionLabel(options, id);
  });
  return parts.join(', ');
}

function formatScalar(key: QuestionnaireFieldKey, value: string | undefined): string {
  if (!value) return 'Not specified';
  const map = SCALAR_LABELS[key];
  if (map?.[value]) return map[value];
  return sanitizePromptText(value, 80);
}

function hasMeaningfulQuestionnaire(values: MedicalQuestionnaireStructured): boolean {
  if (values.age || values.gender) return true;
  if ((values.allergies || '').trim() || (values.lifestyle || '').trim()) return true;
  for (const key of ['history', 'medications', 'previousTreatments'] as const) {
    if ((values[key]?.selected.length || 0) > 0) return true;
  }
  return Boolean(
    values.familyHistory || values.stressLevel || values.sleepQuality || values.dietType,
  );
}

export function buildQuestionnaireAiContext(input: {
  revision: QuestionnaireRevision | null;
  values?: MedicalQuestionnaireStructured | Record<string, unknown> | null;
  changedFields?: string[] | null;
  includedInPrompt: boolean;
}): QuestionnaireAiContext {
  const values = normalizeQuestionnaireValues(input.values ?? input.revision?.values ?? {});
  const changed = (input.changedFields ?? input.revision?.changedFields ?? []).filter(
    (key): key is QuestionnaireFieldKey =>
      QUESTIONNAIRE_COMPARE_KEYS.includes(key as QuestionnaireFieldKey),
  );
  return {
    revisionId: input.revision?.id ?? null,
    status: input.revision?.status ?? null,
    values,
    changedFields: changed,
    includedInPrompt: input.includedInPrompt,
  };
}

/**
 * بلوک متنی برای Prompt. اگر داده معناداری نباشد رشتهٔ خالی برمی‌گرداند.
 * age/gender از پرسشنامه اولویت دارند؛ در غیر این صورت از پروفایل مشتری.
 */
export function questionnaireContextPrompt(
  context: QuestionnaireAiContext | null | undefined,
  client?: Pick<Client, 'gender' | 'birthDate'> | null,
): string {
  if (!context || !context.includedInPrompt) return '';

  const values = context.values;
  const age =
    sanitizePromptText(values.age || '', 8) ||
    (client?.birthDate
      ? String(Math.floor((Date.now() - new Date(client.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)))
      : '');
  const gender =
    formatScalar('gender', values.gender || '') !== 'Not specified'
      ? formatScalar('gender', values.gender || '')
      : client?.gender === 'male'
        ? 'Male'
        : client?.gender === 'female'
          ? 'Female'
          : 'Not specified';

  if (!hasMeaningfulQuestionnaire(values) && age === '' && gender === 'Not specified') {
    return '';
  }

  const lines = [
    'Medical Questionnaire Context (use as clinical background; do not invent findings not visible in the image):',
    `- Age: ${age || 'Not specified'}`,
    `- Gender: ${gender}`,
    `- Medical history: ${formatList(values.history, HISTORY_OPTIONS)}`,
    `- Current medications: ${formatList(values.medications, MEDICATION_OPTIONS)}`,
    `- Allergies: ${sanitizePromptText(values.allergies || '') || 'Not specified'}`,
    `- Previous hair treatments: ${formatList(values.previousTreatments, PREVIOUS_TREATMENT_OPTIONS)}`,
    `- Family history of hair loss: ${formatScalar('familyHistory', values.familyHistory)}`,
    `- Stress level: ${formatScalar('stressLevel', values.stressLevel)}`,
    `- Sleep quality: ${formatScalar('sleepQuality', values.sleepQuality)}`,
    `- Diet type: ${formatScalar('dietType', values.dietType)}`,
    `- Lifestyle & habits: ${sanitizePromptText(values.lifestyle || '') || 'Not specified'}`,
  ];

  if (context.changedFields.length > 0) {
    const labels = context.changedFields.map(key => FIELD_LABELS[key]);
    lines.push(
      `- Changes since previous finalized visit: ${labels.join(', ')}`,
      '- Give extra attention to newly changed history/medications/treatments when forming recommendations.',
    );
  } else if (context.status === 'final') {
    lines.push('- No field-level changes recorded versus the previous finalized visit.');
  } else if (context.status === 'draft') {
    lines.push('- Questionnaire status: draft (not yet finalized for this visit).');
  }

  lines.push(
    '- Recommendations must remain image-grounded; questionnaire only modulates clinical priority and differential emphasis.',
  );

  let block = lines.join('\n');
  if (block.length > TOTAL_PROMPT_MAX) {
    block = `${block.slice(0, TOTAL_PROMPT_MAX - 20)}\n[truncated]`;
  }
  return block;
}
