import type { AnalysisScores } from "@scalpai/shared";

export interface RgbaImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface AnalysisInput {
  image: RgbaImage;
  /** captured/uploaded timestamp for provenance (client clock, advisory) */
  takenAt?: string;
}

export interface AnalysisOutput {
  scores: AnalysisScores;
  severity: number; // 0..100 weighted mean
  modelVersion: string;
}

/**
 * Engine seam (ADR-6 / §10.5): today the only implementation is the
 * deterministic heuristic baseline; phase 6 adds an ONNX backend behind the
 * same interface without touching call sites.
 */
export interface AnalysisEngine {
  readonly backend: "heuristic" | "onnx";
  analyze(input: AnalysisInput): Promise<AnalysisOutput>;
}
