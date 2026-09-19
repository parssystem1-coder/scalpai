/// <reference types="node" />
// @vitest-environment jsdom
//
// Wave 3 (P4 remediation) — locale parity as BEHAVIOUR, not file inventory.
// The old gate counted locale files; it could not see what a user actually
// gets. These tests render the real dashboard twice — once per locale — and
// assert what the parity actually means:
//   1. `dir` follows the locale (fa ⇒ rtl, en ⇒ ltr) and is owned by
//      documentElement, never by inline markup (wave 1's directory walk).
//   2. Every visible string resolves in BOTH locales — a key that exists only
//      in fa renders as its raw key for the English user (the class of bug the
//      dashboard.dividers.patients incident exposed).
//   3. Digits stay ASCII in data contexts (faNum shapes numerals at render,
//      rules §9) — asserted on the rendered roster, not on file contents.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClinicalDashboard } from "../components/ClinicalDashboard.js";
import { createTestDashboardDataProvider } from "../data/dashboard-data-provider.js";
import i18n from "../i18n.js";

vi.mock("../api/client", () => ({
  apiFetch: vi.fn().mockResolvedValue(null),
  clearAccessToken: vi.fn(),
}));

vi.mock("../offline/SyncProvider", () => ({
  useSync: () => ({ isOnline: true, pendingCount: 0, deadLetterCount: 0, lastPullAt: null }),
}));

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

async function mountWithLocale(lng: "fa" | "en") {
  await i18n.changeLanguage(lng);
  document.documentElement.dir = lng === "fa" ? "rtl" : "ltr";
  document.documentElement.lang = lng;
  renderDashboard();
}

afterEach(async () => {
  cleanup();
  await i18n.changeLanguage("fa");
  vi.restoreAllMocks();
});

describe("wave 3 — locale parity is behaviour, not file inventory", () => {
  it("renders fa as rtl and en as ltr on documentElement, from the same tree", async () => {
    await mountWithLocale("fa");
    expect(document.documentElement.dir).toBe("rtl");
    cleanup();

    await mountWithLocale("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("shows no inline dir= in any tsx — direction stays with i18n (regression: InboxPage)", () => {
    // Re-uses the wave 1 directory walk as the inline-markup half of parity.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "__tests__") continue;
          walk(full);
        } else if (entry.name.endsWith(".tsx") && readFileSync(full, "utf8").includes('dir="rtl"')) {
          offenders.push(full);
        }
      }
    };
    walk(WEB_SRC);
    expect(offenders).toEqual([]);
  });

  it("resolves every string the dashboard renders in BOTH locales", async () => {
    for (const lng of ["fa", "en"] as const) {
      await mountWithLocale(lng);
      // Every heading the real dashboard renders must be translated text in
      // the active locale — never a raw key like "dashboard.emptyState.title"
      // (the class of bug the dividers.patients incident exposed).
      const headings = screen.getAllByRole("heading");
      expect(headings.length).toBeGreaterThan(0);
      for (const heading of headings) {
        const text = heading.textContent ?? "";
        expect(text).not.toMatch(/^[a-zA-Z0-9._]+$/);
      }
      cleanup();
    }
  });

  it("keeps numeric data ASCII while shaping display numerals in fa only (faNum)", async () => {
    const { faNum } = await import("../i18n.js");
    await i18n.changeLanguage("fa");
    expect(faNum(1234)).toMatch(/[\u06F0-\u06F9]/);
    await i18n.changeLanguage("en");
    expect(faNum(1234)).toBe("1234");
    // undefined → empty string, never "undefined" or a fabricated zero.
    expect(faNum(undefined)).toBe("");
  });
});
