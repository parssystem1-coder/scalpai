import { rgbaToGray, measureQuality } from "@scalpai/analysis-core";
import type { AnalysisEngine, AnalysisInput, AnalysisOutput, RgbaImage } from "./types.js";

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Heuristic baseline v0 — deterministic TS rewrite of the v1 analyze.py idea
 * (playbook 2.3). Pure functions over raw RGBA; runs identically in browser
 * (WASM-safe JS), Node tests, and later Electron.
 *
 *  redness        → excess of red channel over green/blue average
 *  flakeTexture   → Laplacian variance mapped through log curve (flakes/scales)
 *  densityProxy   → edge-pixel ratio mapped through a soft curve (hair density)
 */
export const heuristicEngine: AnalysisEngine = {
  backend: "heuristic",
  async analyze({ image }: AnalysisInput): Promise<AnalysisOutput> {
    const { data, width, height } = validate(image);

    // --- redness on RGB ---
    let excess = 0;
    const px = width * height;
    for (let i = 0; i < px; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const e = r - (g + b) / 2;
      if (e > 12) excess += e; // ignore sensor noise floor
    }
    const redness = clamp100((excess / px / 90) * 100);

    // --- texture + density on luma (reuse analysis-core primitives) ---
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const gray = rgbaToGray(view, width, height);
    const m = measureQuality(gray);
    const flakeTexture = clamp100(Math.log1p(m.blurVariance / 6) * 24);
    const densityProxy = clamp100(100 * (1 - Math.exp(-m.edgePixelRatio / 0.22)));

    const severity = clamp100(redness * 0.4 + flakeTexture * 0.35 + densityProxy * 0.25);
    return {
      scores: { redness, flakeTexture, densityProxy },
      severity,
      modelVersion: "heuristic-v0",
    };
  },
};

function validate(img: RgbaImage): Required<RgbaImage> & { data: Uint8ClampedArray | Uint8Array } {
  if (!img.data || img.width < 16 || img.height < 16) throw new Error("analysis input too small");
  if (img.data.length < img.width * img.height * 4) throw new Error("rgba buffer too small");
  return img as Required<RgbaImage> & { data: Uint8ClampedArray | Uint8Array };
}

/** Factory — the single seam call sites use. */
export function createEngine(opts?: { backend?: "heuristic" }): AnalysisEngine {
  switch (opts?.backend ?? "heuristic") {
    case "heuristic":
      return heuristicEngine;
    default:
      throw new Error("unknown analysis backend");
  }
}
