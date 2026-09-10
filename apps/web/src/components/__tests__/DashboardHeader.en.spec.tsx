// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import DashboardHeader from "../DashboardHeader.js";
import i18n from "../../i18n.js";

/**
 * M5 proof, phase B: the header must be fully translatable. Rendered under `en`,
 * nothing in its subtree may carry a Persian codepoint (U+0600-U+06FF covers the
 * letters, the shaped digits and the Arabic percent sign) and the DOM must not
 * force RTL.
 *
 * The language is process-wide, so it is handed back in afterAll - vitest runs
 * files sequentially (fileParallelism: false), never concurrently with it.
 */
const PERSIAN = /[\u0600-\u06FF]/;

type HeaderProps = ComponentProps<typeof DashboardHeader>;

const renderHeader = (overrides: Partial<HeaderProps> = {}): void => {
  const props: HeaderProps = {
    userEmail: "tricho@scalpai.clinic",
    isOnline: true,
    pendingCount: 0,
    activeSection: "patients",
    onSectionChange: vi.fn(),
    onOpenSyncInspector: vi.fn(),
    onOpenLicenseDiagnostics: vi.fn(),
    onOpenEducation: vi.fn(),
    onOpenGuidedCapture: vi.fn(),
    onOpenPdfReport: vi.fn(),
    onOpenConsent: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  };
  render(<DashboardHeader {...props} />);
};

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

describe("DashboardHeader (en)", () => {
  it("renders in English without Persian characters", () => {
    renderHeader();

    const element = screen.getByTestId("dashboard-header");

    expect(element).toBeDefined();
    expect(element.textContent).not.toMatch(PERSIAN);
    expect(element.getAttribute("dir")).not.toBe("rtl");
  });

  it("resolves the English bundle, not the fa fallback", () => {
    renderHeader({ isOnline: true, pendingCount: 0 });

    expect(screen.getByTestId("dashboard-clinic-name").textContent).toBe("ScalpAI Neural Clinic");
    expect(screen.getByTestId("dashboard-connection").textContent).toContain("Neural Motor Online");
    expect(screen.getByTestId("dashboard-logout-btn").textContent).toContain("Logout");
  });

  it("keeps the outbox counter in ASCII digits and stays Persian-free while offline", () => {
    renderHeader({ isOnline: false, pendingCount: 3 });

    const element = screen.getByTestId("dashboard-header");

    expect(screen.getByTestId("dashboard-sync-pending-count").textContent).toBe("3");
    expect(screen.getByTestId("dashboard-pending-badge").textContent).toBe("3 in sync queue");
    expect(element.textContent).not.toMatch(PERSIAN);
  });
});
