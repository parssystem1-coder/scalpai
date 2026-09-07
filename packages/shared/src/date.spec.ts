import { describe, expect, it } from "vitest";
import {
  CLINIC_DEFAULT_TIMEZONE,
  formatDate,
  formatRelativeTime,
  getJalaliDate,
  gregorianToJalali,
  jalaliToGregorian,
  toPersianDigits,
  wallClockIn,
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
    const shortDate = formatDate(d, { locale: "fa", format: "short", timeZone: "UTC" });
    expect(shortDate).toContain("۱۴۰۵/۰۱/۰۱");

    const mediumDate = formatDate(d, { locale: "fa", format: "medium", timeZone: "UTC" });
    expect(mediumDate).toContain("فروردین");
    expect(mediumDate).toContain("۱۴۰۵");
  });

  it("formats dates in English (Gregorian)", () => {
    const d = new Date("2026-03-21T10:30:00Z");
    const shortDate = formatDate(d, { locale: "en", format: "short", timeZone: "UTC" });
    expect(shortDate).toBe("2026-03-21");

    const mediumDate = formatDate(d, { locale: "en", format: "medium", timeZone: "UTC" });
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
    const j = getJalaliDate(d, "UTC");
    expect(j.year).toBe(1405);
    expect(j.month).toBe(6); // Shahrivar
    expect(j.day).toBe(13);
  });
});

/**
 * Phase 10 (M13). Two regressions that were visible in the product: a future
 * timestamp rendered in the past tense, and a date rendered in the viewer's zone
 * instead of the clinic's.
 */
describe("future-dated relative time (M13)", () => {
  const now = new Date("2026-09-04T12:00:00Z");

  it("renders a future timestamp in the future tense, not 'چند لحطه پیش'", () => {
    const inTwoMinutes = new Date("2026-09-04T12:02:00Z");
    expect(formatRelativeTime(inTwoMinutes, { locale: "fa", now })).toBe("۲ دقیقه دیگر");
    expect(formatRelativeTime(inTwoMinutes, { locale: "en", now })).toBe("In 2 minutes");
    expect(formatRelativeTime(inTwoMinutes, { locale: "fa", now })).not.toContain("پیش");
  });

  it("handles every future bucket", () => {
    expect(formatRelativeTime(new Date("2026-09-04T12:00:10Z"), { locale: "en", now })).toBe("In a moment");
    expect(formatRelativeTime(new Date("2026-09-04T15:00:00Z"), { locale: "en", now })).toBe("In 3 hours");
    expect(formatRelativeTime(new Date("2026-09-04T13:00:00Z"), { locale: "en", now })).toBe("In 1 hour");
    expect(formatRelativeTime(new Date("2026-09-05T18:00:00Z"), { locale: "en", now })).toBe("Tomorrow");
    expect(formatRelativeTime(new Date("2026-09-07T12:00:00Z"), { locale: "en", now })).toBe("In 3 days");
    expect(formatRelativeTime(new Date("2026-09-06T12:00:00Z"), { locale: "fa", now })).toBe("۲ روز دیگر");
    expect(formatRelativeTime(new Date("2026-09-05T18:00:00Z"), { locale: "fa", now })).toBe("فردا");
  });

  it("falls back to an absolute date beyond a week in either direction", () => {
    expect(formatRelativeTime(new Date("2026-10-04T12:00:00Z"), { locale: "en", now, timeZone: "UTC" })).toBe(
      "2026-10-04",
    );
    expect(formatRelativeTime(new Date("2026-08-04T12:00:00Z"), { locale: "en", now, timeZone: "UTC" })).toBe(
      "2026-08-04",
    );
  });

  it("keeps past behaviour byte-identical", () => {
    expect(formatRelativeTime(new Date("2026-09-04T11:59:50Z"), { locale: "en", now })).toBe("Just now");
    expect(formatRelativeTime(new Date("2026-09-03T18:00:00Z"), { locale: "en", now })).toBe("Yesterday");
    expect(formatRelativeTime(new Date("2026-09-01T12:00:00Z"), { locale: "fa", now })).toBe("۳ روز پیش");
  });
});

describe("clinic timezone rendering (M13)", () => {
  it("defaults to the same zone as the clinics.timezone column", () => {
    expect(CLINIC_DEFAULT_TIMEZONE).toBe("Asia/Tehran");
  });

  it("resolves the clinic's wall clock, not the host's", () => {
    // 22:00 UTC is already the NEXT day in Tehran (UTC+03:30).
    const instant = new Date("2026-09-04T22:00:00Z");
    expect(wallClockIn(instant, "UTC")).toMatchObject({ year: 2026, month: 9, day: 4, hour: 22 });
    expect(wallClockIn(instant, "Asia/Tehran")).toMatchObject({ year: 2026, month: 9, day: 5, hour: 1, minute: 30 });
  });

  it("puts an instant on the correct clinic day", () => {
    const instant = new Date("2026-09-04T22:00:00Z");
    expect(formatDate(instant, { locale: "en", format: "short", timeZone: "UTC" })).toBe("2026-09-04");
    expect(formatDate(instant, { locale: "en", format: "short", timeZone: "Asia/Tehran" })).toBe("2026-09-05");
    expect(formatDate(instant, { locale: "en", format: "short", timeZone: "Pacific/Kiritimati" })).toBe("2026-09-05");
  });

  it("handles the midnight rollover without emitting hour 24", () => {
    // 20:30Z + 03:30 = exactly 00:00 on the next Tehran day.
    const midnightTehran = new Date("2026-09-04T20:30:00Z");
    const wall = wallClockIn(midnightTehran, "Asia/Tehran");
    expect(wall.hour).toBe(0);
    expect(wall.day).toBe(5);
    expect(
      formatDate(midnightTehran, { locale: "en", format: "short", includeTime: true, timeZone: "Asia/Tehran" }),
    ).toBe("2026-09-05 at 00:00");
  });
});
