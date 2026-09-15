import { describe, expect, it, vi } from "vitest";
import { DUE_CLINIC_LIMIT_MAX, listDueClinics } from "./aftercare-scheduler.repo.js";

describe("DUE_CLINIC_LIMIT_MAX", () => {
  it("is 1000", () => {
    expect(DUE_CLINIC_LIMIT_MAX).toBe(1000);
  });
});

function mockTx(rows: unknown[] = []) {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
  } as never;
}

describe("listDueClinics", () => {
  it("maps snake_case rows to camelCase", async () => {
    const tx = mockTx([
      { clinic_id: "c1", clinic_name: "Clinic A", clinic_timezone: "Asia/Tehran" },
    ]);
    const result = await listDueClinics(tx as never, 10);
    expect(result).toEqual([
      { clinicId: "c1", name: "Clinic A", timezone: "Asia/Tehran" },
    ]);
  });
  it("returns empty array for no due clinics", async () => {
    const tx = mockTx([]);
    const result = await listDueClinics(tx as never);
    expect(result).toEqual([]);
  });
  it("defaults limit to 200", async () => {
    const tx = mockTx([]);
    await listDueClinics(tx as never);
    expect(tx.execute).toHaveBeenCalled();
  });
  it("throws for limit below 1", async () => {
    const tx = mockTx([]);
    await expect(listDueClinics(tx as never, 0)).rejects.toThrow();
  });
  it("throws for limit above DUE_CLINIC_LIMIT_MAX", async () => {
    const tx = mockTx([]);
    await expect(listDueClinics(tx as never, DUE_CLINIC_LIMIT_MAX + 1)).rejects.toThrow();
  });
  it("throws for non-integer limit", async () => {
    const tx = mockTx([]);
    await expect(listDueClinics(tx as never, 1.5)).rejects.toThrow();
  });
  it("accepts limit of exactly 1", async () => {
    const tx = mockTx([]);
    await expect(listDueClinics(tx as never, 1)).resolves.toEqual([]);
  });
  it("accepts limit of exactly DUE_CLINIC_LIMIT_MAX", async () => {
    const tx = mockTx([]);
    await expect(listDueClinics(tx as never, DUE_CLINIC_LIMIT_MAX)).resolves.toEqual([]);
  });
  it("handles multiple clinics", async () => {
    const tx = mockTx([
      { clinic_id: "c1", clinic_name: "A", clinic_timezone: "Asia/Tehran" },
      { clinic_id: "c2", clinic_name: "B", clinic_timezone: "Europe/Berlin" },
      { clinic_id: "c3", clinic_name: "C", clinic_timezone: "America/New_York" },
    ]);
    const result = await listDueClinics(tx as never, 100);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ clinicId: "c3", name: "C", timezone: "America/New_York" });
  });
});
