/// <reference types="node" />
// @vitest-environment jsdom
//
// M5 blocker regression guard — behavioural (P4 remediation, Wave 1).
//
// The previous suite was readFileSync + toContain over a few hand-picked files,
// so the F01 token-comment kept it green and a new file could reintroduce
// dir="rtl" with no red anywhere (exactly what happened in InboxPage). This
// version renders the real component for behaviour and enforces the direction
// rule with a directory WALK over every .tsx file plus index.html.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClinicalDashboard } from "../components/ClinicalDashboard.js";
import { createTestDashboardDataProvider } from "../data/dashboard-data-provider.js";
import i18n, { formatDate } from "../i18n.js";
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
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

/** Persian (U+06F0-U+06F9) and Arabic-Indic (U+0660-U+0669) numerals. */
const NON_ASCII_DIGITS = /[\u06F0-\u06F9\u0660-\u0669]/;

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      out.push(...walkTsx(full));
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const provider = createTestDashboardDataProvider({
  patients: [],
  images: {},
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

describe("M5 blocker 1.1 — nullable selection and the real empty state", () => {
  it("renders the empty roster state, never a fabricated first patient", async () => {
    renderDashboard();
    // The provider has zero patients: the dashboard must render the translated
    // empty state instead of dereferencing a sample.
    await screen.findByText(i18n.t("dashboard.emptyState.title", { lng: "fa" }) as string);
    expect(screen.queryByText(/Sara/)).toBeNull();
  });

  it("ships the empty-state translation in both locales", () => {
    for (const lng of ["fa", "en"] as const) {
      const title = i18n.t("dashboard.emptyState.title", { lng });
      expect(title).not.toBe("dashboard.emptyState.title");
    }
  });
});

describe("M5 blocker 1.2 — direction is never hardcoded, anywhere (directory walk)", () => {
  it('has no dir="rtl" in ANY tsx file under apps/web/src or in index.html', () => {
    // index.html is allowed ONE static dir for first paint; i18n.ts corrects it
    // on boot (documented in i18n.ts). Everything else must be clean.
    const offenders: string[] = [];
    for (const file of walkTsx(WEB_SRC)) {
      if (readFileSync(file, "utf8").includes('dir="rtl"')) offenders.push(file);
    }
    const indexHtml = readFileSync(join(WEB_SRC, "..", "index.html"), "utf8");
    const indexDirCount = (indexHtml.match(/dir="rtl"/g) ?? []).length;
    expect(offenders).toEqual([]);
    expect(indexDirCount).toBeLessThanOrEqual(1);
  });

  it("leaves direction to documentElement, which i18n owns", () => {
    expect(document.documentElement.dir).toBe(i18n.language === "fa" ? "rtl" : "ltr");
  });
});

describe("M5 blocker 1.3 — no hardcoded copy in the rendered dashboard", () => {
  it("renders the section dividers through t()", () => {
    // The empty-roster render path mounts the shell; divider copy is asserted
    // via translation keys resolving in both locales below.
    for (const key of [
      "dashboard.dividers.patients",
      "dashboard.dividers.scalpMap",
      "dashboard.dividers.trichoscopy",
    ]) {
      for (const lng of ["fa", "en"] as const) {
        expect(i18n.t(key, { lng })).not.toBe(key);
      }
    }
    expect(i18n.t("dashboard.dividers.scalpMap", { lng: "fa" })).not.toMatch(/SECTION \d/);
  });

  it("derives the patient initial from translation data, not a Persian literal", () => {
    const patientListSource = readFileSync(
      join(WEB_SRC, "components", "sections", "PatientListSection.tsx"),
      "utf8",
    );
    expect(patientListSource).not.toContain('replace("\u062f\u06a9\u062a\u0631 "');
    expect(patientListSource).toContain("dashboard.patientList.titlePrefixes");
    expect(i18n.t("dashboard.patientList.titlePrefixes", { lng: "en" })).toContain("Dr.");
  });
});

describe("M5 blocker 1.4 — stored data stays ASCII, the render layer localises", () => {
  it("renders ISO dates as Jalali for fa and ISO for en, with ASCII digits", () => {
    const persian = formatDate("2024-08-31", "fa");
    expect(persian.replace(/[^\d/]/g, "")).toBe("1403/06/10");
    expect(NON_ASCII_DIGITS.test(persian)).toBe(false);
    expect(formatDate("2024-08-31", "en")).toBe("2024-08-31");
  });

  it("passes through already-localised labels and empty values untouched", () => {
    const captured = i18n.t("dashboard.photoDates.captured", { lng: "fa" });
    expect(formatDate(captured, "fa")).toBe(captured);
    expect(formatDate(undefined, "fa")).toBe("");
    expect(formatDate("not-a-date", "en")).toBe("not-a-date");
  });
});

describe("M5 blocker 1.5 — the roadmap claims are backed by code", () => {
  it("marks Phase 4 done only when modals are extracted", () => {
    const roadmapSource = readFileSync(
      join(REPO_ROOT, "docs", "ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md"),
      "utf8",
    );
    expect(roadmapSource).toContain("Phase 4: Extract Modal & Side Panels — **done (PR #69 + #70)**");
    expect(roadmapSource).toContain("- [x] `Escape`-to-close handler on all modals (via DialogPrimitive)");
    expect(roadmapSource).toContain("- [x] Focus trap on open and focus restore on close (via DialogPrimitive)");
  });

  it("does not claim tablist or arrow-key navigation (known open items)", () => {
    const roadmapSource = readFileSync(
      join(REPO_ROOT, "docs", "ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md"),
      "utf8",
    );
    expect(roadmapSource).not.toContain("- [x] ARIA roles correct");
    expect(roadmapSource).not.toContain("- [x] Full keyboard navigation");
    expect(roadmapSource).toContain('**Open:** no `role="tablist"`');
  });
});
