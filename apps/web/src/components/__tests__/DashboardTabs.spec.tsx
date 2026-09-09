// @vitest-environment jsdom
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import DashboardTabs from "../DashboardTabs.js";
import { SECTIONS } from "../dashboard-sections.js";
import i18n, { faNum } from "../../i18n.js";

afterEach(cleanup);

// The language is process-wide; hand it back so no later suite inherits "en".
afterAll(async () => {
  await i18n.changeLanguage("fa");
});

describe("DashboardTabs (Phase 5 i18n)", () => {
  it("renders one translated tab per section with Persian ordinals", () => {
    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} />);

    expect(screen.getByText("پرونده و مراجعین")).toBeDefined();
    expect(screen.getByText("نقشه زنده سر")).toBeDefined();
    expect(screen.getByText("ویژن تریکوسکوپی 4K")).toBeDefined();
    expect(screen.getByText("استودیوی محاسباتی AI")).toBeDefined();
    expect(screen.getByText("هولوگرام ۳ بعدی ساقه مو")).toBeDefined();

    // Ordinals are digit-shaped, so 1..5 render as ۱..۵ in the fa UI.
    expect(screen.getByText(faNum(1))).toBeDefined();
    expect(screen.getByText(faNum(5))).toBeDefined();

    expect(screen.getAllByRole("button").length).toBe(SECTIONS.length);
  });

  it("marks only the active tab with aria-current", () => {
    render(<DashboardTabs activeSection="gallery" onSectionChange={vi.fn()} />);

    const current = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-current") === "true");

    expect(current.length).toBe(1);
    expect(current[0]?.textContent).toContain("ویژن تریکوسکوپی 4K");
  });

  it("reports the clicked section id to the parent", () => {
    const onSectionChange = vi.fn();
    render(<DashboardTabs activeSection="patients" onSectionChange={onSectionChange} />);

    fireEvent.click(screen.getByText("استودیوی محاسباتی AI"));

    expect(onSectionChange).toHaveBeenCalledWith("ai-studio");
  });

  it("labels both variants for screen readers", () => {
    const { unmount } = render(
      <DashboardTabs activeSection="patients" onSectionChange={vi.fn()} variant="desktop" />
    );
    expect(screen.getByLabelText("بخش‌های داشبورد کلینیکی")).toBeDefined();
    unmount();

    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} variant="mobile" />);
    expect(screen.getByLabelText("بخش‌های داشبورد کلینیکی (موبایل)")).toBeDefined();
  });

  it("follows the active language: no Persian copy leaks into the English UI", async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });

    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} />);

    expect(screen.getByText("Patient Records")).toBeDefined();
    expect(screen.getByText("Live Scalp Map")).toBeDefined();
    expect(screen.getByText("3D Hair Shaft Hologram")).toBeDefined();
    expect(screen.queryByText("پرونده و مراجعین")).toBeNull();
    // Digits stop being shaped once the UI is not Persian.
    expect(screen.getByText("1")).toBeDefined();

    await act(async () => {
      await i18n.changeLanguage("fa");
    });
  });
});
