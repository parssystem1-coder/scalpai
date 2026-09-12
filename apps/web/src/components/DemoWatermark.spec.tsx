// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DemoWatermark } from "./DemoWatermark.js";
import i18n from "../i18n.js";

afterEach(cleanup);

describe("DemoWatermark", () => {
  it("renders a permanent, non-dismissible warning in demo mode", () => {
    render(<DemoWatermark mode="demo" surface="dashboard" />);

    const watermark = screen.getByTestId("demo-watermark-dashboard");
    expect(watermark).toBeDefined();
    expect(watermark.getAttribute("role")).toBe("status");
    expect(watermark.textContent).toContain(
      i18n.t("dashboard.demoWatermark.label")
    );
    expect(watermark.querySelector("button")).toBeNull();
    expect(watermark.className).toContain("pointer-events-none");
  });

  it("renders nothing for real and test data modes", () => {
    const { rerender } = render(<DemoWatermark mode="real" surface="overlay" />);
    expect(screen.queryByTestId("demo-watermark-overlay")).toBeNull();

    rerender(<DemoWatermark mode="test" surface="overlay" />);
    expect(screen.queryByTestId("demo-watermark-overlay")).toBeNull();
  });
});
