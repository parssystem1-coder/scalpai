/**
 * Date + time presentation (ADR-0019 / W25).
 *
 * Phase 10 (M13) changed two things:
 *
 *  1. Every formatter accepts an IANA `timeZone`. `clinics.timezone` has been the
 *     server's source of truth since phase 8 (`fn_clinic_period_start`), but the
 *     UI still rendered whatever the browser's zone happened to be - so a clinic
 *     in Asia/Tehran viewed from a laptop left on UTC saw a session move to the
 *     previous day. The zone is now an explicit input with one default constant.
 *
 *  2. `formatRelativeTime` no longer clamps the future to zero. It used to print
 *     "چند لحطه پیش" for an appointment three days from now, which is not a
 *     rounding error - it is the wrong tense on a scheduling surface.
 */

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * The platform default. Mirrors the `clinics.timezone` column default so the
 * client and the database agree when a caller does not pass one explicitly.
 */
export const CLINIC_DEFAULT_TIMEZONE = "Asia/Tehran";

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

export const ENGLISH_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Converts English digits (0-9) to Persian digits (۰-۹).
 * Stays safe with null/undefined.
 */
export function toPersianDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  // M19: indexing a string yields `string | undefined`, which String#replace
  // will not accept as a callback result. Falling back to the matched digit
  // means an unexpected match can never render the text "undefined".
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)] ?? d);
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
  // M19: `gm` is 1..12 for every caller (it comes from `wallClockIn`), so the
  // guard is a type-level one and the table read below is always in range.
  const cumulativeDaysBeforeMonth = g_d_m[gm - 1] ?? 0;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    cumulativeDaysBeforeMonth;
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
  // M19: the original condition read `sal_a[gm]` twice per iteration under a
  // `gm < 13` bound. Reading it once and breaking on an out-of-range index is
  // the same loop, minus two `number | undefined` reads.
  while (gm < 13) {
    const monthDays = sal_a[gm];
    if (monthDays === undefined || days < monthDays) break;
    days -= monthDays;
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

/** Calendar fields of an instant AS SEEN IN a given zone (M13). */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, matching Date#getDay(). */
  weekday: number;
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Resolve the wall clock of `input` in `timeZone`. With no zone the host zone is
 * used, which keeps every existing call site byte-identical.
 */
export function wallClockIn(input: Date | string | number, timeZone?: string): WallClock {
  const d = parseDate(input);
  if (!timeZone) {
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
      second: d.getSeconds(),
      weekday: d.getDay(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(d);
  const at = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(at("year")),
    month: Number(at("month")),
    day: Number(at("day")),
    // Some ICU builds emit "24" for midnight under hour12:false.
    hour: Number(at("hour")) % 24,
    minute: Number(at("minute")),
    second: Number(at("second")),
    weekday: WEEKDAY_INDEX[at("weekday")] ?? 0,
  };
}

/**
 * Extract Jalali date and time from a Gregorian Date or ISO string, optionally
 * as seen in a specific zone (M13).
 */
export function getJalaliDate(input: Date | string | number, timeZone?: string): JalaliDate {
  const wall = wallClockIn(input, timeZone);
  const j = gregorianToJalali(wall.year, wall.month, wall.day);
  return {
    year: j.year,
    month: j.month,
    day: j.day,
    hour: wall.hour,
    minute: wall.minute,
    second: wall.second,
  };
}

export interface FormatDateOptions {
  locale?: "fa" | "en";
  includeTime?: boolean;
  format?: "short" | "medium" | "full";
  persianDigits?: boolean;
  /** IANA zone, e.g. the clinic's `timezone` column. Defaults to the host zone. */
  timeZone?: string;
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
  const wall = wallClockIn(d, options.timeZone);

  if (locale === "fa") {
    const j = gregorianToJalali(wall.year, wall.month, wall.day);
    const yStr = String(j.year);
    const mStr = String(j.month).padStart(2, "0");
    const dStr = String(j.day).padStart(2, "0");
    const timeStr = `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`;

    let result: string;
    if (format === "short") {
      result = `${yStr}/${mStr}/${dStr}`;
    } else if (format === "medium") {
      const monthName = PERSIAN_MONTH_NAMES[j.month - 1];
      result = `${j.day} ${monthName} ${yStr}`;
    } else {
      const weekdayName = PERSIAN_WEEKDAYS[wall.weekday];
      const monthName = PERSIAN_MONTH_NAMES[j.month - 1];
      result = `${weekdayName}، ${j.day} ${monthName} ${yStr}`;
    }

    if (includeTime) {
      result += ` ساعت ${timeStr}`;
    }

    return usePersianDigits ? toPersianDigits(result) : result;
  }

  // English formatting (Gregorian)
  const yStr = wall.year;
  const mStr = String(wall.month).padStart(2, "0");
  const dStr = String(wall.day).padStart(2, "0");
  const timeStr = `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`;

  let result: string;
  if (format === "short") {
    result = `${yStr}-${mStr}-${dStr}`;
  } else if (format === "medium") {
    const monthName = ENGLISH_MONTH_NAMES[wall.month - 1];
    result = `${monthName} ${wall.day}, ${yStr}`;
  } else {
    const weekdayName = ENGLISH_WEEKDAYS[wall.weekday];
    const monthName = ENGLISH_MONTH_NAMES[wall.month - 1];
    result = `${weekdayName}, ${monthName} ${wall.day}, ${yStr}`;
  }

  if (includeTime) {
    result += ` at ${timeStr}`;
  }

  return result;
}

/**
 * Convenient Jalali date formatter (ADR-19).
 */
export function formatToJalali(input: Date | string | number, timeZone?: string): string {
  return formatDate(input, { locale: "fa", format: "medium", persianDigits: true, timeZone });
}

export interface RelativeTimeOptions {
  locale?: "fa" | "en";
  now?: Date;
  persianDigits?: boolean;
  /** Used only for the absolute fallback beyond a week. */
  timeZone?: string;
}

/**
 * Format relative elapsed time (e.g. "۵ دقیقه پیش" / "5 minutes ago").
 *
 * Phase 10 (M13): a timestamp in the FUTURE is rendered in the future tense.
 * Sessions, license expiry and quota period ends are all future-dated, and the
 * old `Math.max(0, ...)` turned every one of them into "چند لحطه پیش".
 */
export function formatRelativeTime(
  input: Date | string | number,
  options: RelativeTimeOptions = {},
): string {
  const d = parseDate(input);
  const now = options.now ?? new Date();
  const diffMs = now.getTime() - d.getTime();
  const future = diffMs < 0;
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  const locale = options.locale ?? "fa";
  const usePersianDigits = options.persianDigits ?? (locale === "fa");

  if (locale === "fa") {
    let text: string;
    if (diffSec < 45) {
      text = future ? "در چند لحطه" : "چند لحطه پیش";
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      text = future ? `${mins} دقیقه دیگر` : `${mins} دقیقه پیش`;
    } else if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      text = future ? `${hours} ساعت دیگر` : `${hours} ساعت پیش`;
    } else if (diffSec < 86400 * 2) {
      text = future ? "فردا" : "دیروز";
    } else if (diffSec < 86400 * 7) {
      const days = Math.floor(diffSec / 86400);
      text = future ? `${days} روز دیگر` : `${days} روز پیش`;
    } else {
      return formatDate(d, {
        locale: "fa",
        format: "short",
        persianDigits: usePersianDigits,
        timeZone: options.timeZone,
      });
    }
    return usePersianDigits ? toPersianDigits(text) : text;
  }

  // English relative
  if (diffSec < 45) return future ? "In a moment" : "Just now";
  if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    return future ? `In ${mins} minutes` : `${mins} minutes ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    if (future) return hours === 1 ? "In 1 hour" : `In ${hours} hours`;
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  if (diffSec < 86400 * 2) return future ? "Tomorrow" : "Yesterday";
  if (diffSec < 86400 * 7) {
    const days = Math.floor(diffSec / 86400);
    if (future) return days === 1 ? "In 1 day" : `In ${days} days`;
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return formatDate(d, { locale: "en", format: "short", timeZone: options.timeZone });
}
