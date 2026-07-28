/**
 * aiResultConsistency.ts — فاز ۰٫۲
 *
 * تشخیص تناقض داخلی در پاسخ AI آنلاین: مواردی که امتیاز عددی گزارش‌شده با
 * تشخیص‌ها/ضایعات گزارش‌شده هم‌خوان نیست (مثلاً «شوره» به‌عنوان تشخیص آمده
 * ولی امتیاز شوره ۵ است، یا «ریزش شدید» با امتیاز تراکم ۹۰).
 *
 * سیاست عمدی: این تابع هرگز نتیجه را رد یا اصلاح نمی‌کند — فقط تناقض‌ها را
 * برمی‌گرداند تا در UI به کاربر/متخصص نشان داده شود و در نمونهٔ آموزشی ثبت شود.
 * دلیل: در پزشکی، «اصلاح خودکار خاموش» خطرناک‌تر از «هشدار شفاف» است.
 */

export type ConsistencyDirection = 'expectedHigh' | 'expectedLow';

export interface ConsistencyConflict {
  /** شناسهٔ تشخیصی که با امتیاز تناقض دارد */
  observation: string;
  /** نام امتیاز متناقض */
  scoreKey: string;
  /** مقدار امتیاز گزارش‌شده توسط AI */
  scoreValue: number;
  direction: ConsistencyDirection;
  /** آستانه‌ای که نقض شده */
  threshold: number;
  messageFa: string;
  messageEn: string;
}

export interface ConsistencyScores {
  oiliness?: number;
  dryness?: number;
  dandruff?: number;
  redness?: number;
  densityScore?: number;
  shine?: number;
  patchiness?: number;
  pigmentation?: number;
  hairThickness?: number;
}

interface Rule {
  observation: string;
  scoreKey: keyof ConsistencyScores;
  direction: ConsistencyDirection;
  /**
   * برای expectedHigh: اگر امتیاز کمتر از این باشد تناقض است.
   * برای expectedLow: اگر امتیاز بیشتر از این باشد تناقض است.
   */
  threshold: number;
  labelFa: string;
  labelEn: string;
}

/**
 * آستانه‌ها عمداً «سخت‌گیرانه نیستند» — فقط تناقض‌های آشکار را می‌گیرند،
 * نه اختلاف‌نظرهای بالینی ظریف. هدف: نرخ هشدار کاذب پایین.
 */
const RULES: Rule[] = [
  { observation: 'dandruff', scoreKey: 'dandruff', direction: 'expectedHigh', threshold: 20, labelFa: 'شوره', labelEn: 'dandruff' },
  { observation: 'seborrheicDermatitis', scoreKey: 'dandruff', direction: 'expectedHigh', threshold: 20, labelFa: 'درماتیت سبورئیک', labelEn: 'seborrheic dermatitis' },
  { observation: 'perifollicularScaling', scoreKey: 'dandruff', direction: 'expectedHigh', threshold: 15, labelFa: 'پوسته‌ریزی اطراف فولیکول', labelEn: 'perifollicular scaling' },
  { observation: 'oily', scoreKey: 'oiliness', direction: 'expectedHigh', threshold: 30, labelFa: 'چربی', labelEn: 'oiliness' },
  { observation: 'seborrhea', scoreKey: 'oiliness', direction: 'expectedHigh', threshold: 25, labelFa: 'سبوره', labelEn: 'seborrhea' },
  { observation: 'dry', scoreKey: 'dryness', direction: 'expectedHigh', threshold: 30, labelFa: 'خشکی', labelEn: 'dryness' },
  { observation: 'inflammation', scoreKey: 'redness', direction: 'expectedHigh', threshold: 25, labelFa: 'التهاب', labelEn: 'inflammation' },
  { observation: 'erythemaDiffuse', scoreKey: 'redness', direction: 'expectedHigh', threshold: 25, labelFa: 'اریتم منتشر', labelEn: 'diffuse erythema' },
  { observation: 'folliculitis', scoreKey: 'redness', direction: 'expectedHigh', threshold: 20, labelFa: 'فولیکولیت', labelEn: 'folliculitis' },
  { observation: 'psoriasis', scoreKey: 'dandruff', direction: 'expectedHigh', threshold: 20, labelFa: 'پسوریازیس', labelEn: 'psoriasis' },
  { observation: 'fungal', scoreKey: 'dandruff', direction: 'expectedHigh', threshold: 15, labelFa: 'عفونت قارچی', labelEn: 'fungal infection' },
  // تراکم: تشخیص ریزش با تراکم بالا متناقض است
  { observation: 'hairLoss', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 80, labelFa: 'ریزش مو', labelEn: 'hair loss' },
  { observation: 'alopecia', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 75, labelFa: 'آلوپسی', labelEn: 'alopecia' },
  { observation: 'androgenic', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 80, labelFa: 'ریزش آندروژنیک', labelEn: 'androgenic alopecia' },
  { observation: 'femalePattern', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 80, labelFa: 'الگوی زنانه', labelEn: 'female pattern' },
  { observation: 'telogen', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 85, labelFa: 'تلوژن افلوویوم', labelEn: 'telogen effluvium' },
  { observation: 'emptyFollicles', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 85, labelFa: 'فولیکول‌های خالی', labelEn: 'empty follicles' },
  { observation: 'scarring', scoreKey: 'densityScore', direction: 'expectedLow', threshold: 80, labelFa: 'آلوپسی اسکارساز', labelEn: 'scarring alopecia' },
  // ضخامت تار
  { observation: 'thinning', scoreKey: 'hairThickness', direction: 'expectedLow', threshold: 80, labelFa: 'نازک‌شدگی', labelEn: 'thinning' },
  { observation: 'miniaturization', scoreKey: 'hairThickness', direction: 'expectedLow', threshold: 75, labelFa: 'مینیاتوریزاسیون', labelEn: 'miniaturization' },
  // لکه‌ای بودن / نقاط تریکوسکوپی
  { observation: 'yellowDots', scoreKey: 'oiliness', direction: 'expectedHigh', threshold: 20, labelFa: 'نقاط زرد', labelEn: 'yellow dots' },
  { observation: 'whiteDots', scoreKey: 'patchiness', direction: 'expectedHigh', threshold: 20, labelFa: 'نقاط سفید', labelEn: 'white dots' },
];

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * تناقض‌های بین امتیازهای عددی و تشخیص‌های گزارش‌شده را برمی‌گرداند.
 * آرایهٔ خالی یعنی هیچ تناقض آشکاری پیدا نشد.
 */
export function detectScoreObservationConflicts(
  observations: string[] | undefined | null,
  scores: ConsistencyScores | undefined | null,
): ConsistencyConflict[] {
  if (!observations?.length || !scores) return [];
  const present = new Set(observations);
  const conflicts: ConsistencyConflict[] = [];

  for (const rule of RULES) {
    if (!present.has(rule.observation)) continue;
    const value = scores[rule.scoreKey];
    if (!isNum(value)) continue;

    const violated = rule.direction === 'expectedHigh'
      ? value < rule.threshold
      : value > rule.threshold;
    if (!violated) continue;

    const comparator = rule.direction === 'expectedHigh' ? 'کمتر از' : 'بیشتر از';
    const comparatorEn = rule.direction === 'expectedHigh' ? 'below' : 'above';
    conflicts.push({
      observation: rule.observation,
      scoreKey: rule.scoreKey,
      scoreValue: value,
      direction: rule.direction,
      threshold: rule.threshold,
      messageFa: `تشخیص «${rule.labelFa}» گزارش شده اما امتیاز مرتبط (${rule.scoreKey} = ${Math.round(value)}) ${comparator} حد انتظار (${rule.threshold}) است.`,
      messageEn: `Reported "${rule.labelEn}" but the related score (${rule.scoreKey} = ${Math.round(value)}) is ${comparatorEn} the expected threshold (${rule.threshold}).`,
    });
  }

  return conflicts;
}

/**
 * فاز ۳٫۵ — نشانه‌های پاسخی که احتمالاً بدون «دیدن واقعی تصویر» تولید شده.
 *
 * انگیزه: روترهای رایگان ممکن است درخواست را به مدلی بفرستند که vision ندارد
 * یا تصویر را نادیده می‌گیرد. چنین پاسخی از نظر ساختار JSON معتبر است و از
 * همهٔ اعتبارسنجی‌ها رد می‌شود، ولی محتوایش عمومی و بی‌ارتباط با تصویر است.
 *
 * این تابع فقط *نشانه* می‌دهد، نه حکم قطعی — به همین دلیل خروجی «دلایل» است
 * و تصمیم نهایی با کاربر.
 */
export interface GenericResponseSignal {
  suspicious: boolean;
  reasonsFa: string[];
  reasonsEn: string[];
}

export function detectGenericAiResponse(input: {
  lesions?: { type: string; confidence: number }[] | null;
  observations?: string[] | null;
  recommendations?: string[] | null;
  scores?: ConsistencyScores | null;
}): GenericResponseSignal {
  const reasonsFa: string[] = [];
  const reasonsEn: string[] = [];

  const lesions = input.lesions ?? [];
  const observations = input.observations ?? [];

  if (lesions.length === 0 && observations.length === 0) {
    reasonsFa.push('هیچ ضایعه و هیچ تشخیصی گزارش نشده است.');
    reasonsEn.push('No lesions and no diagnoses were reported.');
  }

  // مقادیر «گرد» و یکنواخت (همه ۵۰ یا همه مضرب ۱۰ و یکسان) نشانهٔ پاسخ کلیشه‌ای است
  const scoreValues = Object.values(input.scores ?? {}).filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v),
  );
  if (scoreValues.length >= 4) {
    const unique = new Set(scoreValues);
    if (unique.size === 1) {
      reasonsFa.push(`همهٔ امتیازها مقدار یکسان (${scoreValues[0]}) دارند.`);
      reasonsEn.push(`All scores share an identical value (${scoreValues[0]}).`);
    }
    const allRound = scoreValues.every(v => v % 10 === 0);
    if (allRound && unique.size <= 2) {
      reasonsFa.push('امتیازها بیش از حد گرد و کم‌تنوع‌اند.');
      reasonsEn.push('Scores are unusually round and lack variation.');
    }
  }

  if ((input.recommendations?.length ?? 0) === 0) {
    reasonsFa.push('هیچ توصیه‌ای برنگردانده شده است.');
    reasonsEn.push('No recommendations were returned.');
  }

  // اگر همهٔ ضایعات دقیقاً یک عدد اطمینان دارند، احتمالاً عدد ساختگی است
  if (lesions.length >= 3) {
    const confidences = new Set(lesions.map(l => l.confidence));
    if (confidences.size === 1) {
      reasonsFa.push('همهٔ ضایعات دقیقاً یک مقدار اطمینان دارند.');
      reasonsEn.push('All lesions share exactly the same confidence value.');
    }
  }

  // دو نشانه یا بیشتر → مشکوک. یک نشانه به‌تنهایی می‌تواند طبیعی باشد
  // (مثلاً تصویر واقعاً سالم است و ضایعه‌ای ندارد).
  return {
    suspicious: reasonsFa.length >= 2,
    reasonsFa,
    reasonsEn,
  };
}

/**
 * تناقض بین ضایعات (lesions) و تشخیص‌ها: ضایعه‌ای با اطمینان بالا گزارش شده
 * ولی نوع آن اصلاً در فهرست observations نیامده.
 */
export function detectLesionObservationGaps(
  lesions: { type: string; confidence: number }[] | undefined | null,
  observations: string[] | undefined | null,
  minConfidence = 0.6,
): string[] {
  if (!lesions?.length) return [];
  const present = new Set(observations ?? []);
  const gaps = new Set<string>();
  for (const l of lesions) {
    if ((l.confidence ?? 0) < minConfidence) continue;
    if (!l.type) continue;
    if (!present.has(l.type)) gaps.add(l.type);
  }
  return [...gaps];
}
