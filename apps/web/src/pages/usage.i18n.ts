import i18n from "../i18n.js";

/**
 * رشته‌های صفحه مصرف پلن (موج ۳ / D10) — deep-merge روی همان namespace تا
 * i18n.ts دست نخورد (همان الگوی inbox.i18n.ts).
 */
const fa = {
  title: "مصرف پلن",
  subtitle: "مصرف دوره‌ی جاری کلینیک نسبت به سقف پلن.",
  loading: "در حال بارگذاری…",
  loadFailed: "دریافت مصرف پلن ناموفق بود",
  exceededBanner: "سقف پلن در این دوره پر شده است؛ ارسال پیام تا ارتقا رد می‌شود.",
  upgradeCta: "ارتقای پلن",
  unlimitedValue: "{{used}} مصرف‌شده — بدون سقف",
  limitedValue: "{{used}} از {{limit}}",
  metric: {
    upload_mb: "آپلود (مگابایت)",
    analyses: "تحلیل‌ها",
    messages_sent: "پیام‌های ارسالی",
  },
};

const en = {
  title: "Plan usage",
  subtitle: "Current clinic usage against the plan ceiling.",
  loading: "Loading…",
  loadFailed: "Could not load plan usage",
  exceededBanner: "A plan ceiling is reached this period; message sending is refused until you upgrade.",
  upgradeCta: "Upgrade plan",
  unlimitedValue: "{{used}} used — unmetered",
  limitedValue: "{{used}} of {{limit}}",
  metric: {
    upload_mb: "Uploads (MB)",
    analyses: "Analyses",
    messages_sent: "Messages sent",
  },
};

i18n.addResourceBundle("fa", "translation", { usage: fa }, true, true);
i18n.addResourceBundle("en", "translation", { usage: en }, true, true);
