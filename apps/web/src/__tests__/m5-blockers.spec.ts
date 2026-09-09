// @vitest-environment jsdom
//
// M5 blocker regression guard (docs/WEAKNESSES-V2-10-PHASES.md).
//
// These assertions encode the RULE rather than a snapshot: the point is that
// reintroducing any of the five blockers turns this suite red, no matter how
// the surrounding markup is refactored.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import i18n, { formatDate } from "../i18n.js";

const read = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const dashboardSource = read("../components/ClinicalDashboard.tsx");
const patientListSource = read("../components/sections/PatientListSection.tsx");
const samplesSource = read("../data/dashboard-samples.ts");
const roadmapSource = read("../../../../docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md");

/** Persian (U+06F0-U+06F9) and Arabic-Indic (U+0660-U+0669) numerals. */
const NON_ASCII_DIGITS = /[\u06F0-\u06F9\u0660-\u0669]/;

describe("M5 blocker 1.1 — production build must not dereference DEV-only samples", () => {
  it("never asserts a first sample patient exists", () => {
    expect(dashboardSource).not.toContain("SAMPLE_PATIENTS[0]!");
  });

  it("keeps the selection nullable and renders an empty state instead", () => {
    expect(dashboardSource).toContain("useState<Patient | null>(null)");
    expect(dashboardSource).toContain("dashboard.emptyState.title");
  });

  it("ships an empty-state translation in both locales", () => {
    expect(i18n.getFixedT("fa")("dashboard.emptyState.title")).not.toBe(
      "dashboard.emptyState.title"
    );
    expect(i18n.getFixedT("en")("dashboard.emptyState.title")).not.toBe(
      "dashboard.emptyState.title"
    );
  });
});

describe("M5 blocker 1.2 — direction is never hardcoded in the dashboard", () => {
  it('has no dir="rtl" in the dashboard or its lightbox', () => {
    expect(dashboardSource).not.toContain('dir="rtl"');
  });

  it("leaves direction to documentElement, which i18n owns", () => {
    expect(document.documentElement.dir).toBe(i18n.language === "fa" ? "rtl" : "ltr");
  });
});

describe("M5 blocker 1.3 — no hardcoded copy left in the dashboard", () => {
  it("routes the section dividers through t()", () => {
    expect(dashboardSource).not.toContain("SECTION 02");
    expect(dashboardSource).not.toContain("SECTION 03");
    expect(dashboardSource).not.toContain("SECTION 04");
    expect(dashboardSource).toContain("dashboard.dividers.scalpMap");
    expect(dashboardSource).toContain("dashboard.dividers.trichoscopy");
    expect(dashboardSource).toContain("dashboard.dividers.aiEngine");
    expect(dashboardSource).toContain("dashboard.dividers.hologram");
  });

  it("translates image alt text and tag chips", () => {
    expect(dashboardSource).not.toContain('alt="Trichoscopy"');
    expect(dashboardSource).not.toContain('alt="Full Trichoscopy View"');
    expect(dashboardSource).toContain("dashboard.galleryVision.thumbAlt");
    expect(dashboardSource).toContain("dashboard.lightbox.imageAlt");
    expect(dashboardSource).toContain("dashboard.galleryVision.tagChip");
  });

  it("derives the patient initial from translation data, not a Persian literal", () => {
    expect(patientListSource).not.toContain('replace("\u062f\u06a9\u062a\u0631 "');
    expect(patientListSource).toContain("dashboard.patientList.titlePrefixes");
    expect(i18n.getFixedT("en")("dashboard.patientList.titlePrefixes")).toContain("Dr.");
  });

  it("has no Persian-digit date literal left in the dashboard", () => {
    expect(NON_ASCII_DIGITS.test(dashboardSource)).toBe(false);
  });
});

describe("M5 blocker 1.4 — stored data stays ASCII, the render layer localises", () => {
  it("keeps sample data free of non-ASCII digits", () => {
    expect(NON_ASCII_DIGITS.test(samplesSource)).toBe(false);
  });

  it("stores every sample date as ISO YYYY-MM-DD", () => {
    const dates = [...samplesSource.matchAll(/(?:lastVisit|date):\s*"([^"]+)"/g)].map(
      (match) => match[1]
    );
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("renders ISO dates as Jalali for fa and ISO for en, with ASCII digits", () => {
    const persian = formatDate("2024-08-31", "fa");
    // Strip any bidi control characters the platform may insert.
    expect(persian.replace(/[^\d/]/g, "")).toBe("1403/06/10");
    expect(NON_ASCII_DIGITS.test(persian)).toBe(false);
    expect(formatDate("2024-08-31", "en")).toBe("2024-08-31");
  });

  it("passes through already-localised labels and empty values untouched", () => {
    const captured = i18n.getFixedT("fa")("dashboard.photoDates.captured");
    expect(formatDate(captured, "fa")).toBe(captured);
    expect(formatDate(undefined, "fa")).toBe("");
    expect(formatDate("not-a-date", "en")).toBe("not-a-date");
  });
});

describe("M5 blocker 1.5 — the roadmap may not claim work that does not exist", () => {
  it("no longer ticks Phase 4", () => {
    expect(roadmapSource).toContain("Phase 4: Extract Modal & Side Panels — **NOT STARTED**");
    expect(roadmapSource).not.toContain("- [x] Keyboard escape to close");
    expect(roadmapSource).not.toContain("- [x] Focus management");
  });

  it("no longer claims a tablist or arrow-key navigation", () => {
    expect(roadmapSource).not.toContain("- [x] ARIA roles correct");
    expect(roadmapSource).not.toContain("- [x] Full keyboard navigation");
  });
});
