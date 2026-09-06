import { describe, it, expect } from "vitest";
import { CLINICAL_STORYBOARDS } from "./storyboards.js";
import {
  mapAnalysisToStoryboards,
  getStoryboardWithSeverity,
  getAllStoryboardsList,
} from "./mapper.js";
import type { ConditionKey, SeverityLevel } from "./types.js";

describe("@scalpai/education — Storyboards & Mapper (DESIGN-V2 §11)", () => {
  const allConditions: ConditionKey[] = [
    "androgenetic_alopecia",
    "telogen_effluvium",
    "seborrheic_dermatitis",
    "folliculitis",
    "hyperseborrhea",
    "scalp_dryness",
    "erythema",
    "follicular_plugging",
  ];

  it("contains all 8 clinical storyboards mandated by DESIGN-V2 §11", () => {
    const list = getAllStoryboardsList();
    expect(list.length).toBe(8);

    for (const key of allConditions) {
      const sb = CLINICAL_STORYBOARDS[key];
      expect(sb).toBeDefined();
      expect(sb.id).toBe(key);
      expect(sb.title.fa).toBeTruthy();
      expect(sb.title.en).toBeTruthy();
      expect(sb.scene).toBeTruthy();
      expect(sb.cameraPath.length).toBeGreaterThanOrEqual(3);
      expect(sb.highlight).toBeTruthy();
      // Hard rules of §11:
      expect(sb.reviewedBy).toMatch(/Dr\..*2026/);
      expect(sb.disclaimer.fa).toContain("آموزشی");
      expect(sb.disclaimer.en).toContain("educational");
    }
  });

  it("supports mild, moderate, and severe state machines for all 8 storyboards without error (24 permutations)", () => {
    const severities: SeverityLevel[] = ["mild", "moderate", "severe"];

    for (const key of allConditions) {
      for (const sev of severities) {
        const mapped = getStoryboardWithSeverity(key, sev);
        expect(mapped.condition).toBe(key);
        expect(mapped.severity).toBe(sev);
        expect(mapped.stateMachineInput).toBe(sev === "mild" ? 1 : sev === "moderate" ? 2 : 3);
        expect(mapped.currentNarration.fa).toBeTruthy();
        expect(mapped.currentNarration.en).toBeTruthy();
      }
    }
  });

  it("maps clinical analysis inputs to prioritized storyboards", () => {
    const clinicalInput = {
      hairLossScore: 75, // severe AGA
      rednessScore: 50, // moderate erythema
      sebumScore: 10, // low sebum -> scalp dryness
    };

    const results = mapAnalysisToStoryboards(clinicalInput);
    expect(results.length).toBeGreaterThanOrEqual(2);

    // Highest score should be first (hairLossScore 75)
    expect(results[0].condition).toBe("androgenetic_alopecia");
    expect(results[0].severity).toBe("severe");
    expect(results[0].stateMachineInput).toBe(3);

    // Should detect erythema
    const erythema = results.find((r) => r.condition === "erythema");
    expect(erythema).toBeDefined();
    expect(erythema?.severity).toBe("moderate");

    // Should detect scalp dryness
    const dryness = results.find((r) => r.condition === "scalp_dryness");
    expect(dryness).toBeDefined();
  });

  it("provides baseline educational storyboard if analysis values are minimal", () => {
    const results = mapAnalysisToStoryboards({});
    expect(results.length).toBe(1);
    expect(results[0].condition).toBe("androgenetic_alopecia");
  });
});
