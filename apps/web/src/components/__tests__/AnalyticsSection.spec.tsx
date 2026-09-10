// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AnalyticsSection, { type AnalyticsData } from "../sections/AnalyticsSection.js";
import i18n, { faNum } from "../../i18n.js";

afterEach(cleanup);

const tr = (key: string, options: Record<string, unknown> = {}): string =>
  String(i18n.t(key, options));

const PATIENT = "Maryam Rezaei";

/** Engine output, not copy: an ASCII fixture keeps the spec language-neutral. */
const DATA: AnalyticsData = {
  scores: { redness: 22, flakeTexture: 26, densityProxy: 88 },
  severity: 24,
  anagenRatio: 87,
  hairCaliber: "76 µm",
  recommendation: "AI-synthesised peptide protocol (fixture)",
  matrixHydration: 92,
  tensorConfidence: 97.4,
  follicularUnits: { single: 24, double: 52, triple: 24 },
};

describe("AnalyticsSection (Phase 5 i18n, Phase B testids)", () => {
  it("renders the translated badge, heading and patient-aware subtitle", () => {
    render(<AnalyticsSection data={DATA} patientName={PATIENT} />);

    const section = screen.getByTestId("analytics-section");
    expect(section.getAttribute("aria-label")).toBe(tr("dashboard.analytics.title"));
    expect(screen.getByTestId("analytics-badge").textContent).toBe(tr("dashboard.analytics.badge"));
    expect(screen.getByTestId("analytics-heading").textContent).toBe(
      tr("dashboard.analytics.heading")
    );
    expect(screen.getByTestId("analytics-subtitle").textContent).toBe(
      tr("dashboard.analytics.subtitle", { patient: PATIENT })
    );
    expect(screen.getByTestId("analytics-subtitle").textContent).toContain(PATIENT);
  });

  it("renders the four metric dials with locale-shaped percentages", () => {
    render(<AnalyticsSection data={DATA} patientName={PATIENT} />);

    for (const metric of ["redness", "flake", "anagen", "hydration"]) {
      expect(screen.getByTestId(`analytics-metric-${metric}`)).toBeDefined();
    }

    expect(screen.getByTestId("analytics-metric-value-redness").textContent).toBe(`${faNum(22)}%`);
    expect(screen.getByTestId("analytics-metric-value-flake").textContent).toBe(`${faNum(26)}%`);
    expect(screen.getByTestId("analytics-metric-value-anagen").textContent).toBe(`${faNum(87)}%`);
    expect(screen.getByTestId("analytics-metric-value-hydration").textContent).toBe(
      `${faNum(92)}%`
    );
    expect(screen.getByTestId("analytics-tensor-confidence").textContent).toContain(
      tr("dashboard.analytics.tensorConfidence", { value: faNum(97.4) })
    );
  });

  it("swaps the scan button copy while the engine is running", () => {
    const { unmount } = render(
      <AnalyticsSection data={DATA} patientName={PATIENT} isAnalyzing={false} />
    );
    expect(screen.getByTestId("analytics-rerun-btn").textContent).toContain(
      tr("dashboard.analytics.rerun")
    );
    expect(screen.getByTestId("analytics-rerun-btn").hasAttribute("disabled")).toBe(false);
    unmount();

    render(<AnalyticsSection data={DATA} patientName={PATIENT} isAnalyzing={true} />);
    expect(screen.getByTestId("analytics-rerun-btn").textContent).toContain(
      tr("dashboard.analytics.processing")
    );
    expect(screen.getByTestId("analytics-rerun-btn").textContent).not.toContain(
      tr("dashboard.analytics.rerun")
    );
    expect(screen.getByTestId("analytics-rerun-btn").hasAttribute("disabled")).toBe(true);
  });

  it("renders the AI protocol text and delegates all actions", () => {
    const onRunAnalysis = vi.fn();
    const onOpenEducation = vi.fn();
    const onOpenPdfReport = vi.fn();
    const onNavigate = vi.fn();

    render(
      <AnalyticsSection
        data={DATA}
        patientName={PATIENT}
        onRunAnalysis={onRunAnalysis}
        onOpenEducation={onOpenEducation}
        onOpenPdfReport={onOpenPdfReport}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByTestId("analytics-protocol-title").textContent).toBe(
      tr("dashboard.analytics.protocol.title")
    );
    expect(screen.getByTestId("analytics-recommendation").textContent).toBe(DATA.recommendation);

    fireEvent.click(screen.getByTestId("analytics-rerun-btn"));
    fireEvent.click(screen.getByTestId("analytics-education-btn"));
    fireEvent.click(screen.getByTestId("analytics-pdf-btn"));
    fireEvent.click(screen.getByTestId("analytics-back-btn"));

    expect(onRunAnalysis).toHaveBeenCalledTimes(1);
    expect(onOpenEducation).toHaveBeenCalledTimes(1);
    expect(onOpenPdfReport).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith("patients");
  });
});
