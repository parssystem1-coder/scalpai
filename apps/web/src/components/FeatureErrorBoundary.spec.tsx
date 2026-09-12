// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeatureErrorBoundary from "./FeatureErrorBoundary";

afterEach(cleanup);

describe("FeatureErrorBoundary", () => {
  it("renders children normally when no feature error occurs", () => {
    render(
      <FeatureErrorBoundary>
        <span>healthy feature</span>
      </FeatureErrorBoundary>,
    );
    expect(screen.getByText("healthy feature")).toBeDefined();
  });

  it("isolates a failed feature and exposes a retry action", () => {
    const onRetry = vi.fn();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error("feature failed");
    };

    render(
      <FeatureErrorBoundary onRetry={onRetry} resetLabel="Retry feature">
        <Broken />
      </FeatureErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry feature" }));
    expect(onRetry).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
