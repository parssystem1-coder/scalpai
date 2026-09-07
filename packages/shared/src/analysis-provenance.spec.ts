import { describe, expect, it } from "vitest";
import {
  ANALYSIS_MODEL_REGISTRY,
  ANALYSIS_NON_DIAGNOSTIC_LABEL,
  AnalysisProvenance,
  findRegisteredModel,
  isRegisteredModelVersion,
  modelRefOf,
} from "./analysis-provenance.js";
import { sha256HexOfText } from "./sha256.js";

const DIGEST = sha256HexOfText("pixels");
const model = ANALYSIS_MODEL_REGISTRY[0]!;

const valid = {
  imageSha256: DIGEST,
  pixelWidth: 1024,
  pixelHeight: 768,
  model: modelRefOf(model),
  computedAt: "2026-09-07T10:00:00.000Z",
  diagnostic: false as const,
};

describe("analysis provenance (H13)", () => {
  it("accepts a submission that references the registry exactly", () => {
    expect(AnalysisProvenance.parse(valid)).toMatchObject({ imageSha256: DIGEST, diagnostic: false });
  });

  it("refuses an unregistered model version", () => {
    const res = AnalysisProvenance.safeParse({ ...valid, model: { ...valid.model, version: "gpt-scalp-v9" } });
    expect(res.success).toBe(false);
  });

  it("refuses a tampered manifest revision for a known version", () => {
    const res = AnalysisProvenance.safeParse({ ...valid, model: { ...valid.model, revision: "manifest-1999-01-01" } });
    expect(res.success).toBe(false);
  });

  it("refuses a digest that is not sha256 hex", () => {
    expect(AnalysisProvenance.safeParse({ ...valid, imageSha256: "nope" }).success).toBe(false);
    expect(AnalysisProvenance.safeParse({ ...valid, imageSha256: DIGEST.toUpperCase() }).success).toBe(false);
  });

  it("refuses a client that claims diagnostic scope", () => {
    expect(AnalysisProvenance.safeParse({ ...valid, diagnostic: true }).success).toBe(false);
  });

  it("refuses geometry a real capture cannot have", () => {
    expect(AnalysisProvenance.safeParse({ ...valid, pixelWidth: 4 }).success).toBe(false);
    expect(AnalysisProvenance.safeParse({ ...valid, pixelHeight: 99_999 }).success).toBe(false);
  });

  it("keeps every registered model non-diagnostic", () => {
    expect(ANALYSIS_MODEL_REGISTRY.length).toBeGreaterThan(0);
    for (const m of ANALYSIS_MODEL_REGISTRY) expect(m.diagnostic).toBe(false);
    expect(isRegisteredModelVersion("heuristic-v0")).toBe(true);
    expect(isRegisteredModelVersion("heuristic-v99")).toBe(false);
    expect(findRegisteredModel("heuristic-v0")?.id).toBe("scalpai.heuristic");
  });

  it("states the non-diagnostic scope in both locales", () => {
    expect(ANALYSIS_NON_DIAGNOSTIC_LABEL.fa).toContain("غیرتشخیصی");
    expect(ANALYSIS_NON_DIAGNOSTIC_LABEL.en.toLowerCase()).toContain("non-diagnostic");
  });
});
