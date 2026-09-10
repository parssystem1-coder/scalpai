// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import DashboardTabs from "../DashboardTabs.js";
import { SECTIONS } from "../dashboard-sections.js";
import i18n from "../../i18n.js";

/** See DashboardHeader.en.spec.tsx for why the whole block is rejected. */
const PERSIAN = /[\u0600-\u06FF]/;

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

describe("DashboardTabs (en)", () => {
  it("renders in English without Persian characters", () => {
    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} />);

    const element = screen.getByTestId("dashboard-tabs");

    expect(element).toBeDefined();
    expect(element.textContent).not.toMatch(PERSIAN);
    expect(element.getAttribute("dir")).not.toBe("rtl");
    expect(element.getAttribute("aria-label")).toBe("Clinical dashboard sections");
  });

  it("stops shaping the ordinals once the UI is not Persian", () => {
    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} />);

    SECTIONS.forEach((sec, idx) => {
      const tab = screen.getByTestId(`dashboard-tab-${sec.id}`);
      expect(tab.textContent).not.toMatch(PERSIAN);
      expect(screen.getByTestId(`dashboard-tab-ordinal-${sec.id}`).textContent).toBe(
        String(idx + 1)
      );
    });

    expect(screen.getByTestId("dashboard-tab-label-patients").textContent).toBe("Patient Records");
    expect(screen.getByTestId("dashboard-tab-label-3d-model").textContent).toBe(
      "3D Hair Shaft Hologram"
    );
  });

  it("keeps the mobile variant Persian-free too", () => {
    render(<DashboardTabs activeSection="patients" onSectionChange={vi.fn()} variant="mobile" />);

    const element = screen.getByTestId("dashboard-tabs");

    expect(element.textContent).not.toMatch(PERSIAN);
    expect(element.getAttribute("aria-label")).toBe("Clinical dashboard sections (mobile)");
  });
});
