import type { ErrorBody } from "./contracts.js";

export type SupportedLocale = "fa" | "en";

export interface LocalizedErrorMap {
  unauthorized: string;
  forbidden: string;
  notFound: string;
  conflict: string;
  invalidImage: string;
  qualityFail: string;
  validation: string;
  quotaExceeded: string;
  featureDisabled: (feature: string) => string;
  tooManyRequests: string;
  loginLocked: (seconds: number) => string;
  internal: string;
}

export const ERROR_MESSAGES: Record<SupportedLocale, LocalizedErrorMap> = {
  fa: {
    unauthorized: "اعتبارنامه نامعتبر است",
    forbidden: "دسترسی مجاز نیست",
    notFound: "یافت نشد",
    conflict: "رکورد تکراری است",
    invalidImage: "محتوای فایل با نوع تصویر اعلام‌شده نمی‌خواند",
    qualityFail: "کیفیت تصویر برای ثبت کافی نیست",
    validation: "ورودی نامعتبر",
    quotaExceeded: "سهمیه پلن تکمیل شده است",
    featureDisabled: (f: string) => `فیچر فعال نیست: ${f}`,
    tooManyRequests: "تعداد تلاش‌ها بیش از حد مجاز است",
    loginLocked: (s: number) =>
      `به‌دلیل تلاش‌های ناموفق، ورود موقتاً قفل شد. ${s} ثانیه دیگر تلاش کنید`,
    internal: "خطای داخلی سرور",
  },
  en: {
    unauthorized: "Invalid credentials or unauthorized access",
    forbidden: "Access forbidden",
    notFound: "Resource not found",
    conflict: "Conflict with existing record",
    invalidImage: "File content does not match the declared image type",
    qualityFail: "Image quality is insufficient for trichology registration",
    validation: "Validation error in request payload",
    quotaExceeded: "Plan quota has been exceeded",
    featureDisabled: (f: string) => `Feature is not enabled: ${f}`,
    tooManyRequests: "Too many requests, please slow down",
    loginLocked: (s: number) =>
      `Account temporarily locked due to repeated failed logins. Please retry after ${s} seconds`,
    internal: "Internal server error",
  },
};

export function resolveLocale(header?: string | null): SupportedLocale {
  if (!header) return "fa";
  const lower = header.toLowerCase();
  if (lower.startsWith("en") || lower.includes("en-us") || lower.includes("en-gb")) {
    return "en";
  }
  return "fa";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ErrorBody,
  ) {
    super(body.message);
  }
}

function resolveMsg(defaultMsg: string, arg?: string): string {
  if (!arg) return defaultMsg;
  if (arg === "fa") return defaultMsg;
  if (arg === "en") return ""; // handled by caller
  return arg;
}

export const errors = {
  unauthorized: (msgOrLocale?: string) => {
    const isEn = msgOrLocale === "en";
    const msg = isEn ? ERROR_MESSAGES.en.unauthorized : resolveMsg(ERROR_MESSAGES.fa.unauthorized, msgOrLocale);
    return new ApiError(401, { code: "UNAUTHORIZED", message: msg });
  },
  forbidden: (locale: SupportedLocale = "fa") =>
    new ApiError(403, { code: "FORBIDDEN", message: ERROR_MESSAGES[locale].forbidden }),
  notFound: (locale: SupportedLocale = "fa") =>
    new ApiError(404, { code: "NOT_FOUND", message: ERROR_MESSAGES[locale].notFound }),
  conflict: (msgOrLocale?: string) => {
    const isEn = msgOrLocale === "en";
    const msg = isEn ? ERROR_MESSAGES.en.conflict : resolveMsg(ERROR_MESSAGES.fa.conflict, msgOrLocale);
    return new ApiError(409, { code: "CONFLICT", message: msg });
  },
  invalidImage: (locale: SupportedLocale = "fa") =>
    new ApiError(400, { code: "INVALID_IMAGE", message: ERROR_MESSAGES[locale].invalidImage }),
  qualityFail: (reasons: string[], locale: SupportedLocale = "fa") =>
    new ApiError(400, {
      code: "QUALITY_FAIL",
      message: ERROR_MESSAGES[locale].qualityFail,
      details: { reasons },
    }),
  validation: (details: unknown, locale: SupportedLocale = "fa") =>
    new ApiError(400, {
      code: "VALIDATION_ERROR",
      message: ERROR_MESSAGES[locale].validation,
      details,
    }),
  quotaExceeded: (locale: SupportedLocale = "fa") =>
    new ApiError(403, { code: "QUOTA_EXCEEDED", message: ERROR_MESSAGES[locale].quotaExceeded }),
  featureDisabled: (f: string, locale: SupportedLocale = "fa") =>
    new ApiError(403, {
      code: "FEATURE_DISABLED",
      message: ERROR_MESSAGES[locale].featureDisabled(f),
    }),
  tooManyRequests: (msgOrLocale?: string) => {
    const isEn = msgOrLocale === "en";
    const msg = isEn
      ? ERROR_MESSAGES.en.tooManyRequests
      : resolveMsg(ERROR_MESSAGES.fa.tooManyRequests, msgOrLocale);
    return new ApiError(429, { code: "TOO_MANY_REQUESTS", message: msg });
  },
  loginLocked: (retryAfterSecs: number, locale: SupportedLocale = "fa") =>
    new ApiError(429, {
      code: "LOGIN_LOCKED",
      message: ERROR_MESSAGES[locale].loginLocked(retryAfterSecs),
      details: { retryAfterSecs },
    }),
  forLocale: (locale: SupportedLocale) => ({
    unauthorized: (customMsg?: string) =>
      new ApiError(401, { code: "UNAUTHORIZED", message: customMsg ?? ERROR_MESSAGES[locale].unauthorized }),
    forbidden: () =>
      new ApiError(403, { code: "FORBIDDEN", message: ERROR_MESSAGES[locale].forbidden }),
    notFound: () =>
      new ApiError(404, { code: "NOT_FOUND", message: ERROR_MESSAGES[locale].notFound }),
    conflict: (customMsg?: string) =>
      new ApiError(409, { code: "CONFLICT", message: customMsg ?? ERROR_MESSAGES[locale].conflict }),
    invalidImage: () =>
      new ApiError(400, { code: "INVALID_IMAGE", message: ERROR_MESSAGES[locale].invalidImage }),
    qualityFail: (reasons: string[]) =>
      new ApiError(400, { code: "QUALITY_FAIL", message: ERROR_MESSAGES[locale].qualityFail, details: { reasons } }),
    validation: (details: unknown) =>
      new ApiError(400, { code: "VALIDATION_ERROR", message: ERROR_MESSAGES[locale].validation, details }),
    quotaExceeded: () =>
      new ApiError(403, { code: "QUOTA_EXCEEDED", message: ERROR_MESSAGES[locale].quotaExceeded }),
    featureDisabled: (f: string) =>
      new ApiError(403, { code: "FEATURE_DISABLED", message: ERROR_MESSAGES[locale].featureDisabled(f) }),
    tooManyRequests: (customMsg?: string) =>
      new ApiError(429, { code: "TOO_MANY_REQUESTS", message: customMsg ?? ERROR_MESSAGES[locale].tooManyRequests }),
    loginLocked: (retryAfterSecs: number) =>
      new ApiError(429, { code: "LOGIN_LOCKED", message: ERROR_MESSAGES[locale].loginLocked(retryAfterSecs), details: { retryAfterSecs } }),
  }),
};
