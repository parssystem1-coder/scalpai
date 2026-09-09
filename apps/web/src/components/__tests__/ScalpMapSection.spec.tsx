// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * The live scalp map itself is a heavy visual component with its own suite;
 * this spec only proves the Phase 3 wrapper contract and its Phase 5 label.
 */
vi.mock("../ScalpMap.js", () => ({
  default: ({
    patientName,
    onDiveUnderSkin,
  }: {
    patientName: string;
    onDiveUnderSkin: (zone: unknown) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onDiveUnderSkin({
          id: "vertex",
          primaryCondition: "androgenetic_alopecia",
          severity: "moderate",
        })
      }
    >
      {patientName}
    </button>
  ),
}));

const { default: ScalpMapSection } = await import("../sections/ScalpMapSection.js");

afterEach(cleanup);

describe("ScalpMapSection (Phase 5 i18n)", () => {
  it("labels the landmark from i18n and forwards the patient name", () => {
    render(<ScalpMapSection patientName="مریم رضایی" />);

    expect(screen.getByLabelText("نقشه پوست سر")).toBeDefined();
    expect(screen.getByText("مریم رضایی")).toBeDefined();
  });

  it("bridges the zone dive to onZoneSelect", () => {
    const onZoneSelect = vi.fn();
    render(<ScalpMapSection patientName="مریم رضایی" onZoneSelect={onZoneSelect} />);

    fireEvent.click(screen.getByText("مریم رضایی"));

    expect(onZoneSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vertex", severity: "moderate" })
    );
  });
});
