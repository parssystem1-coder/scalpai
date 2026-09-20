// @vitest-environment node
//
// C12/F20: unit coverage for the hologram perf marks. The module normally
// no-ops under vitest (MODE === "test"), so these specs opt into the real
// code path with the documented VITE_PERF_MARKS=1 escape hatch and fake
// timing primitives - no wall-clock waiting anywhere.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { markMock, measureMock, entriesByNameMock } = vi.hoisted(() => ({
  markMock: vi.fn(),
  measureMock: vi.fn(),
  entriesByNameMock: vi.fn<(name: string, type: string) => unknown[]>(),
}));

beforeEach(() => {
  // The hoisted mocks live for the whole file; without a clear, one test's
  // calls would leak into the next assertion's count.
  vi.clearAllMocks();
  vi.stubGlobal("performance", {
    mark: markMock,
    measure: measureMock,
    getEntriesByName: entriesByNameMock,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("perf/marks (C12/F20)", () => {
  it("is inert in the vitest environment by default", async () => {
    const marks = await import("./marks.js");

    marks.markHologramMountStart();
    marks.markHologramFirstFrame();

    expect(markMock).not.toHaveBeenCalled();
    expect(measureMock).not.toHaveBeenCalled();
  });

  it("marks the mount start and closes ttfr on the first frame (VITE_PERF_MARKS=1)", async () => {
    vi.stubEnv("VITE_PERF_MARKS", "1");
    entriesByNameMock.mockReturnValue([{ name: "hologram:mount:start", entryType: "mark", startTime: 100 }]);
    const marks = await import("./marks.js");

    marks.markHologramMountStart();
    expect(markMock).toHaveBeenNthCalledWith(1, "hologram:mount:start");

    marks.markHologramFirstFrame();
    expect(markMock).toHaveBeenNthCalledWith(2, "hologram:first-frame");
    expect(measureMock).toHaveBeenCalledWith("hologram:ttfr", "hologram:mount:start", "hologram:first-frame");
  });

  it("does not measure when the opening mark never happened", async () => {
    vi.stubEnv("VITE_PERF_MARKS", "1");
    entriesByNameMock.mockReturnValue([]);
    const marks = await import("./marks.js");

    marks.markHologramFirstFrame();

    expect(markMock).toHaveBeenCalledTimes(1); // hologram:first-frame only
    expect(measureMock).not.toHaveBeenCalled();
  });

  it("never throws when the timing primitives fail", async () => {
    vi.stubEnv("VITE_PERF_MARKS", "1");
    markMock.mockImplementation(() => {
      throw new Error("performance.mark unavailable");
    });
    const marks = await import("./marks.js");

    expect(() => marks.markHologramMountStart()).not.toThrow();
    expect(() => marks.markHologramFirstFrame()).not.toThrow();
  });
});
