import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const fa = {
  login: {
    title: "ورود به ScalpAI",
    email: "ایمیل",
    password: "رمز عبور",
    submit: "ورود",
    rememberMe: "مرا به خاطر بسپار",
    forgotPass: "فراموشی رمز عبور",
    quickRole: "نقش سریع",
    ownerRole: "مدیر کلینیک (Owner)",
    trichoRole: "متخصص تریکولوژیست",
    welcomeBack: "خوش آمدید",
    subtitle: "پلتفرم جامع تریکولوژی و آنالیز هوشمند پوست و مو",
  },
  home: { title: "خوش آمدید", logout: "خروج" },
  common: {
    loading: "در حال بارگذاری…",
    delete: "حذف",
    back: "بازگشت",
    langLabel: "زبان",
    offline: "حالت آفلاین",
    online: "آنلاین",
    success: "موفق",
    error: "خطا",
    unknownError: "خطای نامشخص",
    save: "ذخیره",
    cancel: "انصراف",
    close: "بستن",
    all: "همه",
    search: "جستجو…",
  },
  patients: {
    title: "بیماران",
    name: "نام",
    family: "نام خانوادگی",
    phone: "تلفن",
    phonePh: "09xxxxxxxxx",
    add: "افزودن بیمار جدید",
    checkInput: "ورودی را بررسی کنید",
    colName: "نام بیمار",
    colPhone: "تلفن همراه",
    consentCol: "فرم رضایت",
    consentBtn: "✍️ رضایت‌نامه دیجیتال",
    formAria: "فرم ایجاد بیمار",
    noPatients: "هیچ بیماری ثبت نشده است.",
    patientDetail: "پرونده بیمار",
  },
  consent: {
    title: "فرم رضایت‌نامه دیجیتال بیمار",
    subtitle: "پذیرش پروتکل تریکوسکوپی و ثبت سوابق بالینی در سامانه",
    legalNotice: "اینجانب بدینوسیله رضایت آگاهانه خود را جهت انجام تصویربرداری تریکوسکوپی پوست و مو و استفاده از نتایج جهت پیگیری درمان و آنالیز هوشمند بالینی اعلام می‌دارم.",
    patientName: "نام بیمار:",
    patientPhone: "شماره تماس:",
    signInstructions: "لطفاً با قلم لمسی یا انگشت در کادر زیر امضا نمایید:",
    clearSignature: "پاک کردن امضا",
    confirmSubmit: "ثبت و امضای نهایی",
    signedSuccess: "فرم رضایت با موفقیت ثبت گردید ✓",
    savedAt: "زمان امضا:",
  },
  gallery: {
    title: "گالری بیمار",
    back: "بازگشت به بیماران",
    pick: "انتخاب تصویر",
    processing: "در حال پردازش…",
    empty: "تصویری ثبت نشده است.",
    delete: "حذف",
    uploadFailed: "آپلود به ذخیره‌ساز ناموفق بود",
    consentBtn: "✍️ فرم رضایت دیجیتال بیمار",
    patientLabel: "بیمار",
    dateLabel: "تاریخ ثبت",
    qualityScore: "امتیاز کیفیت",
    analyzeNow: "شروع آنالیز بالینی",
  },
  analysis: {
    title: "نتیجه تحلیل هوشمند",
    back: "بازگشت به گالری",
    running: "در حال اجرای موتور تحلیل…",
    elapsed: "زمان تحلیل:",
    msUnit: "میلی‌ثانیه · مدل heuristic-v0",
    severity: "شدت کل:",
    redness: "قرمزی و التهاب",
    flakeTexture: "بافت پوسته و شوره",
    densityProxy: "شاخص تراکم مو",
    reviewTitle: "بازبینی و نظارت متخصص",
    notePh: "یادداشت متخصص (اختیاری)",
    adjust: "ثبت اصلاح",
    confirm: "تأیید بالینی نتیجه",
    saved: "نتیجه ذخیره شد و بازبینی ثبت گردید ✓",
  },
  dashboard: {
    title: "داشبورد کلینیکی تریکولوژی",
    patientsTab: "لیست بیماران",
    scalpMapTab: "نقشه پوست سر (Scalp Map)",
    analyticsTab: "گزارشات و تحلیل‌ها",
    syncStatus: "وضعیت همگام‌سازی",
    activeClinic: "کلینیک فعال",
    totalPatients: "تعداد مراجعین",
    totalAnalyses: "آنالیزهای انجام‌شده",
  },
};

const en = {
  login: {
    title: "Sign in to ScalpAI",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    rememberMe: "Remember me",
    forgotPass: "Forgot password?",
    quickRole: "Quick role",
    ownerRole: "Clinic Director (Owner)",
    trichoRole: "Trichologist Specialist",
    welcomeBack: "Welcome Back",
    subtitle: "Comprehensive Clinical Trichology & Scalp Intelligence Platform",
  },
  home: { title: "Welcome", logout: "Sign out" },
  common: {
    loading: "Loading…",
    delete: "Delete",
    back: "Back",
    langLabel: "Language",
    offline: "Offline Mode",
    online: "Online",
    success: "Success",
    error: "Error",
    unknownError: "Unknown error",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    all: "All",
    search: "Search…",
  },
  patients: {
    title: "Patients",
    name: "First name",
    family: "Last name",
    phone: "Phone",
    phonePh: "09xxxxxxxxx",
    add: "Add New Patient",
    checkInput: "Please check the input",
    colName: "Patient Name",
    colPhone: "Mobile Phone",
    consentCol: "Consent Form",
    consentBtn: "✍️ Digital Consent",
    formAria: "Patient creation form",
    noPatients: "No patients registered yet.",
    patientDetail: "Patient File",
  },
  consent: {
    title: "Digital Patient Consent Form",
    subtitle: "Acceptance of trichoscopy protocol and clinical records recording",
    legalNotice: "I hereby express my informed consent for trichoscopy scalp imaging and the processing of findings for treatment progress and clinical intelligence.",
    patientName: "Patient Name:",
    patientPhone: "Contact Phone:",
    signInstructions: "Please sign in the box below using a stylus or finger:",
    clearSignature: "Clear Signature",
    confirmSubmit: "Sign & Finalize",
    signedSuccess: "Consent form recorded successfully ✓",
    savedAt: "Signed at:",
  },
  gallery: {
    title: "Patient Gallery",
    back: "Back to patients",
    pick: "Choose Image",
    processing: "Processing…",
    empty: "No images recorded yet.",
    delete: "Delete",
    uploadFailed: "Upload to storage failed",
    consentBtn: "✍️ Digital Consent Form",
    patientLabel: "Patient",
    dateLabel: "Date recorded",
    qualityScore: "Quality Score",
    analyzeNow: "Start Clinical Analysis",
  },
  analysis: {
    title: "Analysis Result",
    back: "Back to gallery",
    running: "Running analysis engine…",
    elapsed: "Analysis time:",
    msUnit: "ms · model heuristic-v0",
    severity: "Overall severity:",
    redness: "Erythema & Redness",
    flakeTexture: "Flake Texture",
    densityProxy: "Hair Density Index",
    reviewTitle: "Expert Review & Supervision",
    notePh: "Clinical note (optional)",
    adjust: "Save Adjustment",
    confirm: "Confirm Result",
    saved: "Result saved and review recorded ✓",
  },
  dashboard: {
    title: "Clinical Trichology Dashboard",
    patientsTab: "Patients Directory",
    scalpMapTab: "Scalp Map",
    analyticsTab: "Analytics & Reports",
    syncStatus: "Sync Status",
    activeClinic: "Active Clinic",
    totalPatients: "Total Patients",
    totalAnalyses: "Analyses Performed",
  },
};

const initialLng = localStorage.getItem("lng") ?? "fa";

void i18n.use(initReactI18next).init({
  resources: { fa: { translation: fa }, en: { translation: en } },
  lng: initialLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Set document direction based on initial language
if (typeof document !== "undefined") {
  document.documentElement.dir = initialLng === "fa" ? "rtl" : "ltr";
  document.documentElement.lang = initialLng;
}

/** Persian digits helper — UI shows ۱۲۳ while data stays ASCII (rules §9). */
export function faNum(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (i18n.language !== "fa") return String(value);
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function toggleLang(): void {
  const next = i18n.language === "fa" ? "en" : "fa";
  localStorage.setItem("lng", next);
  if (typeof document !== "undefined") {
    document.documentElement.dir = next === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = next;
  }
  void i18n.changeLanguage(next);
}

export default i18n;
