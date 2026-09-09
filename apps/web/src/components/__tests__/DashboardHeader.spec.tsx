// @vitest-environment jsdom
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DashboardHeader from "../DashboardHeader.js";
import { faNum } from "../../i18n.js";

afterEach(cleanup);

type HeaderProps = ComponentProps<typeof DashboardHeader>;

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

describe("DashboardHeader (Phase 5 i18n)", () => {
  it("renders the clinic identity and the signed-in trichologist from i18n", () => {
    renderHeader();

    expect(screen.getByText("کلینیک عصبی ScalpAI")).toBeDefined();
    expect(screen.getByText("AI Vision Core v4.8")).toBeDefined();
    // Only the local part of the address is displayed.
    expect(screen.getByText(/تریکولوژیست:\s*tricho$/)).toBeDefined();
    expect(screen.queryByText(/scalpai\.clinic/)).toBeNull();
  });

  it("shows the online copy and hides the outbox badge when nothing is pending", () => {
    renderHeader({ isOnline: true, pendingCount: 0 });

    expect(screen.getByText("موتور عصبی آنلاین")).toBeDefined();
    expect(screen.getByText("همگام")).toBeDefined();
    expect(screen.queryByText(/در نوبت سینک/)).toBeNull();
  });

  it("switches to the offline copy and shows the pending count in Persian digits", () => {
    renderHeader({ isOnline: false, pendingCount: 3 });

    expect(screen.getByText("پایگاه محلی آفلاین")).toBeDefined();
    expect(screen.getByText("آفلاین")).toBeDefined();
    expect(screen.getByText(`${faNum(3)} در نوبت سینک`)).toBeDefined();
  });

  it("fires every action callback, and never clears the token itself", () => {
    const spies = renderHeader();

    fireEvent.click(screen.getByTitle("وضعیت همگام‌سازی و پایگاه داده آفلاین"));
    fireEvent.click(screen.getByTitle("بررسی اعتبار لایسنس و سلامت ساعت سیستم"));
    fireEvent.click(screen.getByTitle("پروتکل عکس‌برداری هدایت‌شده و گیت کیفیت"));
    fireEvent.click(screen.getByTitle("صدور گزارش رسمی بالینی تریکوسکوپی (PDF)"));
    fireEvent.click(screen.getByText("امضای رضایت‌نامه"));
    fireEvent.click(screen.getByTitle("خروج از حساب"));

    expect(spies.onOpenSyncInspector).toHaveBeenCalledTimes(1);
    expect(spies.onOpenLicenseDiagnostics).toHaveBeenCalledTimes(1);
    expect(spies.onOpenGuidedCapture).toHaveBeenCalledTimes(1);
    expect(spies.onOpenPdfReport).toHaveBeenCalledTimes(1);
    expect(spies.onOpenConsent).toHaveBeenCalledTimes(1);
    expect(spies.onLogout).toHaveBeenCalledTimes(1);
  });

  it("embeds the desktop tab nav and forwards section changes", () => {
    const spies = renderHeader({ activeSection: "ai-studio" });

    expect(screen.getByLabelText("بخش‌های داشبورد کلینیکی")).toBeDefined();

    fireEvent.click(screen.getByText("پرونده و مراجعین"));
    expect(spies.onSectionChange).toHaveBeenCalledWith("patients");
  });
});
