// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PatientListSection from "../sections/PatientListSection.js";
import { SAMPLE_PATIENTS } from "../../data/dashboard-samples.js";
import i18n, { faNum } from "../../i18n.js";

afterEach(cleanup);

const selected = SAMPLE_PATIENTS[0]!;

const tr = (key: string, options: Record<string, unknown> = {}): string =>
  String(i18n.t(key, options));

/**
 * Phase B: elements come from data-testid, copy comes from the bundle. The radar
 * chart is still a legacy component with its own hardcoded defaults, so its axis
 * labels are matched by CONTENT (the translated label we handed it) rather than
 * by a testid we do not own yet.
 */
const hasText = (needle: string) => (content: string): boolean => content.includes(needle);

describe("PatientListSection (Phase 5 i18n, Phase B testids)", () => {
  it("renders the translated header, search field and roster", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(screen.getByTestId("patient-list")).toBeDefined();
    expect(screen.getByTestId("patient-list-badge").textContent).toBe(
      tr("dashboard.patientList.badge")
    );
    expect(screen.getByTestId("patient-list-title").textContent).toBe(
      tr("dashboard.patientList.title")
    );
    expect(screen.getByTestId("patient-search").getAttribute("placeholder")).toBe(
      tr("dashboard.patientList.search")
    );
    expect(screen.getByTestId("patient-add-btn").textContent).toContain(
      tr("dashboard.patientList.addNew")
    );
    expect(screen.getByTestId(`patient-card-name-${selected.id}`).textContent).toBe(
      `${selected.firstName} ${selected.lastName}`
    );
  });

  it("shows the empty state when the search matches nobody", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(screen.queryByTestId("patient-list-empty")).toBeNull();

    fireEvent.change(screen.getByTestId("patient-search"), {
      target: { value: "zzzz-no-such-patient" },
    });

    expect(screen.getByTestId("patient-list-empty").textContent).toBe(
      tr("dashboard.patientList.noPatients")
    );
    expect(screen.queryByTestId(`patient-card-${selected.id}`)).toBeNull();
  });

  it("shapes the telemetry gauges with the active locale digits", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(screen.getByTestId("patient-telemetry").textContent).toBe(
      tr("dashboard.patientList.telemetry.matrix")
    );
    expect(screen.getByTestId("patient-telemetry-id").textContent).toContain(selected.id);
    expect(screen.getByTestId("patient-telemetry-density").textContent).toBe(
      faNum(selected.hairDensity || 148)
    );
    expect(screen.getByTestId("patient-telemetry-anagen").textContent).toBe(
      `${faNum(selected.anagenRatio || 86)}%`
    );
    expect(screen.getByTestId("patient-telemetry-keratin").textContent).toBe(
      `${faNum(selected.keratinHealth || 92)}%`
    );
  });

  it("passes translated radar labels and the patient name to the radar chart", () => {
    render(<PatientListSection patients={SAMPLE_PATIENTS} selectedPatient={selected} />);

    expect(
      screen.getByText(
        tr("dashboard.patientList.radar.title", {
          patient: `${selected.firstName} ${selected.lastName}`,
        })
      )
    ).toBeDefined();
    // The radar renders each axis as "<label> (<value>%)".
    expect(screen.getByText(hasText(tr("dashboard.patientList.radar.density")))).toBeDefined();
    expect(screen.getByText(hasText(tr("dashboard.patientList.radar.stemCell")))).toBeDefined();
  });

  it("delegates selection, creation and navigation to the parent", () => {
    const onSelectPatient = vi.fn();
    const onAddPatient = vi.fn();
    const onNavigate = vi.fn();

    render(
      <PatientListSection
        patients={SAMPLE_PATIENTS}
        selectedPatient={selected}
        onSelectPatient={onSelectPatient}
        onAddPatient={onAddPatient}
        onNavigate={onNavigate}
      />
    );

    fireEvent.click(screen.getByTestId("patient-add-btn"));
    expect(onAddPatient).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId(`patient-card-${selected.id}`));
    expect(onSelectPatient).toHaveBeenCalledWith(selected.id);

    fireEvent.click(screen.getByTestId(`patient-card-gallery-${selected.id}`));
    expect(onNavigate).toHaveBeenLastCalledWith("gallery");

    fireEvent.click(screen.getByTestId("patient-goto-gallery"));
    expect(onNavigate).toHaveBeenLastCalledWith("gallery");

    fireEvent.click(screen.getByTestId("patient-goto-ai-studio"));
    expect(onNavigate).toHaveBeenLastCalledWith("ai-studio");

    fireEvent.click(screen.getByTestId("patient-goto-3d-model"));
    expect(onNavigate).toHaveBeenLastCalledWith("3d-model");
  });
});
