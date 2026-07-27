import { describe, it, expect } from 'vitest';
import {
  gregorianToPersian,
  persianToGregorian,
  persianToGregorianDate,
  getDaysInPersianMonth,
  isJalaliLeapYear,
  formatDateForDisplay,
  toPersianDigits,
  toEnglishDigits,
} from './jalaliDate';

/**
 * مرجع صحت: تقویم جلالی خودِ ICU (از طریق Intl).
 * اگر پیاده‌سازی ما با ICU اختلاف داشته باشد، پیاده‌سازی ما غلط است.
 */
const icuFormatter = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  timeZone: 'UTC',
});

function icuPersian(gy: number, gm1: number, gd: number): string {
  const parts = icuFormatter.formatToParts(new Date(Date.UTC(gy, gm1 - 1, gd, 12)));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // ICU ممکن است سال را با پسوند دوره بدهد؛ فقط ارقام را نگه می‌داریم
  return `${get('year').replace(/[^\d]/g, '')}/${Number(get('month'))}/${Number(get('day'))}`;
}

function ours(gy: number, gm1: number, gd: number): string {
  const p = gregorianToPersian(new Date(gy, gm1 - 1, gd, 12));
  return `${p.year}/${p.month + 1}/${p.day}`;
}

describe('gregorianToPersian — تطابق کامل با تقویم مرجع ICU', () => {
  it('برای هر روز از ۱۹۳۰ تا ۲۱۰۰ دقیقاً با ICU یکی است', () => {
    const mismatches: string[] = [];
    for (let gy = 1930; gy <= 2100; gy += 1) {
      for (let gm = 1; gm <= 12; gm += 1) {
        const daysInMonth = new Date(gy, gm, 0).getDate();
        for (let gd = 1; gd <= daysInMonth; gd += 1) {
          const mine = ours(gy, gm, gd);
          const icu = icuPersian(gy, gm, gd);
          if (mine !== icu) {
            mismatches.push(`${gy}-${gm}-${gd}: ours=${mine} icu=${icu}`);
          }
        }
      }
    }
    expect(mismatches.slice(0, 20)).toEqual([]);
    expect(mismatches).toHaveLength(0);
  });

  it('تاریخ‌های شاخصی که در پیاده‌سازی قبلی اشتباه بودند', () => {
    // رگرسیون: نسخهٔ قبل «۱۴۰۲/۱۳/۱» می‌داد (ماه سیزدهم!)
    expect(ours(2024, 3, 20)).toBe('1403/1/1');
    expect(ours(2024, 3, 19)).toBe('1402/12/29');
    // رگرسیون: کل سال ۲۰۲۹ در نسخهٔ قبل یک روز جابه‌جا بود
    expect(ours(2029, 3, 20)).toBe('1408/1/1');
    expect(ours(2029, 7, 1)).toBe(icuPersian(2029, 7, 1));
    // نوروزهایی که ۲۰ مارس‌اند (فرض غلط قبلی: همیشه ۲۱ مارس)
    expect(ours(2020, 3, 20)).toBe('1399/1/1');
    expect(ours(2025, 3, 21)).toBe('1404/1/1');
  });

  it('هرگز ماه خارج از بازهٔ ۰..۱۱ یا monthName خالی تولید نمی‌کند', () => {
    for (let gy = 1930; gy <= 2100; gy += 1) {
      for (let gm = 1; gm <= 12; gm += 1) {
        const p = gregorianToPersian(new Date(gy, gm - 1, 20, 12));
        expect(p.month).toBeGreaterThanOrEqual(0);
        expect(p.month).toBeLessThanOrEqual(11);
        expect(p.monthName).not.toBe('');
        expect(p.day).toBeGreaterThanOrEqual(1);
        expect(p.day).toBeLessThanOrEqual(31);
      }
    }
  });
});

describe('رفت‌وبرگشت (round-trip)', () => {
  it('میلادی → شمسی → میلادی همان روز اول را می‌دهد', () => {
    for (let gy = 1950; gy <= 2080; gy += 1) {
      for (let gm = 1; gm <= 12; gm += 1) {
        for (const gd of [1, 9, 17, 28]) {
          const original = new Date(gy, gm - 1, gd, 12);
          const p = gregorianToPersian(original);
          const back = persianToGregorianDate(p.year, p.month, p.day);
          expect(back.toDateString()).toBe(original.toDateString());
        }
      }
    }
  });

  it('persianToGregorian رشتهٔ ISO درست می‌سازد', () => {
    expect(persianToGregorian('1404/01/01')).toBe('2025-03-21');
    expect(persianToGregorian('1403/01/01')).toBe('2024-03-20');
    expect(persianToGregorian('1405/05/04')).toBe('2026-07-26');
  });

  it('ارقام فارسی را هم می‌پذیرد', () => {
    expect(persianToGregorian('۱۴۰۴/۰۱/۰۱')).toBe('2025-03-21');
  });

  it('ورودی نامعتبر رشتهٔ خالی می‌دهد (نه تاریخ اشتباه)', () => {
    expect(persianToGregorian('')).toBe('');
    expect(persianToGregorian('abc')).toBe('');
    expect(persianToGregorian('1404/13/01')).toBe('');
    expect(persianToGregorian('1404/00/01')).toBe('');
    expect(persianToGregorian('1404/01/32')).toBe('');
    // ۳۰ اسفند در سال غیرکبیسه وجود ندارد
    expect(persianToGregorian('1404/12/30')).toBe('');
  });
});

describe('getDaysInPersianMonth و کبیسه', () => {
  it('شش ماه اول ۳۱ روز، پنج ماه بعد ۳۰ روز', () => {
    for (let m = 0; m < 6; m += 1) expect(getDaysInPersianMonth(1404, m)).toBe(31);
    for (let m = 6; m < 11; m += 1) expect(getDaysInPersianMonth(1404, m)).toBe(30);
  });

  it('اسفند در سال کبیسه ۳۰ و در غیرکبیسه ۲۹ روز است', () => {
    expect(getDaysInPersianMonth(1403, 11)).toBe(30); // کبیسه
    expect(getDaysInPersianMonth(1404, 11)).toBe(29);
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
  });

  it('طول سال با تعداد روزهای واقعی بین دو نوروز یکی است', () => {
    for (let jy = 1380; jy <= 1430; jy += 1) {
      const sum = Array.from({ length: 12 }, (_, m) => getDaysInPersianMonth(jy, m))
        .reduce((a, b) => a + b, 0);
      const thisNowruz = persianToGregorianDate(jy, 0, 1);
      const nextNowruz = persianToGregorianDate(jy + 1, 0, 1);
      const actual = Math.round((nextNowruz.getTime() - thisNowruz.getTime()) / 86400000);
      expect(sum).toBe(actual);
    }
  });

  it('ماه خارج از بازه صفر می‌دهد (نه NaN)', () => {
    expect(getDaysInPersianMonth(1404, -1)).toBe(0);
    expect(getDaysInPersianMonth(1404, 12)).toBe(0);
  });
});

describe('formatDateForDisplay', () => {
  it('ISO را به شمسی صفرپرشده تبدیل می‌کند', () => {
    expect(formatDateForDisplay('2026-07-26')).toBe('1405/05/04');
    expect(formatDateForDisplay('2025-03-21')).toBe('1404/01/01');
  });

  it('ورودی خالی/نامعتبر باعث کرش نمی‌شود', () => {
    expect(formatDateForDisplay('')).toBe('');
    expect(formatDateForDisplay('not-a-date')).toBe('not-a-date');
  });
});

describe('تبدیل ارقام', () => {
  it('رفت و برگشت ارقام', () => {
    expect(toPersianDigits('1404/05/03')).toBe('۱۴۰۴/۰۵/۰۳');
    expect(toEnglishDigits('۱۴۰۴/۰۵/۰۳')).toBe('1404/05/03');
    expect(toEnglishDigits(toPersianDigits('2026'))).toBe('2026');
  });
});
