// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import NeuralSegmentationOverlay, { type FollicleDetection } from "./NeuralSegmentationOverlay.js";
import i18n from "../i18n.js";

afterEach(cleanup);

const detections: FollicleDetection[] = [
  { id: "real-1", x: 25, y: 30, type: "double", caliber: 60, confidence: 97 },
  { id: "real-2", x: 65, y: 55, type: "single", caliber: 40, confidence: 91 },
];

describe("NeuralSegmentationOverlay runtime input boundary", () => {
  it("derives markers and telemetry from caller-provided detections", () => {
    const { container } = render(
      <NeuralSegmentationOverlay
        imageUrl="/analysis.jpg"
        areaName="Vertex"
        patientName="Real Patient"
        detections={detections}
      />
    );

    expect(screen.getByText(i18n.t("dashboard.neuralSegmentation.detectedCount", { count: 2 }))).toBeDefined();
    expect(
      screen.getByText(i18n.t("dashboard.neuralSegmentation.avgCaliber", { value: "50.0" }))
    ).toBeDefined();
    expect(container.querySelectorAll('[role="button"]').length).toBe(2);
  });

  it("renders a valid empty analysis state without hidden sample detections", () => {
    render(
      <NeuralSegmentationOverlay
        imageUrl="/analysis.jpg"
        areaName="Vertex"
        patientName="Real Patient"
        detections={[]}
      />
    );

    expect(screen.getByText(i18n.t("dashboard.neuralSegmentation.detectedCount", { count: 0 }))).toBeDefined();
    expect(screen.queryByRole("button", { name: /follicle|follicular/i })).toBeNull();
  });
});
