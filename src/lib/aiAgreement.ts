/**
 * aiAgreement.ts — فاز ۳٫۱
 *
 * سنجش «AI آنلاین چقدر با متخصص توافق دارد؟».
 *
 * تا پیش از این، پروژه هیچ عدد واقعی‌ای دربارهٔ دقت تحلیل آنلاین نداشت؛ تنها
 * سیگنال موجود «تأیید/عدم تأیید» باینری بود. اینجا برای نمونه‌هایی که ابتدا
 * برچسب AI داشتند و بعد متخصص اصلاحشان کرده (`originalAiLabel` پر است)،
 * اختلاف عددی امتیازها و اختلاف مجموعهٔ تشخیص‌ها محاسبه می‌شود.
 *
 * محدودیت صادقانه: این عدد فقط روی نمونه‌هایی محاسبه می‌شود که متخصص واقعاً
 * بازبینی کرده است — یعنی سوگیری انتخاب دارد (معمولاً موارد مشکوک‌تر بازبینی
 * می‌شوند). این نکته باید در UI هم به کاربر گفته شود.
 */

export interface AgreementScoreKeyStat {
  key: string;
  /** میانگین قدرمطلق خطا در مقیاس ۰–۱۰۰ */
  mae: number;
  /** میانگین خطای علامت‌دار: مثبت یعنی AI بیش‌برآورد کرده */
  bias: number;
  count: number;
}

export interface AgreementLabelStat {
  id: string;
  /** دفعاتی که متخصص این تشخیص را تأیید کرده (هر دو داشتند) */
  agreed: number;
  /** AI گفته ولی متخصص حذف کرده (مثبت کاذب) */
  aiOnly: number;
  /** متخصص افزوده ولی AI ندیده (منفی کاذب) */
  expertOnly: number;
}

export interface AiAgreementReport {
  /** تعداد نمونه‌هایی که مبنای این گزارش‌اند */
  sampleCount: number;
  /** MAE کلی روی همهٔ امتیازها */
  overallMae: number;
  perScore: AgreementScoreKeyStat[];
  /** F1 مجموعهٔ تشخیص‌های AI در برابر متخصص (متخصص = مرجع) */
  observationF1: number;
  observationPrecision: number;
  observationRecall: number;
  perLabel: AgreementLabelStat[];
  /** نمونه‌هایی که متخصص هیچ تغییری در تشخیص‌ها نداده */
  unchangedObservationCount: number;
}

export const AGREEMENT_SCORE_KEYS = [
  'oiliness', 'dryness', 'dandruff', 'redness', 'densityScore',
  'shine', 'patchiness', 'pigmentation', 'hairThickness',
] as const;

export type AgreementScoreKey = (typeof AGREEMENT_SCORE_KEYS)[number];

/**
 * حداقل شکل لازم از برچسب. عمداً بدون index signature تعریف شده تا
 * `TrainingSampleLabel` (که index signature ندارد) هم بپذیرد؛ شاخص‌های عددی
 * با `readScore` به‌صورت امن خوانده می‌شوند.
 */
interface LabelLike {
  observations?: string[];
  lesions?: { type: string }[];
}

/** خواندن امن یک شاخص عددی از برچسب، بدون نیاز به index signature */
function readScore(label: LabelLike | null | undefined, key: string): unknown {
  return (label as unknown as Record<string, unknown> | null | undefined)?.[key];
}

export interface AgreementSampleLike {
  labelSource?: string;
  label?: LabelLike | null;
  originalAiLabel?: LabelLike | null;
}

/** مجموعهٔ تشخیص‌ها = observations + نوع ضایعات (همان قاعدهٔ آموزش مدل) */
function labelObservationSet(label: LabelLike | null | undefined): Set<string> {
  if (!label) return new Set();
  const ids = [
    ...(label.observations ?? []),
    ...((label.lesions ?? []).map(l => l?.type).filter(Boolean) as string[]),
  ];
  return new Set(ids);
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * نمونه‌هایی که هم برچسب اولیهٔ AI دارند و هم برچسب نهایی متخصص.
 * فقط این‌ها برای سنجش توافق معتبرند.
 */
export function selectAgreementSamples<T extends AgreementSampleLike>(samples: T[] | null | undefined): T[] {
  if (!samples?.length) return [];
  return samples.filter(s =>
    !!s.originalAiLabel
    && !!s.label
    && s.labelSource === 'expert',
  );
}

/**
 * گزارش توافق AI آنلاین با متخصص.
 * اگر نمونهٔ واجد شرایطی نباشد، `sampleCount = 0` برمی‌گردد (UI باید این
 * حالت را صریحاً به‌عنوان «هنوز داده کافی نیست» نشان دهد، نه «دقت صفر»).
 */
export function buildAiAgreementReport(
  samples: AgreementSampleLike[] | null | undefined,
): AiAgreementReport {
  const eligible = selectAgreementSamples(samples ?? []);

  const empty: AiAgreementReport = {
    sampleCount: 0,
    overallMae: 0,
    perScore: [],
    observationF1: 0,
    observationPrecision: 0,
    observationRecall: 0,
    perLabel: [],
    unchangedObservationCount: 0,
  };
  if (!eligible.length) return empty;

  // --- امتیازهای عددی ---
  const perScore: AgreementScoreKeyStat[] = [];
  let totalAbs = 0;
  let totalCount = 0;

  for (const key of AGREEMENT_SCORE_KEYS) {
    let absSum = 0;
    let signedSum = 0;
    let count = 0;
    for (const s of eligible) {
      const ai = numOrNull(readScore(s.originalAiLabel, key));
      const expert = numOrNull(readScore(s.label, key));
      // اگر AI اصلاً این شاخص را برنگردانده، مقایسه بی‌معناست
      if (ai === null || expert === null) continue;
      absSum += Math.abs(ai - expert);
      signedSum += ai - expert;
      count++;
    }
    if (count === 0) continue;
    perScore.push({
      key,
      mae: absSum / count,
      bias: signedSum / count,
      count,
    });
    totalAbs += absSum;
    totalCount += count;
  }

  // --- تشخیص‌ها ---
  const labelStats = new Map<string, AgreementLabelStat>();
  const bump = (id: string, field: keyof Omit<AgreementLabelStat, 'id'>) => {
    const cur = labelStats.get(id) ?? { id, agreed: 0, aiOnly: 0, expertOnly: 0 };
    cur[field] += 1;
    labelStats.set(id, cur);
  };

  let tp = 0, fp = 0, fn = 0, unchanged = 0;
  for (const s of eligible) {
    const aiSet = labelObservationSet(s.originalAiLabel);
    const expertSet = labelObservationSet(s.label);

    let changed = false;
    for (const id of aiSet) {
      if (expertSet.has(id)) { tp++; bump(id, 'agreed'); }
      else { fp++; bump(id, 'aiOnly'); changed = true; }
    }
    for (const id of expertSet) {
      if (!aiSet.has(id)) { fn++; bump(id, 'expertOnly'); changed = true; }
    }
    if (!changed) unchanged++;
  }

  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    sampleCount: eligible.length,
    overallMae: totalCount ? totalAbs / totalCount : 0,
    perScore: perScore.sort((a, b) => b.mae - a.mae),
    observationF1: f1,
    observationPrecision: precision,
    observationRecall: recall,
    perLabel: [...labelStats.values()].sort(
      (a, b) => (b.aiOnly + b.expertOnly) - (a.aiOnly + a.expertOnly),
    ),
    unchangedObservationCount: unchanged,
  };
}
