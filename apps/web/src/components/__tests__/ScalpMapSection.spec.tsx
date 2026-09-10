// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ScalpMapSection from "../sections/ScalpMapSection.js";
import i18n from "../../i18n.js";

/**
 * The live scalp map itself is a heavy visual component with its own suite;
 * this spec only proves the Phase 3 wrapper contract and its Phase 5 label.
 * `vi.mock` is hoisted above the import above, so the stub is what renders.
 *
 * Phase B: the landmark is reached through `scalp-map-section` and the patient
 * fixture is ASCII - the name is DATA flowing through the wrapper, not copy, so
 * it must not look like a translated string.
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
      data-testid="scalp-map-stub"
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

afterEach(cleanup);

describe("ScalpMapSection (Phase 5 i18n, Phase B testids)", () => {
  it("renders the section and forwards the patient name", () => {
    render(<ScalpMapSection patientName="Maryam Rezaei" />);

    const section = screen.getByTestId("scalp-map-section");
    expect(section).toBeDefined();
    expect(section.getAttribute("aria-label")).toBe(String(i18n.t("dashboard.scalpMap.title")));
    expect(screen.getByTestId("scalp-map-stub").textContent).toBe("Maryam Rezaei");
  });

  it("bridges the zone dive to onZoneSelect", () => {
    const onZoneSelect = vi.fn();
    render(<ScalpMapSection patientName="Maryam Rezaei" onZoneSelect={onZoneSelect} />);

    fireEvent.click(screen.getByTestId("scalp-map-stub"));

    expect(onZoneSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vertex", severity: "moderate" })
    );
  });
});
