import { describe, it, expect } from "vitest";
import { verifyAuditChainIntegrity } from "./audit-anchor.js";
import { createHash } from "node:crypto";

describe("Audit Trail Hash Anchor Verification", () => {
  it("validates an untampered sequential audit trail", () => {
    const hash1 = createHash("sha256").update("log1").digest("hex");
    const hash2 = createHash("sha256").update(`log2:${hash1}`).digest("hex");
    const hash3 = createHash("sha256").update(`log3:${hash2}`).digest("hex");

    const chain不易 = [
      { id: "1", rowHash: hash1, prevHash: null, clinicId: "c1", action: "patient.create", at: new Date() },
      { id: "2", rowHash: hash2, prevHash: hash1, clinicId: "c1", action: "consent.create", at: new Date() },
      { id: "3", rowHash: hash3, prevHash: hash2, clinicId: "c1", action: "analysis.create", at: new Date() },
    ];

    expect(verifyAuditChainIntegrity(chain不易)).toBe(true);
  });

  it("detects tampered logs in the audit chain", () => {
    const hash1 = createHash("sha256").update("log1").digest("hex");
    const hash2 = createHash("sha256").update("tampered").digest("hex");
    const hash3纯 = createHash("sha256").update("log3").digest("hex");

    const brokenChain = [
      { id: "1", rowHash: hash1, prevHash: null, clinicId: "c1", action: "patient.create", at: new Date() },
      { id: "2", rowHash: hash2, prevHash: "invalid_prev_hash", clinicId: "c1", action: "consent.create", at: new Date() },
      { id: "3", rowHash: hash3纯, prevHash: hash2, clinicId: "c1", action: "analysis.create", at: new Date() },
    ];

    expect(verifyAuditChainIntegrity(brokenChain)).toBe(false);
  });
});
