// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import PatientListSection from "../sections/PatientListSection.js";
import { SAMPLE_PATIENTS, type Patient } from "../../data/dashboard-samples.js";
import i18n from "../../i18n.js";

/**
 * M5 proof, phase B. Scoped to `patient-list`, the directory panel this section
 * owns: the radar chart and the caliber waveform beside it are legacy components
 * whose defaults are still hardcoded Persian, so they are a later M5 slice and
 * asserting over them here would only prove debt that is already tracked.
 *
 * The roster is an ASCII fixture on purpose - a patient's real name is DATA and
 * stays Persian in any locale, so it would make the codepoint assertion
 * meaningless.
 */
const PERSIAN = /[\u0600-\u06FF]/;

const base = SAMPLE_PATIENTS[0]!;

const PATIENTS: Patient[] = [
  {
    ...base,
    id: "en-patient-1",
    firstName: "Sarah",
    lastName: "Miller",
    phone: "09120000001",
    scalpCondition: "Density monitoring",
    lastVisit: "2026-08-21",
  },
  {
    ...base,
    id: "en-patient-2",
    firstName: "Dr. Emma",
    lastName: "Clark",
    phone: "09120000002",
    scalpCondition: "Seasonal shedding control",
    lastVisit: "2026-09-02",
  },
];

beforeAll(async () => {
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

afterAll(async () => {
  await act(async () => {
    await i18n.changeLanguage("fa");
  });
});

afterEach(cleanup);

describe("PatientListSection (en)", () => {
  it("renders in English without Persian characters", () => {
    render(<PatientListSection patients={PATIENTS} selectedPatient={PATIENTS[0]!} />);

    const element = screen.getByTestId("patient-list");

    expect(element).toBeDefined();
    expect(element.textContent).not.toMatch(PERSIAN);
    expect(element.getAttribute("dir")).not.toBe("rtl");
  });

  it("resolves the English bundle, not the fa fallback", () => {
    render(<PatientListSection patients={PATIENTS} selectedPatient={PATIENTS[0]!} />);

    expect(screen.getByTestId("patient-list-title").textContent).toBe("Trichology Records");
    expect(screen.getByTestId("patient-list-badge").textContent).toBe("Section 1 of 4");
    expect(screen.getByTestId("patient-search").getAttribute("placeholder")).toBe(
      "Search patients..."
    );
    expect(screen.getByTestId("patient-add-btn").textContent).toContain("Add New Patient");
  });

  it("strips the English honorific list when building the avatar initial", () => {
    render(<PatientListSection patients={PATIENTS} selectedPatient={PATIENTS[0]!} />);

    expect(screen.getByTestId("patient-card-initial-en-patient-1").textContent).toBe("S");
    // "Dr. Emma" -> "E": the prefix list is translation data, never a literal.
    expect(screen.getByTestId("patient-card-initial-en-patient-2").textContent).toBe("E");
  });

  it("keeps the telemetry gauges in ASCII digits", () => {
    render(<PatientListSection patients={PATIENTS} selectedPatient={PATIENTS[0]!} />);

    expect(screen.getByTestId("patient-telemetry-density").textContent).toBe(
      String(PATIENTS[0]!.hairDensity || 148)
    );
    expect(screen.getByTestId("patient-telemetry-anagen").textContent).not.toMatch(PERSIAN);
    expect(screen.getByTestId("patient-telemetry-keratin").textContent).not.toMatch(PERSIAN);
  });
});
