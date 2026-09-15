import { describe, expect, it, vi } from "vitest";
import {
  MeteringError,
  METERING_SPECS,
  bytesToMeteredMb,
  isMeteredMetricName,
  meterUsage,
  peekUsage,
  releaseUsage,
  resolveMeteredLimit,
} from "./metering.repo.js";

describe("MeteringError", () => {
  it("has name MeteringError", () => {
    expect(new MeteringError("x").name).toBe("MeteringError");
  });
});

describe("METERING_SPECS", () => {
  it("has three metrics", () => {
    expect(Object.keys(METERING_SPECS)).toEqual(["upload_mb", "analyses", "messages_sent"]);
  });
  it("each metric has limitKeys and unit", () => {
    for (const [key, spec] of Object.entries(METERING_SPECS)) {
      expect(spec.metric).toBe(key);
      expect(spec.limitKeys.length).toBeGreaterThan(0);
      expect(typeof spec.unit).toBe("string");
    }
  });
});

describe("isMeteredMetricName", () => {
  it("returns true for valid metric names", () => {
    expect(isMeteredMetricName("upload_mb")).toBe(true);
    expect(isMeteredMetricName("analyses")).toBe(true);
    expect(isMeteredMetricName("messages_sent")).toBe(true);
  });
  it("returns false for invalid names", () => {
    expect(isMeteredMetricName("invalid")).toBe(false);
    expect(isMeteredMetricName("")).toBe(false);
    expect(isMeteredMetricName("UPLOAD_MB")).toBe(false);
  });
});

describe("resolveMeteredLimit", () => {
  it("returns null for null/undefined limits", () => {
    expect(resolveMeteredLimit(null, "upload_mb")).toBeNull();
    expect(resolveMeteredLimit(undefined, "upload_mb")).toBeNull();
  });
  it("returns null when no matching key exists", () => {
    expect(resolveMeteredLimit({}, "upload_mb")).toBeNull();
  });
  it("resolves primary limit key", () => {
    expect(resolveMeteredLimit({ upload_mb_per_month: 100 }, "upload_mb")).toBe(100);
  });
  it("falls back to secondary limit key", () => {
    expect(resolveMeteredLimit({ upload_mb: 50 }, "upload_mb")).toBe(50);
  });
  it("prefers primary over secondary", () => {
    expect(resolveMeteredLimit({ upload_mb_per_month: 100, upload_mb: 50 }, "upload_mb")).toBe(100);
  });
  it("rejects negative values", () => {
    expect(resolveMeteredLimit({ upload_mb_per_month: -1 }, "upload_mb")).toBeNull();
  });
  it("rejects fractional values", () => {
    expect(resolveMeteredLimit({ upload_mb_per_month: 1.5 }, "upload_mb")).toBeNull();
  });
  it("rejects non-number values", () => {
    expect(resolveMeteredLimit({ upload_mb_per_month: "100" }, "upload_mb")).toBeNull();
  });
  it("works for analyses metric", () => {
    expect(resolveMeteredLimit({ analyses_per_month: 200 }, "analyses")).toBe(200);
    expect(resolveMeteredLimit({ analyses: 50 }, "analyses")).toBe(50);
  });
  it("works for messages_sent metric", () => {
    expect(resolveMeteredLimit({ messages_per_month: 1000 }, "messages_sent")).toBe(1000);
    expect(resolveMeteredLimit({ messages_sent: 500 }, "messages_sent")).toBe(500);
  });
});

describe("bytesToMeteredMb", () => {
  it("returns 0 for non-finite input", () => {
    expect(bytesToMeteredMb(NaN)).toBe(0);
    expect(bytesToMeteredMb(Infinity)).toBe(0);
    expect(bytesToMeteredMb(-Infinity)).toBe(0);
  });
  it("returns 0 for zero or negative", () => {
    expect(bytesToMeteredMb(0)).toBe(0);
    expect(bytesToMeteredMb(-100)).toBe(0);
  });
  it("returns 1 for sub-MB values (ceiling)", () => {
    expect(bytesToMeteredMb(1)).toBe(1);
    expect(bytesToMeteredMb(1024)).toBe(1);
    expect(bytesToMeteredMb(1024 * 1024 - 1)).toBe(1);
  });
  it("returns 1 for exactly 1 MB", () => {
    expect(bytesToMeteredMb(1024 * 1024)).toBe(1);
  });
  it("returns 2 for just over 1 MB", () => {
    expect(bytesToMeteredMb(1024 * 1024 + 1)).toBe(2);
  });
  it("ceils fractional MB", () => {
    expect(bytesToMeteredMb(1.5 * 1024 * 1024)).toBe(2);
    expect(bytesToMeteredMb(2.1 * 1024 * 1024)).toBe(3);
  });
});

function mockTx(rows: unknown[] = []) {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  } as never;
}

describe("meterUsage", () => {
  it("throws on negative amount", async () => {
    await expect(meterUsage(mockTx() as never, "c1", "upload_mb", -1, 100)).rejects.toThrow(MeteringError);
  });
  it("throws on fractional amount", async () => {
    await expect(meterUsage(mockTx() as never, "c1", "upload_mb", 1.5, 100)).rejects.toThrow(MeteringError);
  });
  it("returns verdict from DB", async () => {
    const tx = mockTx([{ allowed: true, used: "10", period_start: "2026-09-01" }]);
    const result = await meterUsage(tx as never, "c1", "upload_mb", 5, 100);
    expect(result).toEqual({
      allowed: true,
      metric: "upload_mb",
      used: 10,
      limit: 100,
      periodStart: "2026-09-01",
    });
  });
  it("throws on empty result", async () => {
    const tx = mockTx([]);
    await expect(meterUsage(tx as never, "c1", "upload_mb", 5, 100)).rejects.toThrow(MeteringError);
  });
});

describe("releaseUsage", () => {
  it("throws on negative amount", async () => {
    await expect(releaseUsage(mockTx() as never, "c1", "upload_mb", -1)).rejects.toThrow(MeteringError);
  });
  it("returns new counter value", async () => {
    const tx = mockTx([{ value: "8" }]);
    const result = await releaseUsage(tx as never, "c1", "upload_mb", 2);
    expect(result).toBe(8);
  });
});

describe("peekUsage", () => {
  it("returns 0 when no counter row exists", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [{ period_start: "2026-09-01" }] }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never;
    const result = await peekUsage(tx as never, "c1", "upload_mb");
    expect(result).toBe(0);
  });
  it("returns counter value when row exists", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [{ period_start: "2026-09-01" }] }),
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ value: 42 }]),
          }),
        }),
      }),
    } as never;
    const result = await peekUsage(tx as never, "c1", "upload_mb");
    expect(result).toBe(42);
  });
  it("throws when period cannot be resolved", async () => {
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    } as never;
    await expect(peekUsage(tx as never, "c1", "upload_mb")).rejects.toThrow(MeteringError);
  });
});
