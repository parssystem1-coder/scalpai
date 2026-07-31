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
  /**
   * توضیح یک‌خطی به زبان متخصص بالینی: «این نمودار چه چیزی را می‌شمارد؟»
   * عمداً بدون اصطلاح فنی (رگرسیون، holdout، embedding) نوشته می‌شود، چون
   * مخاطب این پنل پزشک است نه مهندس.
   */
  plainFa: string;
  plainEn: string;
  /**
   * «وقتی این نمودار سبز شد، چه اتفاقی می‌افتد؟»
   * بدون این، کاربر عددی را می‌بیند که بالا می‌رود ولی نمی‌داند چرا برایش مهم است.
   */
  whenReadyFa: string;
  whenReadyEn: string;
  /** واحد شمارش برای نمایش خوانا (مثلاً «عکس برچسب‌خورده») */
  unitFa: string;
  unitEn: string;
}

/**
 * یک قدم عملی که پس از سبز شدن همهٔ نمودارها باید انجام شود.
 *
 * چرا در کد است و نه فقط در سند: سندها گم می‌شوند و خوانده نمی‌شوند. این
 * فهرست دقیقاً در همان پنلی ظاهر می‌شود که کاربر منتظرش بوده — یعنی در لحظهٔ
 * درست، جلوی چشم درست.
 */
export interface NextStepAction {
  id: string;
  order: number;
  titleFa: string;
  titleEn: string;
  detailFa: string;
  detailEn: string;
  /** چه کسی این کار را انجام می‌دهد */
  ownerFa: string;
  ownerEn: string;
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
  /**
   * دستورالعمل «حالا چه کنیم؟» — فقط وقتی همهٔ نمودارها سبز شدند معنا دارد،
   * ولی همیشه ساخته می‌شود تا UI بتواند پیش‌نمایشش را هم نشان دهد.
   */
  nextSteps: NextStepAction[];
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
      titleFa: 'عکس‌های برچسب‌خورده برای تنظیم دقیق نمره‌ها',
      titleEn: 'Labelled photos for score fine-tuning',
      current: input.eligibleSampleCount,
      target: t.heuristicCalibrationSamples,
      status: statusFor(input.eligibleSampleCount, t.heuristicCalibrationSamples),
      unitFa: 'عکس برچسب‌خورده',
      unitEn: 'labelled photos',
      plainFa: 'تعداد عکس‌هایی که شما نظر تخصصی خودتان را رویشان ثبت کرده‌اید (مثلاً «شورهٔ این بیمار متوسط است»).',
      plainEn: 'How many photos you have recorded your own expert opinion on (e.g. “this patient’s dandruff is moderate”).',
      whenReadyFa: 'برنامه می‌تواند نمره‌های خودش را با نظر شما مقایسه کند و بگوید کجا سخت‌گیر یا سهل‌گیر بوده. مثلاً اگر برنامه همیشه شوره را بیشتر از واقعیت نشان می‌دهد، اینجا معلوم می‌شود.',
      whenReadyEn: 'The app can compare its own scores against your opinion and reveal where it is too strict or too lenient — e.g. if it consistently overstates dandruff.',
      actionFa: 'نمره‌های خودکار با نظر ثبت‌شدهٔ متخصص مقایسه و بازتنظیم می‌شوند، به‌جای اعداد پیش‌فرض فعلی.',
      actionEn: 'Automatic scores get refitted against recorded expert opinion instead of the current default numbers.',
    },
    {
      id: 'aiAgreement',
      titleFa: 'موارد بازبینی‌شدهٔ تحلیل آنلاین',
      titleEn: 'Reviewed online-analysis cases',
      current: input.aiAgreementSampleCount,
      target: t.aiAgreementSamples,
      status: statusFor(input.aiAgreementSampleCount, t.aiAgreementSamples),
      unitFa: 'مورد بازبینی‌شده',
      unitEn: 'reviewed cases',
      plainFa: 'تعداد دفعاتی که نتیجهٔ هوش مصنوعی آنلاین را دیده‌اید و آن را تأیید یا تصحیح کرده‌اید.',
      plainEn: 'How many times you have seen an online AI result and either confirmed or corrected it.',
      whenReadyFa: 'می‌شود سنجید هوش مصنوعی آنلاین در کدام شاخص‌ها قابل اعتماد است و در کدام‌ها نه — و اگر خطای تکرارشونده‌ای دارد (مثلاً همیشه چربی را زیاد نشان می‌دهد) آن را جبران کرد.',
      whenReadyEn: 'You can measure which metrics the online AI is reliable on, and correct any repeated bias (e.g. always overstating oiliness).',
      actionFa: 'سوگیری تکرارشوندهٔ هر شاخص شناسایی و جبران می‌شود؛ سرویس‌های مختلف هوش مصنوعی هم قابل مقایسه می‌شوند.',
      actionEn: 'Repeated per-metric bias is identified and compensated; different AI providers become comparable.',
    },
    {
      id: 'distinctClients',
      titleFa: 'تعداد بیماران مختلف',
      titleEn: 'Number of distinct patients',
      current: input.distinctClientCount,
      target: t.distinctClients,
      status: statusFor(input.distinctClientCount, t.distinctClients),
      unitFa: 'بیمار متفاوت',
      unitEn: 'distinct patients',
      plainFa: 'چند بیمار *متفاوت* در داده‌ها هست. ۱۰۰ عکس از ۳ بیمار، ارزش ۱۰۰ عکس از ۳۰ بیمار را ندارد.',
      plainEn: 'How many *different* patients are in the data. 100 photos from 3 patients are worth far less than 100 photos from 30.',
      whenReadyFa: 'می‌توان مطمئن شد برنامه واقعاً «یاد گرفته» و صرفاً چند بیمار خاص را حفظ نکرده است. بدون تنوع کافی، هر بهبودی ممکن است شانسی باشد.',
      whenReadyEn: 'You can trust the app has genuinely learned rather than memorised a few specific patients. Without diversity, any improvement may be luck.',
      actionFa: 'با بیمار کم، ارزیابی نوسان زیادی دارد و برتری یک نسخه بر نسخهٔ دیگر ممکن است تصادفی باشد.',
      actionEn: 'With few patients, evaluation fluctuates heavily and one version beating another may be random.',
    },
    {
      id: 'labelCoverage',
      titleFa: 'پوشش انواع تشخیص',
      titleEn: 'Diagnosis type coverage',
      current: Math.max(0, input.totalLabelCount - input.suppressedLabelCount),
      target: input.totalLabelCount,
      status: statusFor(
        Math.max(0, input.totalLabelCount - input.suppressedLabelCount),
        Math.max(1, input.totalLabelCount),
      ),
      unitFa: 'نوع تشخیص',
      unitEn: 'diagnosis types',
      plainFa: 'از میان همهٔ تشخیص‌هایی که برنامه می‌شناسد، چند تا نمونهٔ کافی برای یادگیری دارند.',
      plainEn: 'Of all diagnoses the app knows, how many have enough examples to be learnable.',
      whenReadyFa: 'مدل محلی می‌تواند دربارهٔ همهٔ تشخیص‌ها اظهارنظر کند. تا آن زمان، دربارهٔ تشخیص‌های کم‌نمونه عمداً سکوت می‌کند — این سکوت آگاهانه است، نه نقص.',
      whenReadyEn: 'The local model can weigh in on every diagnosis. Until then it deliberately stays silent on rare ones — that silence is intentional, not a defect.',
      actionFa: 'تشخیص‌های کم‌نمونه هنوز دادهٔ کافی ندارند؛ مدل محلی دربارهٔ آن‌ها ساکت می‌ماند و فقط تحلیل قانون‌محور یا آنلاین پاسخ می‌دهد.',
      actionEn: 'Rare diagnoses still lack data; the local model stays silent on them and only rule-based or online analysis responds.',
    },
    {
      id: 'embeddingReadiness',
      titleFa: 'آمادگی برای ارتقای بزرگ تشخیص تصویر',
      titleEn: 'Readiness for the major image-recognition upgrade',
      current: input.eligibleSampleCount,
      target: t.embeddingReadinessSamples,
      status: statusFor(input.eligibleSampleCount, t.embeddingReadinessSamples),
      unitFa: 'عکس برچسب‌خورده',
      unitEn: 'labelled photos',
      plainFa: 'برای یک ارتقای بزرگ‌تر لازم است: به‌جای اندازه‌گیری چند ویژگی مشخص (قرمزی، شوره…)، برنامه خودش یاد بگیرد به چه چیزی نگاه کند.',
      plainEn: 'Needed for a bigger upgrade: instead of measuring a few fixed features (redness, flaking…), the app learns for itself what to look at.',
      whenReadyFa: 'دقت می‌تواند جهش کند — ولی این ارتقا عمداً به تعویق افتاده، چون با داده کم نتیجهٔ معکوس می‌دهد و توضیح‌پذیری («چرا این نمره؟») را هم از بین می‌برد.',
      whenReadyEn: 'Accuracy can jump — but this upgrade is deliberately deferred, since with little data it backfires and also destroys explainability (“why this score?”).',
      actionFa: 'این ارتقا پیش از رسیدن به این حجم داده، تقریباً حتماً نتیجهٔ معکوس می‌دهد و قابلیت توضیح نمره‌ها را هم از دست می‌دهد.',
      actionEn: 'Before this data volume, the upgrade would almost certainly backfire while also losing the ability to explain scores.',
    },
  ];

  /**
   * دستورالعمل «حالا چه کنیم؟» — این‌جا در کد است تا در همان لحظه‌ای که
   * کاربر منتظرش بوده جلوی چشمش باشد، نه در سندی که کسی باز نمی‌کند.
   */
  const nextSteps: NextStepAction[] = [
    {
      id: 'backup',
      order: 1,
      titleFa: 'اول یک پشتیبان کامل بگیرید',
      titleEn: 'Take a full backup first',
      detailFa: 'تنظیمات ← پشتیبان‌گیری، همراه با پسورد. پیش از هر تغییری در نحوهٔ نمره‌دهی، باید بتوانید به وضعیت فعلی برگردید.',
      detailEn: 'Settings → Backup, with a password. Before changing how scoring works, you must be able to return to the current state.',
      ownerFa: 'شما',
      ownerEn: 'You',
    },
    {
      id: 'runReport',
      order: 2,
      titleFa: 'گزارش مقایسه را بگیرید',
      titleEn: 'Run the comparison report',
      detailFa: 'در همین صفحه، دکمهٔ «گزارش کالیبراسیون» حالا فعال است. آن را بزنید تا ببینید نمره‌های فعلی چقدر با نظر شما فاصله دارند و تنظیم مجدد چقدر بهبود می‌دهد.',
      detailEn: 'On this page, the “calibration report” button is now enabled. Run it to see how far current scores are from your opinion and how much refitting would improve them.',
      ownerFa: 'شما',
      ownerEn: 'You',
    },
    {
      id: 'judgeImprovement',
      order: 3,
      titleFa: 'ببینید بهبود واقعاً ارزشش را دارد یا نه',
      titleEn: 'Judge whether the improvement is worth it',
      detailFa: 'اگر بهبود کمتر از حدود ۲٪ بود، تغییر ندهید. تغییر نمره‌دهی برای یک بهبود ناچیز، فقط تاریخچهٔ بیماران را به‌هم می‌ریزد.',
      detailEn: 'If the improvement is under roughly 2%, do not change anything. Shifting the scoring for a marginal gain only disrupts patient history.',
      ownerFa: 'شما',
      ownerEn: 'You',
    },
    {
      id: 'engineParity',
      order: 4,
      titleFa: 'هماهنگی هر دو موتور تحلیل بررسی شود',
      titleEn: 'Verify both analysis engines stay in sync',
      detailFa: 'برنامه دو موتور تحلیل دارد و خودکار بینشان جابه‌جا می‌شود. هر تغییر در نمره‌دهی باید در هر دو اعمال شود، وگرنه یک عکس روی دو کامپیوتر دو نتیجهٔ متفاوت می‌دهد. این کار فنی است.',
      detailEn: 'The app has two analysis engines and switches between them automatically. Any scoring change must apply to both, otherwise one photo gives two different results on two computers. This step is technical.',
      ownerFa: 'تیم فنی',
      ownerEn: 'Technical team',
    },
    {
      id: 'applyAndDocument',
      order: 5,
      titleFa: 'اعمال تغییر و ثبت تاریخ آن',
      titleEn: 'Apply the change and record its date',
      detailFa: 'پس از اعمال، تاریخ تغییر ثبت می‌شود تا در نمودار روند بیماران مشخص باشد کدام نقطه‌ها با معیار قدیم و کدام با معیار جدید سنجیده شده‌اند.',
      detailEn: 'Once applied, the change date is recorded so patient trend charts can show which points were measured with the old versus the new criteria.',
      ownerFa: 'تیم فنی',
      ownerEn: 'Technical team',
    },
    {
      id: 'retrain',
      order: 6,
      titleFa: 'مدل محلی را دوباره آموزش دهید',
      titleEn: 'Retrain the local model',
      detailFa: 'در همین صفحه دکمهٔ آموزش را بزنید. نگران نباشید: مدل جدید فقط در صورتی جایگزین مدل فعلی می‌شود که واقعاً بهتر باشد؛ در غیر این صورت مدل قبلی حفظ می‌شود.',
      detailEn: 'Press the training button on this page. Don’t worry: the new model replaces the current one only if it is genuinely better; otherwise the previous model is kept.',
      ownerFa: 'شما',
      ownerEn: 'You',
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
    nextSteps,
  };
}
