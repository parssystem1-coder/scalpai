import { describe, expect, it } from "vitest";
import { planCanvasResize } from "./components/SignatureCanvas.js";

/**
 * Phase 10 (M10) regression. Assigning canvas.width clears the bitmap, and the
 * old resize handler did it unconditionally on every window resize event - so a
 * tablet rotation or an on-screen keyboard erased a signature the patient had
 * already given, and the consent modal submitted the blank canvas.
 */
const base = { currentWidth: 800, currentHeight: 400, cssWidth: 400, cssHeight: 200, dpr: 2, hasDrawing: true };

describe("signature pad resize plan (M10)", () => {
  it("is a no-op when the backing store would not change", () => {
    // 400css * dpr2 === 800 device pixels: touching the canvas here would
    // destroy the drawing for no reason at all.
    const plan = planCanvasResize(base);
    expect(plan.changed).toBe(false);
    expect(plan.snapshot).toBe(false);
  });

  it("snapshots the existing stroke when the size really changes", () => {
    const plan = planCanvasResize({ ...base, cssWidth: 600 });
    expect(plan).toMatchObject({ changed: true, nextWidth: 1200, nextHeight: 400, snapshot: true });
  });

  it("reacts to a device-pixel-ratio change alone (browser zoom, external monitor)", () => {
    const plan = planCanvasResize({ ...base, dpr: 3 });
    expect(plan).toMatchObject({ changed: true, nextWidth: 1200, nextHeight: 600, snapshot: true });
  });

  it("does not bother snapshotting an empty pad", () => {
    const plan = planCanvasResize({ ...base, cssWidth: 600, hasDrawing: false });
    expect(plan.changed).toBe(true);
    expect(plan.snapshot).toBe(false);
  });

  it("does not snapshot a canvas that has no backing store yet (first mount)", () => {
    const plan = planCanvasResize({ ...base, currentWidth: 0, currentHeight: 0 });
    expect(plan.changed).toBe(true);
    expect(plan.snapshot).toBe(false);
  });

  it("never produces a zero-sized canvas", () => {
    const plan = planCanvasResize({ ...base, cssWidth: 0, cssHeight: 0 });
    expect(plan.nextWidth).toBeGreaterThanOrEqual(1);
    expect(plan.nextHeight).toBeGreaterThanOrEqual(1);
  });

  it("treats a missing or nonsense dpr as 1", () => {
    expect(planCanvasResize({ ...base, dpr: 0, cssWidth: 400, cssHeight: 200 })).toMatchObject({
      nextWidth: 400,
      nextHeight: 200,
    });
  });

  it("rounds fractional CSS boxes instead of drifting every resize", () => {
    const first = planCanvasResize({ ...base, cssWidth: 399.6, cssHeight: 199.4 });
    expect(first.nextWidth).toBe(799);
    expect(first.nextHeight).toBe(399);
    // Re-running with the same box must now be a no-op, otherwise every resize
    // event would clear the canvas forever.
    const second = planCanvasResize({
      ...base,
      currentWidth: first.nextWidth,
      currentHeight: first.nextHeight,
      cssWidth: 399.6,
      cssHeight: 199.4,
    });
    expect(second.changed).toBe(false);
  });
});
