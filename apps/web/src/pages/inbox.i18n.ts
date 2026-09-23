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
  handledFailed: "ثبت رسیدگی ناموفق بود",
  dismissError: "بستن پیام خطا",
  retry: "تلاش دوباره",
  markHandled: "رسیدگی شد",
  handling: "در حال ثبت…",
  handled: "رسیدگی ثبت شده",
  handledHint: "ثبت رسیدگی وضعیت پیام را به‌روز می‌کند؛ ارسال پاسخِ جدید از موتور پیگیری انجام می‌شود.",
};

const en = {
  loadingBody: "Loading message body…",
  loadFailed: "Could not load the inbox",
  bodyFailed: "Message body unavailable; showing the protected preview",
  handledFailed: "Could not mark as handled",
  dismissError: "Dismiss error",
  retry: "Try again",
  markHandled: "Mark handled",
  handling: "Recording…",
  handled: "Marked as handled",
  handledHint: "Marking updates the message state; new follow-ups are sent by the aftercare engine.",
};

i18n.addResourceBundle("fa", "translation", { inbox: fa }, true, true);
i18n.addResourceBundle("en", "translation", { inbox: en }, true, true);
