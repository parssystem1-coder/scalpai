// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DashboardTabs from "../DashboardTabs.js";
import { SECTIONS } from "../dashboard-sections.js";
import i18n, { faNum } from "../../i18n.js";

afterEach(cleanup);

/**
 * Phase B: a tab is addressed by its SECTION ID, never by its label, so this file
 * no longer changes when a translation changes. The English render proof moved to
 * DashboardTabs.en.spec.tsx - keeping a `changeLanguage("en")` in the middle of
 * this suite meant one failing assertion could leak "en" into every later file.
 */
const tr = (key: string): string => String(i18n.t(key));

describe("DashboardTabs (Phase 5 i18n, Phase B testids)", () => {
  it("renders one translated tab per section with shaped ordinals", () => {
    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} />);

    expect(screen.getByTestId("dashboard-tabs")).toBeDefined();

    SECTIONS.forEach((sec, idx) => {
      expect(screen.getByTestId(`dashboard-tab-${sec.id}`)).toBeDefined();
      expect(screen.getByTestId(`dashboard-tab-label-${sec.id}`).textContent).toBe(tr(sec.labelKey));
      expect(screen.getByTestId(`dashboard-tab-ordinal-${sec.id}`).textContent).toBe(faNum(idx + 1));
    });

    expect(screen.getAllByRole("button").length).toBe(SECTIONS.length);
  });

  it("marks only the active tab with aria-current", () => {
    render(<DashboardTabs activeSection="gallery" onSectionChange={vi.fn()} />);

    const current = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "true");

    expect(current.length).toBe(1);
    expect(current[0]).toBe(screen.getByTestId("dashboard-tab-gallery"));
  });

  it("reports the clicked section id to the parent", () => {
    const onSectionChange = vi.fn();
    render(<DashboardTabs activeSection="patients" onSectionChange={onSectionChange} />);

    fireEvent.click(screen.getByTestId("dashboard-tab-ai-studio"));

    expect(onSectionChange).toHaveBeenCalledWith("ai-studio");
  });

  it("labels both variants for screen readers", () => {
    const { unmount } = render(
      <DashboardTabs activeSection="patients" onSectionChange={vi.fn()} variant="desktop" />
    );
    expect(screen.getByTestId("dashboard-tabs").getAttribute("aria-label")).toBe(
      tr("dashboard.tabs.navLabel")
    );
    unmount();

    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} variant="mobile" />);
    expect(screen.getByTestId("dashboard-tabs").getAttribute("aria-label")).toBe(
      tr("dashboard.tabs.navLabelMobile")
    );
    // Both variants expose the same hooks, so a spec never depends on the layout.
    expect(screen.getByTestId("dashboard-tab-patients")).toBeDefined();
  });
});
