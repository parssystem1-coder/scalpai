/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  AFTERCARE_CLAIM_LIMIT_MAX,
  AFTERCARE_MAX_ATTEMPTS,
  AftercareError,
  stepRunAt,
  type AftercareStepRow,
} from "./aftercare.repo.js";

describe("AftercareError", () => {
  it("has name AftercareError", () => {
    expect(new AftercareError("x").name).toBe("AftercareError");
  });
});

describe("constants", () => {
  it("AFTERCARE_MAX_ATTEMPTS is 5", () => {
    expect(AFTERCARE_MAX_ATTEMPTS).toBe(5);
  });
  it("AFTERCARE_CLAIM_LIMIT_MAX is 500", () => {
    expect(AFTERCARE_CLAIM_LIMIT_MAX).toBe(500);
  });
});

describe("stepRunAt", () => {
  it("returns null when step is undefined", () => {
    expect(stepRunAt(new Date("2026-01-01T00:00:00Z"), undefined)).toBeNull();
  });
  it("adds offsetHours to startedAt", () => {
    const started = new Date("2026-01-01T00:00:00Z");
    const step: AftercareStepRow = { offsetHours: 24, channel: "kavenegar", templateKey: "t1" };
    const result = stepRunAt(started, step);
    expect(result?.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
  it("handles zero offset", () => {
    const started = new Date("2026-06-15T12:00:00Z");
    const step: AftercareStepRow = { offsetHours: 0, channel: "bale", templateKey: "t2" };
    const result = stepRunAt(started, step);
    expect(result?.toISOString()).toBe(started.toISOString());
  });
  it("handles fractional offset", () => {
    const started = new Date("2026-01-01T00:00:00Z");
    const step: AftercareStepRow = { offsetHours: 1.5, channel: "eitaa", templateKey: "t3" };
    const result = stepRunAt(started, step);
    expect(result?.getTime()).toBe(started.getTime() + 1.5 * 3_600_000);
  });
  it("handles large offset", () => {
    const started = new Date("2026-01-01T00:00:00Z");
    const step: AftercareStepRow = { offsetHours: 720, channel: "telegram", templateKey: "t4" };
    const result = stepRunAt(started, step);
    expect(result?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
});

function mockTx(rows: unknown[] = []) {
  return {
    execute: vi.fn().mockResolvedValue({ rows }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(rows),
            }),
          }),
          limit: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue(rows),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(rows),
        }),
      }),
    }),
  } as any;
}

describe("aftercare DB functions (smoke)", () => {
  it("createSequence calls insert with correct table", async () => {
    const tx = mockTx([{ id: "s1", name: "Test", steps: "[]", active: true }]);
    const { createSequence } = await import("./aftercare.repo.js");
    const result = await createSequence(tx as any, "clinic1", "user1", {
      name: "Test",
      trigger: "manual",
      steps: [],
      locale: "fa",
      active: true,
    });
    expect(tx.insert).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("listSequences returns empty for no rows", async () => {
    const tx = mockTx([]);
    const { listSequences } = await import("./aftercare.repo.js");
    const result = await listSequences(tx as any, "clinic1", { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  it("getSequence returns null for no rows", async () => {
    const tx = mockTx([]);
    const { getSequence } = await import("./aftercare.repo.js");
    const result = await getSequence(tx as any, "clinic1", "nonexistent");
    expect(result).toBeNull();
  });

  it("listEnrollments returns empty for no rows", async () => {
    const tx = mockTx([]);
    const { listEnrollments } = await import("./aftercare.repo.js");
    const result = await listEnrollments(tx as any, "clinic1", { limit: 10, offset: 0 });
    expect(result).toEqual([]);
  });

  it("getEnrollment returns null for no rows", async () => {
    const tx = mockTx([]);
    const { getEnrollment } = await import("./aftercare.repo.js");
    const result = await getEnrollment(tx as any, "clinic1", "nonexistent");
    expect(result).toBeNull();
  });

  it("claimDueEnrollments validates limit range", async () => {
    const tx = mockTx([]);
    const { claimDueEnrollments } = await import("./aftercare.repo.js");
    await expect(claimDueEnrollments(tx as any, "c1", 0)).rejects.toThrow();
    await expect(claimDueEnrollments(tx as any, "c1", 501)).rejects.toThrow();
  });

  it("advanceEnrollment returns null when no rows", async () => {
    const tx = mockTx([]);
    const { advanceEnrollment } = await import("./aftercare.repo.js");
    const result = await advanceEnrollment(tx as any, "clinic1", "nonexistent");
    expect(result).toBeNull();
  });

  it("deferEnrollment returns null when no rows", async () => {
    const tx = mockTx([]);
    const { deferEnrollment } = await import("./aftercare.repo.js");
    const result = await deferEnrollment(tx as any, "clinic1", "nonexistent", 1);
    expect(result).toBeNull();
  });

  it("updateSequence returns null for no match", async () => {
    const tx = mockTx([]);
    const { updateSequence } = await import("./aftercare.repo.js");
    const result = await updateSequence(tx as any, "c1", "nonexistent", { name: "New" });
    expect(result).toBeNull();
  });

  it("updateSequence with empty patch returns getSequence result", async () => {
    const tx = mockTx([]);
    const { updateSequence } = await import("./aftercare.repo.js");
    const result = await updateSequence(tx as any, "c1", "s1", {});
    expect(result).toBeNull();
  });

  it("softDeleteSequence returns false for no match", async () => {
    const tx = mockTx([]);
    const { softDeleteSequence } = await import("./aftercare.repo.js");
    const result = await softDeleteSequence(tx as any, "c1", "nonexistent");
    expect(result).toBe(false);
  });

  it("softDeleteSequence returns true when matched", async () => {
    const tx = mockTx([{ id: "s1" }]);
    const { softDeleteSequence } = await import("./aftercare.repo.js");
    const result = await softDeleteSequence(tx as any, "c1", "s1");
    expect(result).toBe(true);
  });

  it("setEnrollmentState returns null for no match", async () => {
    const tx = mockTx([]);
    const { setEnrollmentState } = await import("./aftercare.repo.js");
    const result = await setEnrollmentState(tx as any, "c1", "nonexistent", "pause");
    expect(result).toBeNull();
  });

  it("setEnrollmentState pause throws for non-active enrollment", async () => {
    const tx = mockTx([{ id: "e1", state: "paused", currentStep: 0, stepsSnapshot: "[]", startedAt: new Date(), nextRunAt: null, lastRunAt: null, attempts: 0, completedAt: null, cancelledAt: null, sequenceId: "s1", patientId: "p1", sessionId: null, locale: "fa" }]);
    const { setEnrollmentState } = await import("./aftercare.repo.js");
    await expect(setEnrollmentState(tx as any, "c1", "e1", "pause")).rejects.toThrow(AftercareError);
  });

  it("setEnrollmentState resume throws for non-paused enrollment", async () => {
    const tx = mockTx([{ id: "e1", state: "active", currentStep: 0, stepsSnapshot: "[]", startedAt: new Date(), nextRunAt: null, lastRunAt: null, attempts: 0, completedAt: null, cancelledAt: null, sequenceId: "s1", patientId: "p1", sessionId: null, locale: "fa" }]);
    const { setEnrollmentState } = await import("./aftercare.repo.js");
    await expect(setEnrollmentState(tx as any, "c1", "e1", "resume")).rejects.toThrow(AftercareError);
  });

  it("setEnrollmentState cancel returns already-completed enrollment", async () => {
    const completed = { id: "e1", state: "completed", currentStep: 2, stepsSnapshot: "[]", startedAt: new Date(), nextRunAt: null, lastRunAt: null, attempts: 0, completedAt: new Date(), cancelledAt: null, sequenceId: "s1", patientId: "p1", sessionId: null, locale: "fa" };
    const tx = mockTx([completed]);
    const { setEnrollmentState } = await import("./aftercare.repo.js");
    const result = await setEnrollmentState(tx as any, "c1", "e1", "cancel");
    expect(result).toBeDefined();
  });

  it("claimDueEnrollments returns mapped rows", async () => {
    const tx = mockTx([]);
    tx.execute.mockResolvedValueOnce({
      rows: [{
        enrollment_id: "e1",
        sequence_id: "s1",
        patient_id: "p1",
        session_id: null,
        current_step: 0,
        steps_snapshot: [{ offsetHours: 24, channel: "kavenegar", templateKey: "t1" }],
        locale: "fa",
        attempts: 0,
      }],
    });
    const { claimDueEnrollments } = await import("./aftercare.repo.js");
    const result = await claimDueEnrollments(tx as any, "c1", 10);
    expect(result).toHaveLength(1);
    expect(result[0]!.enrollmentId).toBe("e1");
    expect(result[0]!.stepsSnapshot).toHaveLength(1);
  });

  it("listEnrollments with patientId filter", async () => {
    const tx = mockTx([]);
    const { listEnrollments } = await import("./aftercare.repo.js");
    const result = await listEnrollments(tx as any, "c1", { patientId: "p1", limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listEnrollments with state filter", async () => {
    const tx = mockTx([]);
    const { listEnrollments } = await import("./aftercare.repo.js");
    const result = await listEnrollments(tx as any, "c1", { state: "active", limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });

  it("listEnrollments with sequenceId filter", async () => {
    const tx = mockTx([]);
    const { listEnrollments } = await import("./aftercare.repo.js");
    const result = await listEnrollments(tx as any, "c1", { sequenceId: "s1", limit: 5, offset: 0 });
    expect(result).toEqual([]);
  });
});
