import { useCallback, useState } from "react";
import { createEngine } from "@scalpai/analysis-engine";
import type { RgbaImage } from "@scalpai/analysis-engine";
import type {
  AnalysisProvenance,
  AnalyticsData,
  AnalyticsResult,
} from "../components/sections/AnalyticsSection";

export interface DashboardAnalysisLabels {
  protocolSoothing: string;
  protocolMeso: string;
}

export interface DashboardAnalysisInput {
  url: string;
  /** Server gallery item id, when the analysed photo is a stored one. */
  galleryItemId?: string;
}

export interface DashboardAnalysisDeps {
  /** Injectable seam for tests — the browser default decodes via canvas. */
  loadImage?: (url: string) => Promise<RgbaImage>;
  hashImage?: (image: RgbaImage) => Promise<string>;
}

export interface DashboardAnalysisState {
  isAnalyzing: boolean;
  result: AnalyticsData;
  runAnalysis: (input?: DashboardAnalysisInput) => Promise<void>;
}

/**
 * Decode the real pixels behind a photo URL. The analysis runs on what the
 * clinician actually sees — the old hook fed the engine a constant colour
 * buffer and labelled the output with Math.random (P4-B02/F09).
 */
async function decodeToRgba(url: string): Promise<RgbaImage> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    const frame = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: frame.data, width: frame.width, height: frame.height };
  } finally {
    bitmap.close();
  }
}

/** sha256 over the exact bytes the engine consumed — the provenance anchor. */
async function sha256Hex(image: RgbaImage): Promise<string> {
  const bytes = new Uint8Array(
    image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength) as ArrayBuffer,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Owns the analysis pipeline (P4-B02 / F09 remediation — Wave 2).
 *
 * The state is a discriminated union with no default clinical payload:
 * before a real run the UI renders its empty state. A `ready` result exists
 * only after the engine consumed real pixels and carries their hash plus the
 * model version — the same contract the server verifies on ingest (ADR-0043).
 */
export function useDashboardAnalysis(
  labels: DashboardAnalysisLabels,
  deps: DashboardAnalysisDeps = {},
): DashboardAnalysisState {
  const [result, setResult] = useState<AnalyticsData>({ state: "empty" });
  const loadImage = deps.loadImage ?? decodeToRgba;
  const hashImage = deps.hashImage ?? sha256Hex;

  const runAnalysis = useCallback(
    async (input?: DashboardAnalysisInput) => {
      if (!input?.url) {
        setResult({ state: "error" });
        return;
      }
      setResult({ state: "analyzing" });
      try {
        const image = await loadImage(input.url);
        const output = await createEngine().analyze({ image });
        const data: AnalyticsResult = {
          scores: output.scores,
          severity: output.severity,
          modelVersion: output.modelVersion,
          recommendation:
            output.scores.redness > 35 ? labels.protocolSoothing : labels.protocolMeso,
        };
        const provenance: AnalysisProvenance = {
          imageHash: await hashImage(image),
          modelVersion: output.modelVersion,
          analyzedAt: new Date().toISOString(),
          galleryItemId: input.galleryItemId,
        };
        setResult({ state: "ready", data, provenance });
      } catch {
        setResult({ state: "error" });
      }
    },
    [hashImage, labels.protocolMeso, labels.protocolSoothing, loadImage],
  );

  return { isAnalyzing: result.state === "analyzing", result, runAnalysis };
}
