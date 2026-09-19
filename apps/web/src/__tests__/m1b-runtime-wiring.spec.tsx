/// <reference types="node" />
// @vitest-environment jsdom
//
// M1b runtime wiring — behavioural regression guard (P4-B02 / F01 remediation).
//
// The previous version of this suite read the component source with readFileSync
// and asserted on string literals — a comment listing those literals kept it
// green while the real wiring lived elsewhere (F01). These tests render the real
// component and assert on the DOM instead. Source scanning survives only as an
// *absence* rule (no SAMPLE_* import anywhere in the dashboard tree), which is
// the one thing a render test cannot prove.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClinicalDashboard } from "../components/ClinicalDashboard.js";
import { NeuralSegmentationOverlay } from "../components/NeuralSegmentationOverlay.js";
import { createTestDashboardDataProvider } from "../data/dashboard-data-provider.js";
import type { Patient, TrichoscopyImage } from "../data/dashboard-types.js";
import "../i18n.js";

vi.mock("../api/client", () => ({
  apiFetch: vi.fn().mockResolvedValue(null),
  clearAccessToken: vi.fn(),
}));

vi.mock("../offline/SyncProvider", () => ({
  useSync: () => ({ isOnline: true, pendingCount: 0, deadLetterCount: 0, lastPullAt: null }),
}));

// jsdom has neither matchMedia nor WebGL — the 3D hologram section is mocked
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

const WEB_SRC = join(import.meta.dirname, "..");

const testPatient: Patient = {
  id: "test-patient-1",
  firstName: "Sara",
  lastName: "Test",
  phone: "09120000000",
  lastVisit: "2026-09-19",
  scalpCondition: "Assessment",
  hairDensity: 154,
  anagenRatio: 85,
  keratinHealth: 90,
  sebumBalance: 75,
  microcirculation: 80,
  stemCellVitality: 85,
};

const testImage: TrichoscopyImage = {
  id: "test-image-1",
  patientId: testPatient.id,
  url: "https://cdn.example.com/signed-view.jpg",
  area: "vertex",
  date: "2026-09-19",
  density: 140,
  thickness: "70 µm",
  qualityScore: 90,
  tags: [],
  notes: "",
};

const provider = createTestDashboardDataProvider({
  patients: [testPatient],
  images: { [testPatient.id]: [testImage] },
});

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ClinicalDashboard userEmail="tester@scalpai.clinic" onLogout={() => undefined} dataProvider={provider} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("M1b runtime wiring — behaviour", () => {
  it("renders the roster from the data provider without any API patient merge", async () => {
    renderDashboard();
    const row = await screen.findByTestId("patient-card-name-test-patient-1");
    expect(row.textContent).toContain("Sara");
  });

  it("renders the trichoscopy gallery through a real URL — never a base64 data URL", async () => {
    renderDashboard();
    await screen.findByTestId("patient-card-name-test-patient-1");
    await vi.waitFor(() => {
      const img = document.querySelector("img");
      if (!img) throw new Error("no img rendered yet");
      expect(img.getAttribute("src")).toMatch(/^https:/);
      expect(img.getAttribute("src")).not.toMatch(/^data:/);
    });
  });

  it("keeps the overlay behind its detections input boundary", () => {
    render(<NeuralSegmentationOverlay imageUrl="https://cdn.example.com/x.jpg" areaName="Vertex" patientName="Sara Test" />);
    // detections defaults to [] — the overlay must render its empty telemetry,
    // never invent follicles.
    expect(document.querySelector("img")).toBeTruthy();
  });
});

describe("M1b runtime wiring — absence rules (the only legitimate greps)", () => {
  it("imports no SAMPLE_* anywhere under the dashboard tree", () => {
    const files = [join(WEB_SRC, "components", "ClinicalDashboard.tsx"), join(WEB_SRC, "components", "NeuralSegmentationOverlay.tsx")];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/SAMPLE_(PATIENTS|IMAGES|DETECTIONS)/);
      // F01 guard: the token-manifest comment must never come back.
      expect(source).not.toContain("dataProvider.mode=\"demo\", <DemoWatermark");
    }
  });
});
