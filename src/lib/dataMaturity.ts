/**
 * dataMaturity.ts — فاز ۴
 *
 * «سیستم هشدار بلوغ داده».
 *
 * چرا این ماژول وجود دارد؟
 * تقریباً همهٔ عددهای این پروژه (آستانه‌های heuristic، کالیبراسیون لنز، وزن
 * کلاس‌ها، آستانهٔ تشخیص، حاشیهٔ گیت بازآموزی) بر پایهٔ *تخمین مهندسی* انتخاب
 * شده‌اند، نه بر پایهٔ داده واقعی — چون در زمان نوشتن، داده‌ای وجود نداشت.
 *
 * خطر واقعی این است که با گذشت زمان فراموش شود این اعداد موقتی‌اند و تیم با
 * آن‌ها مثل حقیقت قطعی رفتار کند. این ماژول آن فراموشی را غیرممکن می‌کند:
 * تا وقتی داده به حد نصاب نرسیده، هشدار «نیازمند کالیبراسیون مجدد با داده
 * واقعی» به‌صورت دائمی در UI دیده می‌شود، و وقتی داده کافی جمع شد، پیام به
 * «آمادهٔ بازبینی است» تغییر می‌کند.
 *
 * این ماژول عمداً هیچ رفتاری را تغییر نمی‌دهد و فقط گزارش می‌دهد.
 */

/** حد نصاب‌های داده برای اینکه یک تصمیم «قابل کالیبره‌شدن با داده» شود */
export const MATURITY_TARGETS = {
  /** نمونهٔ آموزشی واجد شرایط برای بازبینی آستانه‌های heuristic */
  heuristicCalibrationSamples: 150,
  /** نمونهٔ بازبینی‌شده توسط متخصص برای سنجش معنادار دقت AI آنلاین */
  aiAgreementSamples: 60,
  /** حداقل مشتری مستقل تا ارزیابی، تعمیم‌پذیر تلقی شود */
  distinctClients: 25,
  /** نمونهٔ مثبت هر برچسب تا آن برچسب قابل یادگیری شود */
  perLabelPositives: 8,
  /** نمونه لازم پیش از آنکه ارتقای مدل تصویری (embedding) منطقی باشد */
  embeddingReadinessSamples: 300,
} as const;

export type MaturityStatus = 'insufficient' | 'emerging' | 'ready';

export interface MaturityGauge {
  id: string;
  titleFa: string;
  titleEn: string;
  current: number;
  target: number;
  status: MaturityStatus;
  /** چرا این حد نصاب لازم است و بعد از رسیدن به آن چه باید کرد */
  actionFa: string;
  actionEn: string;
}

export interface ProvisionalDecision {
  id: string;
  areaFa: string;
  areaEn: string;
  /** مقدار فعلی که «حدسی/مهندسی» است */
  currentBasisFa: string;
  currentBasisEn: string;
  /** چه داده‌ای لازم است تا این تصمیم با شواهد جایگزین شود */
  needsFa: string;
  needsEn: string;
  gaugeId: string;
}

export interface DataMaturityReport {
  gauges: MaturityGauge[];
  provisionalDecisions: ProvisionalDecision[];
  /** آیا هنوز حداقل یک تصمیم مهم بر پایهٔ حدس است؟ (تقریباً همیشه true تا مدت‌ها) */
  requiresRecalibration: boolean;
  /** درصد کلی پیشرفت به سمت بلوغ داده (میانگین گیج‌ها، سقف ۱۰۰) */
  overallProgress: number;
}

function statusFor(current: number, target: number): MaturityStatus {
  if (current >= target) return 'ready';
  if (current >= target * 0.5) return 'emerging';
  return 'insufficient';
}

export interface MaturityInput {
  /** کل نمونه‌های آموزشی واجد شرایط */
  eligibleSampleCount: number;
  /** نمونه‌هایی که متخصص روی خروجی AI آنلاین تصحیح کرده (دارای baseline) */
  aiAgreementSampleCount: number;
  /** تعداد مشتری‌های مستقل در استخر آموزشی */
  distinctClientCount: number;
  /** تعداد برچسب‌هایی که هنوز support کافی ندارند */
  suppressedLabelCount: number;
  /** کل برچسب‌های کاتالوگ */
  totalLabelCount: number;
}

/**
 * گزارش بلوغ داده. خروجی برای نمایش در UI است و هیچ تصمیم اجرایی نمی‌گیرد.
 */
export function buildDataMaturityReport(input: MaturityInput): DataMaturityReport {
  const t = MATURITY_TARGETS;

  const gauges: MaturityGauge[] = [
    {
      id: 'heuristicCalibration',
      titleFa: 'نمونه برای کالیبراسیون آستانه‌های تحلیل آفلاین',
      titleEn: 'Samples for offline threshold calibration',
      current: input.eligibleSampleCount,
      target: t.heuristicCalibrationSamples,
      status: statusFor(input.eligibleSampleCount, t.heuristicCalibrationSamples),
      actionFa: 'آستانه‌های رنگ/بافت و ضرایب کالیبراسیون لنز باید با رگرسیون روی برچسب متخصص بازتنظیم شوند، نه با اعداد دستی فعلی.',
      actionEn: 'Color/texture thresholds and lens calibration factors should be refit against expert labels instead of the current hand-picked numbers.',
    },
    {
      id: 'aiAgreement',
      titleFa: 'نمونهٔ بازبینی‌شده برای سنجش دقت AI آنلاین',
      titleEn: 'Reviewed samples for online AI accuracy',
      current: input.aiAgreementSampleCount,
      target: t.aiAgreementSamples,
      status: statusFor(input.aiAgreementSampleCount, t.aiAgreementSamples),
      actionFa: 'وقتی به حد نصاب رسید، سوگیری هر شاخص را در پرامپت جبران کنید (مثلاً اگر AI مدام چربی را بیش‌برآورد می‌کند) و مدل‌های مختلف را با هم مقایسه کنید.',
      actionEn: 'Once met, compensate per-metric bias in the prompt (e.g. if the AI persistently overestimates oiliness) and compare candidate models head-to-head.',
    },
    {
      id: 'distinctClients',
      titleFa: 'تنوع مشتری برای ارزیابی تعمیم‌پذیر',
      titleEn: 'Client diversity for generalizable evaluation',
      current: input.distinctClientCount,
      target: t.distinctClients,
      status: statusFor(input.distinctClientCount, t.distinctClients),
      actionFa: 'با تعداد کم مشتری، holdout مبتنی بر مشتری نوسان زیادی دارد و برتری مدل ممکن است تصادفی باشد.',
      actionEn: 'With few clients, client-based holdout fluctuates heavily and any model advantage may be random.',
    },
    {
      id: 'labelCoverage',
      titleFa: 'پوشش برچسب‌های تشخیصی',
      titleEn: 'Diagnosis label coverage',
      current: Math.max(0, input.totalLabelCount - input.suppressedLabelCount),
      target: input.totalLabelCount,
      status: statusFor(
        Math.max(0, input.totalLabelCount - input.suppressedLabelCount),
        Math.max(1, input.totalLabelCount),
      ),
      actionFa: 'برچسب‌های سرکوب‌شده هنوز دادهٔ کافی ندارند؛ مدل محلی روی آن‌ها اظهارنظر نمی‌کند و صرفاً heuristic/AI پاسخ می‌دهد.',
      actionEn: 'Suppressed labels still lack data; the local model stays silent on them and only heuristic/AI responds.',
    },
    {
      id: 'embeddingReadiness',
      titleFa: 'آمادگی برای ارتقای فیچر تصویری (embedding)',
      titleEn: 'Readiness for learned image features (embedding)',
      current: input.eligibleSampleCount,
      target: t.embeddingReadinessSamples,
      status: statusFor(input.eligibleSampleCount, t.embeddingReadinessSamples),
      actionFa: 'جایگزینی فیچرهای heuristic با embedding یادگرفته‌شده (مثل MobileNet) پیش از این حجم داده، تقریباً حتماً overfit می‌شود و توضیح‌پذیری را هم از دست می‌دهد.',
      actionEn: 'Replacing heuristic features with a learned embedding (e.g. MobileNet) before this data volume would almost certainly overfit while also losing explainability.',
    },
  ];

  const provisionalDecisions: ProvisionalDecision[] = [
    {
      id: 'heuristicThresholds',
      areaFa: 'آستانه‌های تحلیل آفلاین',
      areaEn: 'Offline analysis thresholds',
      currentBasisFa: 'اعداد ثابت انتخاب‌شده با قضاوت مهندسی (نسبت پیکسل روشن، قرمزی، پوشش مو و…).',
      currentBasisEn: 'Fixed constants chosen by engineering judgement (bright-pixel ratio, redness, hair coverage, …).',
      needsFa: 'رگرسیون روی برچسب متخصص برای یافتن آستانه‌های واقعی.',
      needsEn: 'Regression against expert labels to derive real thresholds.',
      gaugeId: 'heuristicCalibration',
    },
    {
      id: 'lensCalibration',
      areaFa: 'ضرایب کالیبراسیون لنز/ناحیه',
      areaEn: 'Lens/region calibration factors',
      currentBasisFa: 'ضرایب تقریبی که خودِ کد صراحتاً «غیرقطعی» اعلامشان کرده است.',
      currentBasisEn: 'Approximate factors the code itself explicitly marks as non-definitive.',
      needsFa: 'تصاویر جفت‌شده از یک ناحیه با لنزهای مختلف تا اثر واقعی لنز اندازه‌گیری شود.',
      needsEn: 'Paired images of the same region across lenses to measure the true lens effect.',
      gaugeId: 'heuristicCalibration',
    },
    {
      id: 'retrainTolerance',
      areaFa: 'حاشیهٔ تحمل گیت بازآموزی',
      areaEn: 'Retrain gate tolerance',
      currentBasisFa: 'MAE ۰٫۵ و F1 ۰٫۰۳ — حدسی برای عبور دادن نوسان طبیعی split.',
      currentBasisEn: 'MAE 0.5 and F1 0.03 — guessed to absorb natural split fluctuation.',
      needsFa: 'اندازه‌گیری انحراف‌معیار واقعی متریک روی اجراهای تکراری و تنظیم حاشیه بر همان مبنا.',
      needsEn: 'Measure the real metric standard deviation across repeated runs and set the margin from it.',
      gaugeId: 'distinctClients',
    },
    {
      id: 'consistencyThresholds',
      areaFa: 'آستانه‌های تشخیص تناقض پاسخ AI',
      areaEn: 'AI consistency-conflict thresholds',
      currentBasisFa: 'آستانه‌های محافظه‌کارانهٔ دستی برای کاهش هشدار کاذب.',
      currentBasisEn: 'Hand-set conservative thresholds to limit false alarms.',
      needsFa: 'بررسی نرخ هشدار کاذب واقعی روی نمونه‌های بازبینی‌شده توسط متخصص.',
      needsEn: 'Measure the real false-alarm rate against expert-reviewed samples.',
      gaugeId: 'aiAgreement',
    },
    {
      id: 'imageFeatures',
      areaFa: 'نمایندگی تصویر برای مدل محلی',
      areaEn: 'Image representation for the local model',
      currentBasisFa: '۱۲ فیچر heuristic دست‌ساز — سقف دقت را محدود می‌کند.',
      currentBasisEn: '12 hand-crafted heuristic features — caps achievable accuracy.',
      needsFa: 'داده کافی برای افزودن embedding یادگرفته‌شده در کنار (نه به‌جای) فیچرهای فعلی.',
      needsEn: 'Enough data to add a learned embedding alongside (not replacing) current features.',
      gaugeId: 'embeddingReadiness',
    },
  ];

  const overallProgress = gauges.length
    ? Math.round(
      (gauges.reduce((s, g) => s + Math.min(1, g.target ? g.current / g.target : 0), 0)
        / gauges.length) * 100,
    )
    : 0;

  return {
    gauges,
    provisionalDecisions,
    // تا وقتی حتی یک گیج به حد نصاب نرسیده، اعلام می‌کنیم سیستم نیازمند
    // کالیبراسیون مجدد است. عمداً سخت‌گیرانه: «همه باید ready باشند».
    requiresRecalibration: gauges.some(g => g.status !== 'ready'),
    overallProgress,
  };
}
