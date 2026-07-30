/** متن‌های صفحهٔ تحلیل هوش مصنوعی — تنها منبع حقیقت برای هر دو زبان */
import type { Dict } from '../../i18n';

export const aiAnalysisDict = {
  // تب‌ها
  tabAnalysis: { fa: 'تحلیل جدید', en: 'New Analysis' },
  tabResults: { fa: 'نتایج', en: 'Results' },
  tabVisualization: { fa: 'تصویرسازی ضایعات', en: 'Lesion Visualization' },
  tabHistory: { fa: 'تاریخچه', en: 'History' },
  tabAllAnalyses: { fa: 'آرشیو تحلیل‌ها', en: 'All Analyses' },
  selectClientFirst: { fa: 'ابتدا یک مشتری انتخاب کنید', en: 'Select a client first' },
  selectClientHint: {
    fa: 'از تب «تحلیل جدید» مشتری را انتخاب کنید تا تاریخچهٔ مراجعاتش اینجا دیده شود.',
    en: 'Pick a client in the New Analysis tab to see their visit history here.',
  },
  noHistory: { fa: 'تاریخچه‌ای برای این مشتری ثبت نشده', en: 'No history for this client yet' },
  historyFor: { fa: 'تاریخچه مراجعات', en: 'Visit history for' },

  // نوار مشاهده
  viewMode: { fa: 'حالت مشاهده', en: 'View Mode' },
  delete: { fa: 'حذف', en: 'Delete' },
  close: { fa: 'بستن', en: 'Close' },
  deleteConfirm: {
    fa: 'آیا از حذف این تحلیل اطمینان دارید؟ این عمل قابل بازگشت نیست.',
    en: 'Are you sure you want to delete this analysis? This action cannot be undone.',
  },

  // تب تحلیل
  searchClient: { fa: 'جستجوی مشتری...', en: 'Search client...' },
  eligibleClients: { fa: 'مشتریان واجد شرایط این ماژول', en: 'Clients eligible for this module' },
  noEligibleClients: { fa: 'مشتری واجد شرایطی یافت نشد', en: 'No eligible clients found' },
  mustHaveSession: {
    fa: 'نوبت باز لازم است و هنوز تحلیل آنلاین برای همان نوبت ثبت نشده باشد',
    en: 'Needs an open appointment with no AI analysis yet for that visit',
  },
  endVisit: { fa: 'پایان مراجعه', en: 'End visit' },
  endVisitHint: {
    fa: 'نوبت فقط با این دکمه بسته می‌شود. تا قبل از آن، ماژول‌های دیگر روی همین مراجعه کار می‌کنند.',
    en: 'The appointment closes only with this button. Until then, other modules can continue on the same visit.',
  },
  selectImage: { fa: 'انتخاب تصویر', en: 'Select Image' },
  noGalleryImages: {
    fa: 'تصویری در گالری این مشتری وجود ندارد',
    en: "No images in this client's gallery",
  },
  analyzeWithAI: { fa: 'تحلیل با هوش مصنوعی', en: 'Analyze with AI' },
  analyzingWithModel: {
    fa: 'در حال تحلیل با هوش مصنوعی {model}...',
    en: 'Analyzing with AI {model}...',
  },
  cancel: { fa: 'لغو', en: 'Cancel' },
  apiKeyMissing: {
    fa: 'کلید API در تنظیمات پیکربندی نشده',
    en: 'API key not configured in settings',
  },
  medicalDataIncluded: {
    fa: 'پرسشنامه پزشکی همراه تصویر به AI ارسال می‌شود (طبق تنظیمات).',
    en: 'Medical questionnaire will be sent with the image (per settings).',
  },
  medicalDataExcluded: {
    fa: 'فقط تصویر و ناحیه/لنز ارسال می‌شود. برای ارسال پرسشنامه: تنظیمات > هوش مصنوعی.',
    en: 'Only image and region/lens are sent. To include questionnaire: Settings > AI.',
  },
  goToAiSettings: {
    fa: 'رفتن به تنظیمات → هوش مصنوعی',
    en: 'Go to Settings → AI',
  },
  analysisErrorTitle: { fa: 'خطا در تحلیل', en: 'Analysis Error' },
  troubleshootingTitle: { fa: 'راهنمای رفع مشکل:', en: 'Troubleshooting Tips:' },
  tipInternet: { fa: 'اتصال اینترنت خود را بررسی کنید', en: 'Check your internet connection' },
  tipVpn: { fa: 'فیلتر شکن (VPN) خود را روشن کنید', en: 'Enable your VPN/filter breaker' },
  tipCors: {
    fa: 'در تنظیمات > AI، پراکسی CORS را بررسی کنید',
    en: 'Check CORS proxy in Settings > AI',
  },
  tipWait: {
    fa: 'چند دقیقه صبر کنید و دوباره تلاش کنید',
    en: 'Wait a few minutes and try again',
  },
  tipApiKey: { fa: 'کلید API را در تنظیمات بررسی کنید', en: 'Verify API key in Settings' },
  download: { fa: 'دانلود', en: 'Download' },
  noImageSelected: { fa: 'تصویری انتخاب نشده', en: 'No image selected' },

  // پیام‌های خطا / وضعیت (ثابت)
  selectImageFirst: { fa: 'لطفا یک تصویر انتخاب کنید', en: 'Please select an image' },
  configureApiKey: {
    fa: 'لطفا کلید API را در تنظیمات وارد کنید',
    en: 'Please configure API key in settings',
  },
  privacyConsentRequired: {
    fa: 'تحلیل آنلاین تا ثبت رضایت‌نامهٔ حریم‌خصوصی غیرفعال است (تصویر به سرویس بیرونی ارسال می‌شود). لطفاً بعد از خواندن اطلاع‌رسانی، رضایت را تأیید کنید.',
    en: 'Online analysis is disabled until the privacy notice is acknowledged (images are sent to an external service). Please review and accept the notice.',
  },
  analysisCancelled: { fa: 'تحلیل لغو شد', en: 'Analysis cancelled' },
  unknownError: { fa: 'خطای ناشناخته', en: 'Unknown error' },
  imageAnalysisError: { fa: 'خطا در تحلیل تصویر', en: 'Error analyzing image' },

  // تب نتایج
  hairDensity: { fa: 'تراکم مو', en: 'Hair Density' },
  scalpCondition: { fa: 'وضعیت پوست سر', en: 'Scalp Condition' },
  oiliness: { fa: 'چربی', en: 'Oiliness' },
  dryness: { fa: 'خشکی', en: 'Dryness' },
  dandruff: { fa: 'شوره', en: 'Dandruff' },
  redness: { fa: 'قرمزی', en: 'Redness' },
  specializedIndicators: { fa: 'شاخص‌های تخصصی‌تر', en: 'Specialized Indicators' },
  shine: { fa: 'براقی/سبوره سطحی', en: 'Surface shine/sebum' },
  patchiness: { fa: 'لکه‌ای بودن ریزش', en: 'Patchiness' },
  pigmentation: { fa: 'ناهمگونی رنگدانه', en: 'Pigmentation irregularity' },
  hairThickness: { fa: 'ضخامت نسبی تار مو', en: 'Relative hair thickness' },
  specializedHint: {
    fa: 'این شاخص‌ها تخمینی و مبتنی بر تحلیل هوش مصنوعی هستند، نه تشخیص بالینی قطعی.',
    en: 'These indicators are AI-based estimates, not a definitive clinical diagnosis.',
  },
  hairLoss: { fa: 'ریزش مو', en: 'Hair Loss' },
  pattern: { fa: 'الگو:', en: 'Pattern:' },
  detectedLesions: { fa: 'ضایعات شناسایی شده', en: 'Detected Lesions' },
  noLesions: { fa: 'ضایعه‌ای شناسایی نشد', en: 'No lesions detected' },
  clinicalObservations: { fa: 'مشاهدات کلینیکی', en: 'Clinical Observations' },
  noObservations: { fa: 'تشخیص کلینیکی ثبت نشد', en: 'No clinical diagnoses recorded' },
  observationsAutoHint: {
    fa: 'گزینه‌های تشخیص‌داده‌شده توسط تحلیل به‌صورت خودکار برجسته شده‌اند.',
    en: 'Diagnoses detected by the analysis are highlighted automatically.',
  },
  recommendations: { fa: 'پیشنهادات درمانی', en: 'Treatment Recommendations' },
  performAnalysisFirst: { fa: 'ابتدا یک تحلیل انجام دهید', en: 'Perform an analysis first' },
  overallHealthScore: { fa: 'امتیاز کلی سلامت پوست سر', en: 'Overall Scalp Health Score' },
  overallHealthScoreHint: {
    fa: 'بر اساس تراکم مو و شاخص‌های وضعیت پوست سر محاسبه می‌شود.',
    en: 'Computed from hair density and scalp condition metrics.',
  },
  healthExcellent: { fa: 'عالی', en: 'Excellent' },
  healthGood: { fa: 'خوب', en: 'Good' },
  healthFair: { fa: 'متوسط', en: 'Fair' },
  healthNeedsAttention: { fa: 'نیازمند توجه', en: 'Needs attention' },

  // تب تصویرسازی
  downloadImage: { fa: 'دانلود تصویر', en: 'Download Image' },
  visualizationHint: {
    fa: 'کادرهای رنگی مربعی محل ضایعات تشخیص‌داده‌شده را نشان می‌دهند.',
    en: 'Colored square boxes mark detected lesion areas on the image.',
  },

  // آرشیو
  noAnalyses: { fa: 'تحلیلی یافت نشد', en: 'No analyses found' },
  analysesCount: { fa: 'تحلیل', en: 'analyses' },
  densityShort: { fa: 'تراکم:', en: 'D:' },
} satisfies Dict;
