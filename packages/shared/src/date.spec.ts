import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatRelativeTime,
  getJalaliDate,
  gregorianToJalali,
  jalaliToGregorian,
  toPersianDigits,
} from "./date.js";

describe("Jalali Date Utilities (W25)", () => {
  it("converts known milestone dates accurately", () => {
    // 2026-03-21 -> 1405-01-01 (Nowruz)
    const nowruz = gregorianToJalali(2026, 3, 21);
    expect(nowruz).toEqual({ year: 1405, month: 1, day: 1 });

    const backToGreg = jalaliToGregorian(1405, 1, 1);
    expect(backToGreg).toEqual({ year: 2026, month: 3, day: 21 });

    // 2024-03-20 -> 1403-01-01 (Leap year)
    const leapNowruz = gregorianToJalali(2024, 3, 20);
    expect(leapNowruz).toEqual({ year: 1403, month: 1, day: 1 });
  });

  it("converts English digits to Persian digits", () => {
    expect(toPersianDigits("1403/06/15")).toBe("۱۴۰۳/۰۶/۱۵");
    expect(toPersianDigits(12345)).toBe("۱۲۳۴۵");
    expect(toPersianDigits(null)).toBe("");
  });

  it("formats dates in Persian with default Persian digits", () => {
    const d = new Date("2026-03-21T10:30:00Z");
    const shortDate = formatDate(d, { locale: "fa", format: "short" });
    expect(shortDate).toContain("۱۴۰۵/۰۱/۰۱");

    const mediumDate = formatDate(d, { locale: "fa", format: "medium" });
    expect(mediumDate).toContain("فروردین");
    expect(mediumDate).toContain("۱۴۰۵");
  });

  it("formats dates in English (Gregorian)", () => {
    const d = new Date("2026-03-21T10:30:00Z");
    const shortDate = formatDate(d, { locale: "en", format: "short" });
    expect(shortDate).toBe("2026-03-21");

    const mediumDate = formatDate(d, { locale: "en", format: "medium" });
    expect(mediumDate).toContain("March 21, 2026");
  });

  it("calculates relative time correctly", () => {
    const now = new Date("2026-09-04T12:00:00Z");
    const twoMinutesAgo = new Date("2026-09-04T11:58:00Z");
    const threeHoursAgo = new Date("2026-09-04T09:00:00Z");

    expect(formatRelativeTime(twoMinutesAgo, { locale: "fa", now })).toBe("۲ دقیقه پیش");
    expect(formatRelativeTime(threeHoursAgo, { locale: "fa", now })).toBe("۳ ساعت پیش");

    expect(formatRelativeTime(twoMinutesAgo, { locale: "en", now })).toBe("2 minutes ago");
    expect(formatRelativeTime(threeHoursAgo, { locale: "en", now })).toBe("3 hours ago");
  });

  it("extracts JalaliDate components cleanly", () => {
    const d = new Date("2026-09-04T15:45:00Z");
    const j = getJalaliDate(d);
    expect(j.year).toBe(1405);
    expect(j.month).toBe(6); // Shahrivar
    expect(j.day).toBe(13);
  });
});
