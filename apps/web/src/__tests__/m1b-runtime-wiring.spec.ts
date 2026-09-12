import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB_SRC = join(import.meta.dirname, "..");
const dashboardSource = readFileSync(join(WEB_SRC, "components", "ClinicalDashboard.tsx"), "utf8");
const overlaySource = readFileSync(join(WEB_SRC, "components", "NeuralSegmentationOverlay.tsx"), "utf8");

describe("M1b runtime wiring", () => {
  it("keeps ClinicalDashboard behind the explicit provider boundary", () => {
    expect(dashboardSource).not.toContain("SAMPLE_PATIENTS");
    expect(dashboardSource).not.toContain("SAMPLE_IMAGES");
    expect(dashboardSource).toContain("DashboardDataProvider");
    expect(dashboardSource).toContain("dataProvider = EMPTY_REAL_DATA_PROVIDER");
    expect(dashboardSource).toContain("dataProvider.mode=\"demo\"");
  });

  it("keeps overlay detections behind an explicit input boundary", () => {
    expect(overlaySource).not.toContain("SAMPLE_DETECTIONS");
    expect(overlaySource).toContain("detections?: readonly FollicleDetection[]");
    expect(overlaySource).toContain("detections.map");
    expect(overlaySource).toContain("detections.length");
  });
});
