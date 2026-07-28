import { format, parse, isValid } from 'date-fns';

/**
 * تبدیل تاریخ جلالی (شمسی) ↔ میلادی
 * -----------------------------------------------------------------------
 * نسخهٔ قبلی فرض می‌کرد نوروز *همیشه* ۲۱ مارس است. این فرض غلط است — نوروز
 * بین ۲۰ و ۲۱ مارس نوسان دارد. نتیجه:
 *   - در حدود نیمی از سال‌ها تاریخ یک روز جابه‌جا محاسبه می‌شد
 *     (مثلاً کل سال ۲۰۲۹ اشتباه بود، در حالی که ۲۰۲۶ درست بود — به همین
 *     دلیل باگ در تست دستی دیده نمی‌شد).
 *   - در ۲۰ مارسِ سال‌های کبیسه، خروجی «ماه ۱۳» تولید می‌شد و
 *     PERSIAN_MONTHS[12] برابر undefined می‌شد.
 *
 * حالا از الگوریتم دقیق jalaali-js (بر پایهٔ جدول breaks و محاسبهٔ Julian Day
 * Number) استفاده می‌شود که خروجی‌اش با تقویم مرجع ICU
 * (Intl.DateTimeFormat با calendar=persian) کاملاً یکسان است.
 * تست: src/lib/jalaliDate.test.ts
 *
 * چرا کتابخانه اضافه نشد: الگوریتم ~۶۰ خط است و افزودن یک وابستگی جدید به
 * زنجیرهٔ تأمین یک اپ پزشکی آفلاین، هزینهٔ بیشتری از منفعتش دارد.
 */

/** Jalali year ≈ Gregorian year − 621 */
export const JALALI_YEAR_OFFSET = 621;

export const BIRTH_YEAR_LOOKBACK = 90;
export const SESSION_YEAR_LOOKAHEAD = 10;

const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
] as const;

// تبدیل عدد انگلیسی به فارسی
export const toPersianDigits = (str: string) => {
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/\d/g, (digit) => persianDigits[parseInt(digit)]);
};

// تبدیل عدد فارسی به انگلیسی
export const toEnglishDigits = (str: string) => {
  const englishDigits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.replace(/[۰-۹]/g, (digit) => {
    const index = persianDigits.indexOf(digit);
    return index >= 0 ? englishDigits[index] : digit;
  });
};

// =============== هستهٔ محاسباتی (jalaali-js) ===============

/** تقسیم صحیح رو به پایین */
const div = (a: number, b: number) => Math.trunc(a / b);
/** باقیماندهٔ ریاضی */
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

/**
 * سال‌های «شکست» در چرخهٔ ۳۳ سالهٔ تقویم جلالی.
 * محدودهٔ معتبر: ۱۱- تا ۳۱۷۷ شمسی — بسیار فراتر از نیاز این برنامه.
 */
const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181,
  1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

const JALALI_MIN_YEAR = BREAKS[0];
const JALALI_MAX_YEAR = BREAKS[BREAKS.length - 1];

interface JalCalResult {
  /** ۰ یعنی سال کبیسه است */
  leap: number;
  /** سال میلادی متناظر با فروردینِ این سال */
  gy: number;
  /** روزِ ماه مارس که نوروز در آن می‌افتد (۲۰ یا ۲۱) */
  march: number;
}

/**
 * محاسبهٔ کبیسه بودن و روز دقیق نوروز برای یک سال جلالی.
 * @throws اگر سال خارج از محدودهٔ پشتیبانی‌شده باشد
 */
function jalCal(jy: number): JalCalResult {
  if (!Number.isFinite(jy) || jy < JALALI_MIN_YEAR || jy >= JALALI_MAX_YEAR) {
    throw new RangeError(`Invalid Jalaali year: ${jy}`);
  }

  const gy = jy + JALALI_YEAR_OFFSET;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  for (let i = 1; i < BREAKS.length; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;

  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

/** تاریخ میلادی → Julian Day Number */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** Julian Day Number → تاریخ میلادی */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** تاریخ جلالی (ماه ۱-پایه) → Julian Day Number */
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** Julian Day Number → تاریخ جلالی (ماه ۱-پایه) */
function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - JALALI_YEAR_OFFSET;
  const r = jalCal(jy);
  const jdn1f = g2d(r.gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    // سال جلالیِ قبل. توجه: r.leap مربوط به همان jy اولیه است و یعنی
    // «چند سال از آخرین کبیسه گذشته» — پس مقدار ۱ یعنی سالِ قبل کبیسه بوده.
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

// =============== API عمومی ===============

/** آیا سال جلالی کبیسه است؟ */
export const isJalaliLeapYear = (year: number): boolean => {
  try {
    return jalCal(year).leap === 0;
  } catch {
    return false;
  }
};

/** تعداد روز ماه شمسی (monthIndex: ۰=فروردین … ۱۱=اسفند) */
export const getDaysInPersianMonth = (year: number, monthIndex: number): number => {
  if (monthIndex < 0 || monthIndex > 11) return 0;
  if (monthIndex < 6) return 31;
  if (monthIndex < 11) return 30;
  return isJalaliLeapYear(year) ? 30 : 29;
};

export interface PersianDateParts {
  /** سال شمسی */
  year: number;
  /** ماه صفرپایه: ۰=فروردین … ۱۱=اسفند */
  month: number;
  day: number;
  monthName: string;
}

/**
 * تبدیل تاریخ میلادی به شمسی.
 * فیلدهای *محلی* تاریخ (getFullYear/getMonth/getDate) مبنا هستند تا نتیجه با
 * آنچه کاربر روی تقویم سیستمش می‌بیند یکسان باشد.
 */
export const gregorianToPersian = (date: Date): PersianDateParts => {
  const jdn = g2d(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const { jy, jm, jd } = d2j(jdn);
  // jm از الگوریتم ۱-پایه است؛ API این ماژول صفرپایه است
  const monthIndex = jm - 1;
  return {
    year: jy,
    month: monthIndex,
    day: jd,
    monthName: PERSIAN_MONTHS[monthIndex] ?? '',
  };
};

/**
 * تبدیل تاریخ شمسی («۱۴۰۴/۰۵/۰۳» یا با ارقام فارسی) به رشتهٔ میلادی ISO.
 * @returns 'yyyy-MM-dd' یا رشتهٔ خالی در صورت ورودی نامعتبر
 */
export const persianToGregorian = (persianDate: string): string => {
  try {
    if (!persianDate) return '';

    const cleanDate = toEnglishDigits(persianDate);
    const [persianYear, persianMonth, persianDay] = cleanDate.split('/').map(Number);

    if (!Number.isFinite(persianYear) || !Number.isFinite(persianMonth) || !Number.isFinite(persianDay)) {
      return '';
    }
    if (persianMonth < 1 || persianMonth > 12) return '';
    if (persianDay < 1 || persianDay > getDaysInPersianMonth(persianYear, persianMonth - 1)) return '';

    return format(persianToGregorianDate(persianYear, persianMonth - 1, persianDay), 'yyyy-MM-dd');
  } catch (error) {
    console.error('Error converting Persian to Gregorian:', error);
    return '';
  }
};

/** تبدیل تاریخ شمسی به آبجکت Date — persianMonth صفرپایه است */
export const persianToGregorianDate = (
  persianYear: number,
  persianMonth: number,
  persianDay: number,
): Date => {
  const jdn = j2d(persianYear, persianMonth + 1, persianDay);
  const { gy, gm, gd } = d2g(jdn);
  // ساخت تاریخ محلی (نه UTC) تا با gregorianToPersian متقارن بماند
  return new Date(gy, gm - 1, gd);
};

/** تبدیل تاریخ میلادی ISO به رشتهٔ نمایشی شمسی */
export const formatDateForDisplay = (isoDate: string) => {
  try {
    if (!isoDate) return '';

    const date = parse(isoDate, 'yyyy-MM-dd', new Date());
    if (!isValid(date)) return isoDate;

    const persianDate = gregorianToPersian(date);
    // نمایش با ارقام انگلیسی — تقویم همچنان جلالی است
    return `${persianDate.year}/${(persianDate.month + 1).toString().padStart(2, '0')}/${persianDate.day.toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('Error formatting date for display:', error);
    return isoDate;
  }
};

/** Alias for storing Jalali input as ISO Gregorian `yyyy-MM-dd` */
export const formatDateForStorage = (persianDate: string) => persianToGregorian(persianDate);
