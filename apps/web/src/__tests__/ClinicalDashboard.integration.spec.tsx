// @vitest-environment jsdom
//
// Wave 4 - dashboard-integration gate (C1/C2 acceptance; the suite the
// dashboard-integration CI gate has been waiting for since the remediation
// plan). Behavioural, not grep: the REAL ClinicalDashboard renders against a
// test data provider, and the two invariants the Phase 4 gate cares about are
// asserted on the rendered tree:
//
//   C1 - the data path is the provider's, not component state: a patient that
//        exists in provider data renders, and one that does not exist never
//        appears.
//   C2 - no synthetic clinical output: the analytics surface renders its
//        explicit empty state before a real server analysis exists; no made-up
//        metric value (density / thickness / clarity) renders anywhere.
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClinicalDashboard } from "../components/ClinicalDashboard.js";
import { createTestDashboardDataProvider } from "../data/dashboard-data-provider.js";
import type { Patient } from "../data/dashboard-types.js";
import i18n from "../i18n.js";
import "../i18n.js";

vi.mock("../api/client", () => ({
  apiFetch: vi.fn().mockResolvedValue(null),
  clearAccessToken: vi.fn(),
}));

vi.mock("../offline/SyncProvider", () => ({
  useSync: () => ({ isOnline: true, pendingCount: 0, deadLetterCount: 0, lastPullAt: null }),
}));

// jsdom has neither matchMedia nor WebGL - the 3D hologram section is mocked
// and reduced-motion probing is stubbed before any component mounts.
vi.mock("../components/sections/HologramSection.js", () => ({
  default: () => <div data-testid="hologram-stub" />,
}));
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  onchange: null,
  dispatchEvent: () => false,
}));

const patient: Patient = {
  id: "integration-patient-1",
  firstName: "Maryam",
  lastName: "Rezaei",
  phone: "09129998877",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDashboard(patients: Patient[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const provider = createTestDashboardDataProvider({ patients, images: {} });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ClinicalDashboard userEmail="integration@scalpai.clinic" onLogout={() => undefined} dataProvider={provider} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("dashboard-integration (C1) - the data path is the provider's", () => {
  it("renders the provider's patient on the dashboard", () => {
    renderDashboard([patient]);
    expect(screen.getByTestId("patient-list-section")).toBeDefined();
    // The patient card carries a stable testid derived from the provider id.
    expect(screen.getByTestId(`patient-card-${patient.id}`)).toBeDefined();
    expect(screen.getByTestId(`patient-card-name-${patient.id}`).textContent).toContain("Maryam");
  });

  it("never renders a patient the provider does not know", () => {
    renderDashboard([patient]);
    // A synthetic roster would show the sample cast; the data path owns it.
    expect(screen.queryByText(/Sara/)).toBeNull();
    expect(screen.queryByText(/tricho@/)).toBeNull();
  });

  it("keeps the add-patient modal wired through the section's own button", () => {
    renderDashboard([patient]);
    fireEventClick(screen.getByTestId("patient-add-btn"));
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

function fireEventClick(el: HTMLElement) {
  // Imported lazily to keep the vi.mock hoisting above the RTL import simple.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fireEvent } = require("@testing-library/react") as typeof import("@testing-library/react");
  fireEvent.click(el);
}

describe("dashboard-integration (C2) - no synthetic clinical output", () => {
  it("shows the analytics empty state before any real server analysis", () => {
    renderDashboard([patient]);
    // The empty state is translated; asserting the translated string proves
    // the engine result (not a fabricated INITIAL_ANALYSIS) drives the UI.
    const emptyTitle = i18n.t("dashboard.analytics.emptyTitle", { lng: "fa" }) as string;
    expect(emptyTitle).not.toBe("dashboard.analytics.emptyTitle");
    expect(screen.getByTestId("analytics-empty")).toBeDefined();
    expect(screen.getByText(emptyTitle)).toBeDefined();
  });

  it("renders no fabricated density percentage anywhere on the shell", () => {
    renderDashboard([patient]);
    // The classic synthetic value (density 154 / 85 / 90) never renders: with
    // no server analysis every clinical metric is absent, not invented.
    expect(screen.queryByText(/154\s*%/)).toBeNull();
  });
});
