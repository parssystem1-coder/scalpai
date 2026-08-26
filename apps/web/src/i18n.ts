import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const fa = {
  login: {
    title: "ورود به ScalpAI",
    email: "ایمیل",
    password: "رمز عبور",
    submit: "ورود",
  },
  home: { title: "خوش آمدید", logout: "خروج" },
  common: { loading: "در حال بارگذاری…", delete: "حذف", back: "بازگشت", langLabel: "زبان" },
  patients: {
    title: "بیماران",
    name: "نام",
    family: "نام خانوادگی",
    phone: "تلفن",
    phonePh: "09xxxxxxxxx",
    add: "افزودن",
    checkInput: "ورودی را بررسی کنید",
    colName: "نام",
    colPhone: "تلفن",
  },
  gallery: {
    title: "گالری بیمار",
    back: "بازگشت به بیماران",
    pick: "انتخاب تصویر",
    processing: "در حال پردازش…",
    empty: "تصویری ثبت نشده است.",
    delete: "حذف",
    uploadFailed: "آپلود به storage ناموفق بود",
  },
  analysis: {
    title: "نتیجه تحلیل",
    back: "بازگشت به گالری",
    running: "در حال اجرای موتور تحلیل…",
    elapsed: "زمان تحلیل:",
    msUnit: "میلی‌ثانیه · مدل heuristic-v0",
    severity: "شدت کل:",
    redness: "قرمزی",
    flakeTexture: "بافت پوسته",
    densityProxy: "شاخص تراکم",
    reviewTitle: "بازبینی متخصص",
    notePh: "یادداشت (اختیاری)",
    adjust: "ثبت اصلاح",
    confirm: "تأیید نتیجه",
    saved: "نتیجه ذخیره شد و بازبینی ثبت گردید ✓",
  },
};

const en = {
  login: { title: "Sign in to ScalpAI", email: "Email", password: "Password", submit: "Sign in" },
  home: { title: "Welcome", logout: "Sign out" },
  common: { loading: "Loading…", delete: "Delete", back: "Back", langLabel: "Language" },
  patients: {
    title: "Patients",
    name: "First name",
    family: "Last name",
    phone: "Phone",
    phonePh: "09xxxxxxxxx",
    add: "Add",
    checkInput: "Please check the input",
    colName: "Name",
    colPhone: "Phone",
  },
  gallery: {
    title: "Patient gallery",
    back: "Back to patients",
    pick: "Choose image",
    processing: "Processing…",
    empty: "No images yet.",
    delete: "Delete",
    uploadFailed: "Upload to storage failed",
  },
  analysis: {
    title: "Analysis result",
    back: "Back to gallery",
    running: "Running analysis engine…",
    elapsed: "Analysis time:",
    msUnit: "ms · model heuristic-v0",
    severity: "Overall severity:",
    redness: "Redness",
    flakeTexture: "Flake texture",
    densityProxy: "Density index",
    reviewTitle: "Expert review",
    notePh: "Note (optional)",
    adjust: "Save adjustment",
    confirm: "Confirm result",
    saved: "Result saved and review recorded ✓",
  },
};

void i18n.use(initReactI18next).init({
  resources: { fa: { translation: fa }, en: { translation: en } },
  lng: localStorage.getItem("lng") ?? "fa",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

/** Persian digits helper — UI shows ۱۲۳ while data stays ASCII (rules §9). */
export function faNum(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function toggleLang(): void {
  const next = i18n.language === "fa" ? "en" : "fa";
  localStorage.setItem("lng", next);
  void i18n.changeLanguage(next);
}

export default i18n;
