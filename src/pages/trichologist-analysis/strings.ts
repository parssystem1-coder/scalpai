/** متن‌های صفحهٔ تحلیل تریکولوژیست — تنها منبع حقیقت برای هر دو زبان */
import type { Dict } from '../../i18n';

export const trichoDict = {
  // تب‌ها
  tabBasic: { fa: 'اطلاعات پایه', en: 'Basic Info' },
  tabQuestionnaire: { fa: 'پرسشنامه پزشکی', en: 'Medical Questionnaire' },
  tabObservations: { fa: 'مشاهدات کلینیکی', en: 'Clinical Observations' },
  tabRecommendations: { fa: 'توصیه‌ها', en: 'Recommendations' },
  tabTreatment: { fa: 'طرح درمان', en: 'Treatment Plan' },
  tabClinicalTrend: { fa: 'روند تغییرات بالینی', en: 'Clinical Changes Trend' },
  tabHistory: { fa: 'تاریخچه', en: 'History' },
  tabAllAnalyses: { fa: 'آرشیو تحلیل‌ها', en: 'All Analyses' },

  // نوار مشاهده/ویرایش
  viewModeBanner: {
    fa: 'حالت مشاهده - برای ویرایش روی دکمه ویرایش کلیک کنید',
    en: 'View Mode - Click Edit to make changes',
  },
  edit: { fa: 'ویرایش', en: 'Edit' },
  delete: { fa: 'حذف', en: 'Delete' },
  close: { fa: 'بستن', en: 'Close' },
  deleteConfirm: {
    fa: 'آیا از حذف این تحلیل اطمینان دارید؟ این عمل قابل بازگشت نیست.',
    en: 'Are you sure you want to delete this analysis? This action cannot be undone.',
  },

  // اطلاعات پایه
  searchClient: { fa: 'جستجوی مشتری...', en: 'Search client...' },
  eligibleClients: { fa: 'مشتریان واجد شرایط این ماژول', en: 'Clients eligible for this module' },
  noEligibleClients: { fa: 'مشتری واجد شرایطی یافت نشد', en: 'No eligible clients found' },
  endVisit: { fa: 'پایان مراجعه', en: 'End visit' },
  endVisitHint: {
    fa: 'نوبت با این دکمه یا ذخیرهٔ دستی نهایی بسته می‌شود. ذخیرهٔ خودکار نوبت را نمی‌بندد.',
    en: 'The visit closes with this button or a manual final save. Autosave does not close the appointment.',
  },
  selectedClient: { fa: 'مشتری انتخاب شده:', en: 'Selected Client:' },
  male: { fa: 'مرد', en: 'Male' },
  female: { fa: 'زن', en: 'Female' },
  age: { fa: 'سن', en: 'Age' },
  unknownAge: { fa: 'نامشخص', en: 'Unknown' },
  years: { fa: 'سال', en: 'years' },
  clientImages: { fa: 'تصاویر مشتری', en: 'Client Images' },
  clickHint: {
    fa: 'کلیک برای انتخاب، دبل‌کلیک برای بزرگ‌نمایی',
    en: 'Click to select, double-click to zoom',
  },

  // پرسشنامه
  gender: { fa: 'جنسیت', en: 'Gender' },
  medicalHistory: { fa: 'سابقه پزشکی', en: 'Medical History' },
  medicalHistoryPlaceholder: {
    fa: 'توضیح سایر بیماری‌ها یا جراحی‌ها...',
    en: 'Describe other conditions or surgeries...',
  },
  medications: { fa: 'داروهای مصرفی', en: 'Current Medications' },
  medicationsPlaceholder: { fa: 'نام دارو، دوز، مدت مصرف...', en: 'Medication name, dose, duration...' },
  allergies: { fa: 'حساسیت‌ها و آلرژی‌ها', en: 'Allergies' },
  allergiesPlaceholder: { fa: 'حساسیت به دارو، مواد شیمیایی، غذا...', en: 'Drug, chemical, food allergies...' },
  previousTreatments: { fa: 'درمان‌های قبلی مو', en: 'Previous Hair Treatments' },
  previousTreatmentsPlaceholder: { fa: 'سایر درمان‌های قبلی...', en: 'Other previous treatments...' },
  familyHistory: { fa: 'سابقه خانوادگی', en: 'Family History' },
  stressLevel: { fa: 'میزان استرس', en: 'Stress Level' },
  sleepQuality: { fa: 'کیفیت خواب', en: 'Sleep Quality' },
  dietType: { fa: 'رژیم غذایی', en: 'Diet Type' },
  select: { fa: 'انتخاب', en: 'Select' },
  none: { fa: 'ندارد', en: 'None' },
  father: { fa: 'پدر', en: 'Father' },
  mother: { fa: 'مادر', en: 'Mother' },
  both: { fa: 'هر دو', en: 'Both' },
  low: { fa: 'کم', en: 'Low' },
  medium: { fa: 'متوسط', en: 'Medium' },
  high: { fa: 'زیاد', en: 'High' },
  good: { fa: 'خوب', en: 'Good' },
  moderate: { fa: 'متوسط', en: 'Moderate' },
  poor: { fa: 'ضعیف', en: 'Poor' },
  balanced: { fa: 'متعادل', en: 'Balanced' },
  vegetarian: { fa: 'گیاهخوار', en: 'Vegetarian' },
  lowProtein: { fa: 'کم پروتئین', en: 'Low Protein' },
  fastFood: { fa: 'فست‌فود زیاد', en: 'High Fast Food' },
  lifestyle: { fa: 'سبک زندگی و عادات', en: 'Lifestyle & Habits' },
  lifestylePlaceholder: {
    fa: 'ورزش، سیگار، الکل، استفاده از سشوار/اتو مو...',
    en: 'Exercise, smoking, alcohol, heat styling...',
  },
  changedFromPrevious: { fa: 'تغییر نسبت به مراجعه قبل', en: 'Changed since previous visit' },
  finalize: { fa: 'ثبت نهایی', en: 'Finalize' },
  reopenEdit: { fa: 'ویرایش', en: 'Edit' },
  updateFinal: { fa: 'به‌روزرسانی', en: 'Update' },
  statusDraft: { fa: 'پیش‌نویس', en: 'Draft' },
  statusFinal: { fa: 'ثبت نهایی شده', en: 'Finalized' },
  seededFromPreviousHint: {
    fa: 'مقادیر از مراجعه قبلی بارگذاری شده‌اند؛ در صورت نیاز ویرایش و ثبت نهایی کنید.',
    en: 'Values were loaded from the previous visit. Edit if needed, then finalize.',
  },
  otherDetails: { fa: 'توضیحات سایر', en: 'Other details' },
  selectOptions: { fa: 'گزینه‌های مرتبط را انتخاب کنید', en: 'Select applicable options' },
  finalizing: { fa: 'در حال ثبت...', en: 'Saving...' },
  finalizedAt: { fa: 'ثبت نهایی', en: 'Finalized' },

  // مشاهدات
  selectIssues: { fa: 'مشکلات مشاهده شده را انتخاب کنید:', en: 'Select observed issues:' },
  severity: { fa: 'شدت مشکل', en: 'Severity' },
  mild: { fa: 'خفیف', en: 'Mild' },
  severe: { fa: 'شدید', en: 'Severe' },
  hairLossPattern: { fa: 'الگوی ریزش', en: 'Hair Loss Pattern' },
  diffuse: { fa: 'منتشر', en: 'Diffuse' },
  frontal: { fa: 'جلوی سر', en: 'Frontal' },
  vertex: { fa: 'تاج سر', en: 'Vertex' },
  patchy: { fa: 'لکه‌ای', en: 'Patchy' },
  total: { fa: 'کامل', en: 'Total' },
  observationNotes: { fa: 'توضیحات تکمیلی مشاهدات', en: 'Additional Observation Notes' },
  observationNotesPlaceholder: {
    fa: 'جزئیات بیشتر درباره وضعیت پوست سر و مو...',
    en: 'More details about scalp and hair condition...',
  },

  // توصیه‌ها
  recommendationsPlaceholder: {
    fa: `# توصیه‌های درمانی

## مراقبت روزانه
- شستشو با شامپوی ضدشوره
- استفاده از سرم تقویتی

## محصولات پیشنهادی
1. شامپوی X
2. سرم Y
3. قرص Z

## نکات مهم
- اجتناب از...`,
    en: `# Treatment Recommendations

## Daily Care
- Wash with anti-dandruff shampoo
- Use strengthening serum

## Recommended Products
1. Shampoo X
2. Serum Y
3. Supplement Z`,
  },

  // طرح درمان
  treatmentSteps: { fa: 'مراحل درمان', en: 'Treatment Steps' },
  addStep: { fa: 'افزودن مرحله', en: 'Add Step' },
  noSteps: { fa: 'مرحله‌ای اضافه نشده', en: 'No steps added' },
  addStepHint: { fa: 'روی "افزودن مرحله" کلیک کنید', en: 'Click "Add Step" to begin' },
  stepTitle: { fa: 'عنوان مرحله', en: 'Step Title' },
  description: { fa: 'توضیحات', en: 'Description' },
  products: { fa: 'محصولات/داروها', en: 'Products/Medications' },
  duration: { fa: 'مدت زمان', en: 'Duration' },
  durationPlaceholder: { fa: 'مثلا: 2 ماه', en: 'e.g., 2 months' },
  cost: { fa: 'هزینه تقریبی', en: 'Est. Cost' },
  costPlaceholder: { fa: 'تومان', en: 'Amount' },

  // تاریخچه و آرشیو
  selectClientFirst: { fa: 'ابتدا یک مشتری انتخاب کنید', en: 'Select a client first' },
  selectClientHint: {
    fa: 'از تب اطلاعات پایه مشتری انتخاب کنید یا از تب آرشیو تحلیل‌ها استفاده کنید',
    en: 'Select from Basic Info tab or use All Analyses tab',
  },
  noHistory: { fa: 'تاریخچه‌ای برای این مشتری یافت نشد', en: 'No history found for this client' },
  historyFor: { fa: 'تاریخچه تحلیل‌های', en: 'Analysis history for' },
  noAnalyses: { fa: 'تحلیلی یافت نشد', en: 'No analyses found' },
  analysesCount: { fa: 'تحلیل', en: 'analyses' },

  // روند تغییرات بالینی
  trendFor: { fa: 'روند تغییرات بالینی برای', en: 'Clinical changes trend for' },
  trendIntro: {
    fa: 'خط زمانی پرسشنامه‌های ثبت‌نهایی، روند امتیاز تحلیل‌ها، و مقایسه عکس‌های هم‌ناحیه با همان لنز.',
    en: 'Finalized questionnaire timeline, analysis score trends, and same region/lens photo comparisons.',
  },
  trendLoading: { fa: 'در حال بارگذاری روند...', en: 'Loading trend...' },
  trendEmpty: {
    fa: 'هنوز دادهٔ کافی برای نمایش روند وجود ندارد',
    en: 'Not enough data yet to show a trend',
  },
  trendQuestionnaireTimeline: { fa: 'خط زمانی پرسشنامه', en: 'Questionnaire timeline' },
  trendNoQuestionnaire: {
    fa: 'پرسشنامهٔ نهایی‌شده‌ای ثبت نشده است',
    en: 'No finalized questionnaire has been recorded',
  },
  trendAnalysesInVisit: { fa: 'تعداد تحلیل‌های این مراجعه', en: 'Analyses in this visit' },
  trendChangedFields: { fa: 'فیلدهای تغییرکرده', en: 'Changed fields' },
  trendNoFieldChanges: {
    fa: 'نسبت به مراجعه قبل تغییر فیلدی ثبت نشده',
    en: 'No field changes versus the previous visit',
  },
  trendScoreChart: { fa: 'روند امتیاز تحلیل‌ها', en: 'Analysis score trend' },
  trendNeedMoreScores: {
    fa: 'برای نمودار روند حداقل دو تحلیل آنلاین یا آفلاین لازم است',
    en: 'At least two online or offline analyses are needed for a trend chart',
  },
  trendDensity: { fa: 'تراکم', en: 'Density' },
  trendOiliness: { fa: 'چربی', en: 'Oiliness' },
  trendDryness: { fa: 'خشکی', en: 'Dryness' },
  trendDandruff: { fa: 'شوره', en: 'Dandruff' },
  trendRedness: { fa: 'قرمزی', en: 'Redness' },
  trendPhotoCompare: { fa: 'مقایسه عکس هم‌ناحیه / هم‌لنز', en: 'Same region / lens photo compare' },
  trendPhotoCompareHint: {
    fa: 'برای هر ناحیه و لنز، قدیمی‌ترین و جدیدترین عکس کنار هم نشان داده می‌شود.',
    en: 'For each region and lens, the oldest and newest photos are shown side by side.',
  },
  trendNoPhotoPairs: {
    fa: 'حداقل دو عکس از یک ناحیه با یک لنز برای مقایسه لازم است',
    en: 'At least two photos of the same region with the same lens are needed',
  },
  trendPhotos: { fa: 'عکس', en: 'photos' },
  trendOlderPhoto: { fa: 'قدیمی‌تر', en: 'Older' },
  trendNewerPhoto: { fa: 'جدیدتر', en: 'Newer' },

  // ناوبری و ذخیره
  previous: { fa: 'قبلی', en: 'Previous' },
  next: { fa: 'بعدی', en: 'Next' },
  autoSaved: { fa: 'ذخیره خودکار:', en: 'Auto-saved:' },
  saving: { fa: 'در حال ذخیره...', en: 'Saving...' },
  update: { fa: 'بروزرسانی', en: 'Update' },
  save: { fa: 'ذخیره', en: 'Save' },
} satisfies Dict;

/** گزینه‌های مشاهدات کلینیکی — از کاتالوگ مشترک */
export {
  observationOptions,
  observationLabel,
  observationGroups,
  observationGroupLabel,
  observationsInGroup,
} from '../../lib/diagnosisCatalog';
