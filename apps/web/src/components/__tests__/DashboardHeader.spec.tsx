// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DashboardHeader from "../DashboardHeader.js";
import i18n, { faNum } from "../../i18n.js";

afterEach(cleanup);

type HeaderProps = ComponentProps<typeof DashboardHeader>;

/**
 * Phase B: elements are selected by data-testid and copy is compared against the
 * bundle through `tr()`. Nothing in this file pins a Persian string, so rewording
 * a translation is no longer a test failure - and the identical assertions hold
 * once the UI is switched to en (see DashboardHeader.en.spec.tsx).
 */
const tr = (key: string): string => String(i18n.t(key));

const handlers = () => ({
  onSectionChange: vi.fn(),
  onOpenSyncInspector: vi.fn(),
  onOpenLicenseDiagnostics: vi.fn(),
  onOpenEducation: vi.fn(),
  onOpenGuidedCapture: vi.fn(),
  onOpenPdfReport: vi.fn(),
  onOpenConsent: vi.fn(),
  onLogout: vi.fn(),
});

const renderHeader = (overrides: Partial<HeaderProps> = {}) => {
  const spies = handlers();
  const props: HeaderProps = {
    userEmail: "tricho@scalpai.clinic",
    isOnline: true,
    pendingCount: 0,
    activeSection: "patients",
    ...spies,
    ...overrides,
  };
  render(<DashboardHeader {...props} />);
  return spies;
};

describe("DashboardHeader (Phase 5 i18n, Phase B testids)", () => {
  it("renders the clinic identity and the signed-in trichologist from i18n", () => {
    renderHeader();

    expect(screen.getByTestId("dashboard-header")).toBeDefined();
    expect(screen.getByTestId("dashboard-clinic-name").textContent).toBe(
      tr("dashboard.header.clinicName")
    );
    expect(screen.getByTestId("dashboard-version").textContent).toContain(
      tr("dashboard.header.version")
    );
    // Only the local part of the address is displayed.
    expect(screen.getByTestId("dashboard-trichologist").textContent).toContain("tricho");
    expect(screen.getByTestId("dashboard-trichologist").textContent).not.toContain("scalpai.clinic");
  });

  it("shows the online copy and hides the outbox badge when nothing is pending", () => {
    renderHeader({ isOnline: true, pendingCount: 0 });

    expect(screen.getByTestId("dashboard-connection").textContent).toContain(
      tr("dashboard.header.online")
    );
    expect(screen.getByTestId("dashboard-sync-badge").textContent).toContain(
      tr("dashboard.header.sync")
    );
    expect(screen.queryByTestId("dashboard-pending-badge")).toBeNull();
    expect(screen.queryByTestId("dashboard-sync-pending-count")).toBeNull();
  });

  it("switches to the offline copy and shows the pending count in shaped digits", () => {
    renderHeader({ isOnline: false, pendingCount: 3 });

    expect(screen.getByTestId("dashboard-connection").textContent).toContain(
      tr("dashboard.header.offline")
    );
    expect(screen.getByTestId("dashboard-sync-badge").textContent).toContain(
      tr("dashboard.header.offlineMode")
    );
    expect(screen.getByTestId("dashboard-pending-badge").textContent).toBe(
      `${faNum(3)} ${tr("dashboard.header.syncPending")}`
    );
    expect(screen.getByTestId("dashboard-sync-pending-count").textContent).toBe(faNum(3));
  });

  it("fires every action callback, and never clears the token itself", () => {
    const spies = renderHeader();

    fireEvent.click(screen.getByTestId("dashboard-sync-badge"));
    fireEvent.click(screen.getByTestId("dashboard-license-btn"));
    fireEvent.click(screen.getByTestId("dashboard-education-btn"));
    fireEvent.click(screen.getByTestId("dashboard-capture-btn"));
    fireEvent.click(screen.getByTestId("dashboard-pdf-btn"));
    fireEvent.click(screen.getByTestId("dashboard-consent-btn"));
    fireEvent.click(screen.getByTestId("dashboard-logout-btn"));

    expect(spies.onOpenSyncInspector).toHaveBeenCalledTimes(1);
    expect(spies.onOpenLicenseDiagnostics).toHaveBeenCalledTimes(1);
    expect(spies.onOpenEducation).toHaveBeenCalledTimes(1);
    expect(spies.onOpenGuidedCapture).toHaveBeenCalledTimes(1);
    expect(spies.onOpenPdfReport).toHaveBeenCalledTimes(1);
    expect(spies.onOpenConsent).toHaveBeenCalledTimes(1);
    expect(spies.onLogout).toHaveBeenCalledTimes(1);
  });

  it("embeds the desktop tab nav and forwards section changes", () => {
    const spies = renderHeader({ activeSection: "ai-studio" });

    expect(screen.getByTestId("dashboard-tabs").getAttribute("aria-label")).toBe(
      tr("dashboard.tabs.navLabel")
    );

    fireEvent.click(screen.getByTestId("dashboard-tab-patients"));
    expect(spies.onSectionChange).toHaveBeenCalledWith("patients");
  });
});
