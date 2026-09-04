export interface JalaliDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export const PERSIAN_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const ENGLISH_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const PERSIAN_WEEKDAYS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
  "شنبه",
] as const;

/**
 * Converts English digits (0-9) to Persian digits (۰-۹).
 * Stays safe with null/undefined.
 */
export function toPersianDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/**
 * Converts Gregorian date components to Jalali (Solar Hijri) calendar components.
 * Algorithm by Kazimierz M. Borkowski.
 */
export function gregorianToJalali(
  gy: number,
  gm: number,
  gd: number,
): { year: number; month: number; day: number } {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { year: jy, month: jm, day: jd };
}

/**
 * Converts Jalali date components back to Gregorian calendar components.
 */
export function jalaliToGregorian(
  jy: number,
  jm: number,
  jd: number,
): { year: number; month: number; day: number } {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days =
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    78 +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && days >= sal_a[gm]) {
    days -= sal_a[gm];
    gm++;
  }
  return { year: gy, month: gm, day: days + 1 };
}

/**
 * Safely parse date from Date instance, ISO string, or epoch timestamp.
 */
export function parseDate(input: Date | string | number): Date {
  if (input instanceof Date) return input;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date input: ${String(input)}`);
  }
  return parsed;
}

/**
 * Extract Jalali date and time from a Gregorian Date or ISO string.
 */
export function getJalaliDate(input: Date | string | number): JalaliDate {
  const d = parseDate(input);
  const j = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return {
    year: j.year,
    month: j.month,
    day: j.day,
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
}

export interface FormatDateOptions {
  locale?: "fa" | "en";
  includeTime?: boolean;
  format?: "short" | "medium" | "full";
  persianDigits?: boolean;
}

/**
 * Centralized formatting utility for application dates (ADR-0019 / W25).
 * Defaults to Jalali in Persian with Persian digits, or Gregorian in English.
 */
export function formatDate(
  input: Date | string | number,
  options: FormatDateOptions = {},
): string {
  const d = parseDate(input);
  const locale = options.locale ?? "fa";
  const format = options.format ?? "medium";
  const includeTime = options.includeTime ?? false;
  const usePersianDigits = options.persianDigits ?? (locale === "fa");

  if (locale === "fa") {
    const j = getJalaliDate(d);
    const yStr = String(j.year);
    const mStr = String(j.month).padStart(2, "0");
    const dStr = String(j.day).padStart(2, "0");
    const timeStr = `${String(j.hour).padStart(2, "0")}:${String(j.minute).padStart(2, "0")}`;

    let result: string;
    if (format === "short") {
      result = `${yStr}/${mStr}/${dStr}`;
    } else if (format === "medium") {
      const monthName = PERSIAN_MONTH_NAMES[j.month - 1];
      result = `${j.day} ${monthName} ${yStr}`;
    } else {
      const weekdayName = PERSIAN_WEEKDAYS[d.getDay()];
      const monthName = PERSIAN_MONTH_NAMES[j.month - 1];
      result = `${weekdayName}، ${j.day} ${monthName} ${yStr}`;
    }

    if (includeTime) {
      result += ` ساعت ${timeStr}`;
    }

    return usePersianDigits ? toPersianDigits(result) : result;
  }

  // English formatting (Gregorian)
  const yStr = d.getFullYear();
  const mStr = String(d.getMonth() + 1).padStart(2, "0");
  const dStr = String(d.getDate()).padStart(2, "0");
  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  let result: string;
  if (format === "short") {
    result = `${yStr}-${mStr}-${dStr}`;
  } else if (format === "medium") {
    const monthName = ENGLISH_MONTH_NAMES[d.getMonth()];
    result = `${monthName} ${d.getDate()}, ${yStr}`;
  } else {
    const weekdayName = d.toLocaleDateString("en-US", { weekday: "long" });
    const monthName = ENGLISH_MONTH_NAMES[d.getMonth()];
    result = `${weekdayName}, ${monthName} ${d.getDate()}, ${yStr}`;
  }

  if (includeTime) {
    result += ` at ${timeStr}`;
  }

  return result;
}

/**
 * Convenient Jalali date formatter (ADR-19).
 */
export function formatToJalali(input: Date | string | number): string {
  return formatDate(input, { locale: "fa", format: "medium", persianDigits: true });
}

export interface RelativeTimeOptions {
  locale?: "fa" | "en";
  now?: Date;
  persianDigits?: boolean;
}

/**
 * Format relative elapsed time (e.g. "۵ دقیقه پیش" / "5 minutes ago").
 */
export function formatRelativeTime(
  input: Date | string | number,
  options: RelativeTimeOptions = {},
): string {
  const d = parseDate(input);
  const now = options.now ?? new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const locale = options.locale ?? "fa";
  const usePersianDigits = options.persianDigits ?? (locale === "fa");

  if (locale === "fa") {
    let text: string;
    if (diffSec < 45) {
      text = "چند لحظه پیش";
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      text = `${mins} دقیقه پیش`;
    } else if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      text = `${hours} ساعت پیش`;
    } else if (diffSec < 86400 * 2) {
      text = "دیروز";
    } else if (diffSec < 86400 * 7) {
      const days = Math.floor(diffSec / 86400);
      text = `${days} روز پیش`;
    } else {
      return formatDate(d, { locale: "fa", format: "short", persianDigits: usePersianDigits });
    }
    return usePersianDigits ? toPersianDigits(text) : text;
  }

  // English relative
  if (diffSec < 45) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (diffSec < 86400 * 2) return "Yesterday";
  if (diffSec < 86400 * 7) {
    const days = Math.floor(diffSec / 86400);
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return formatDate(d, { locale: "en", format: "short" });
}
