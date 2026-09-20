// @vitest-environment jsdom
//
// C12/F20: the hologram:ttfr clock must open in HologramSection BEFORE the
// lazy LuxuryScalp3D chunk resolves - mounting the section starts the
// measurement; the 3D component's first rendered frame closes it. The marks
// module itself is unit-tested in perf/marks.spec.ts; this spec pins the
// call site to the mount lifecycle.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../perf/marks.js", () => ({
  markHologramMountStart: vi.fn(),
  markHologramFirstFrame: vi.fn(),
  HOLOGRAM_TTFR: "hologram:ttfr",
}));

vi.mock("../LuxuryScalp3D.js", () => ({
  default: () => <div data-testid="hologram-stub" />,
}));

import { markHologramMountStart } from "../../perf/marks.js";
import HologramSection from "../sections/HologramSection.js";

const patient = { id: "p1", firstName: "Sara", lastName: "Ahmadi", phone: "09120000000" };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("HologramSection perf marks (C12/F20)", () => {
  it("opens the hologram:ttfr clock exactly once on mount", async () => {
    render(<HologramSection selectedPatient={patient} onBackToPatients={() => {}} />);

    expect(markHologramMountStart).toHaveBeenCalledTimes(1);

    // The lazy child resolves after the opening mark; the clock must not be
    // re-opened by Suspense settling.
    await waitFor(() => expect(screen.getByTestId("hologram-stub")).not.toBeNull());
    expect(markHologramMountStart).toHaveBeenCalledTimes(1);
  });

  it("re-opens the clock when the section remounts", () => {
    const { unmount } = render(<HologramSection selectedPatient={patient} onBackToPatients={() => {}} />);
    expect(markHologramMountStart).toHaveBeenCalledTimes(1);
    unmount();

    render(<HologramSection selectedPatient={patient} onBackToPatients={() => {}} />);
    expect(markHologramMountStart).toHaveBeenCalledTimes(2);
  });
});
