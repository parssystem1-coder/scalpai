export const PACKAGE_NAME = "@scalpai/analysis-core";
export { rgbaToGray, type GrayImage } from "./gray.js";
export {
  computeQuality,
  measureQuality,
  QUALITY_THRESHOLDS,
  type QualityMetrics,
  type QualityVerdict,
} from "./quality.js";
