import i18n from "../i18n.js";

/**
 * رشته‌های تکمیلی صندوق ورودی (فاز ۵b).
 *
 * صفحه از ابتدا به `inbox.loadingBody`، `inbox.replyFailed` و
 * `inbox.dismissError` ارجاع می‌داد، ولی هیچ‌کدام در باندل اصلی ثبت نشده بودند —
 * و i18next برای کلید ناموجود خودِ کلید را برمی‌گرداند، پس کاربر متن
 * «inbox.replyFailed» را می‌دید. اینها به‌صورت deep-merge روی همان namespace
 * ثبت می‌شوند تا i18n.ts (۷۹ کیلوبایت) دست نخورد.
 */
const fa = {
  loadingBody: "در حال بارگذاری متن پیام…",
  loadFailed: "دریافت صندوق ورودی ناموفق بود",
  bodyFailed: "متن پیام دریافت نشد؛ نمایش نسخه محافظت‌شده",
  replyFailed: "ارسال پاسخ ناموفق بود",
  dismissError: "بستن پیام خطا",
  retry: "تلاش دوباره",
};

const en = {
  loadingBody: "Loading message body…",
  loadFailed: "Could not load the inbox",
  bodyFailed: "Message body unavailable; showing the protected preview",
  replyFailed: "Could not send the reply",
  dismissError: "Dismiss error",
  retry: "Try again",
};

i18n.addResourceBundle("fa", "translation", { inbox: fa }, true, true);
i18n.addResourceBundle("en", "translation", { inbox: en }, true, true);
