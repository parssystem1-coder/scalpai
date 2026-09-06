import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLINICAL_DISCLAIMER_FA,
  REPORT_SEAL_VERSION,
  ReportSealError,
  generateReportSealKeyPair,
  mayClaimAuthenticity,
  resetSealKeyCache,
  sealReport,
  trySealReport,
  verifyReportSeal,
} from "./report-seal.js";

const pair = generateReportSealKeyPair();
const other = generateReportSealKeyPair();
const bytes = Buffer.from("%PDF-1.7 rendered report bytes");
const contentSha256 = createHash("sha256").update(bytes).digest("hex");

const subject = {
  clinicId: "11111111-1111-1111-1111-111111111111",
  patientId: "22222222-2222-2222-2222-222222222222",
  reportId: "33333333-3333-3333-3333-333333333333",
  contentSha256,
  issuedAt: "2026-09-06T10:00:00.000Z",
  modelVersion: "heuristic-1.2.0",
};

const saved = process.env.REPORT_SEAL_PRIVATE_KEY;

beforeEach(() => {
  process.env.REPORT_SEAL_PRIVATE_KEY = pair.privateKey;
  delete process.env.REPORT_SEAL_PUBLIC_KEY;
  resetSealKeyCache();
});

afterEach(() => {
  if (saved === undefined) delete process.env.REPORT_SEAL_PRIVATE_KEY;
  else process.env.REPORT_SEAL_PRIVATE_KEY = saved;
  resetSealKeyCache();
});

describe("report seal (M9)", () => {
  it("signs a canonical payload that carries digest, model and disclaimer", () => {
    const seal = sealReport(subject);
    expect(seal.version).toBe(REPORT_SEAL_VERSION);
    expect(seal.payload.contentSha256).toBe(contentSha256);
    expect(seal.payload.disclaimer).toBe(CLINICAL_DISCLAIMER_FA);
    expect(seal.qr.split("|")).toHaveLength(5);
    expect(verifyReportSeal(seal)).toBe(true);
    expect(mayClaimAuthenticity(seal, contentSha256)).toBe(true);
  });

  it("refuses the claim when the rendered bytes differ from the sealed digest", () => {
    const seal = sealReport(subject);
    const otherDigest = createHash("sha256").update("different bytes").digest("hex");
    expect(mayClaimAuthenticity(seal, otherDigest)).toBe(false);
  });

  it("refuses a tampered payload or a foreign key", () => {
    const seal = sealReport(subject);
    const tampered = { ...seal, payload: { ...seal.payload, patientId: "someone-else" } };
    expect(verifyReportSeal(tampered)).toBe(false);
    expect(verifyReportSeal(seal, other.publicKey)).toBe(false);
  });

  it("drops the claim entirely when no key is configured", () => {
    delete process.env.REPORT_SEAL_PRIVATE_KEY;
    resetSealKeyCache();
    expect(() => sealReport(subject)).toThrow(ReportSealError);
    expect(trySealReport(subject)).toBeNull();
    expect(mayClaimAuthenticity(null)).toBe(false);
  });

  it("rejects a digest that is not a sha256 hex string", () => {
    expect(() => sealReport({ ...subject, contentSha256: "not-a-digest" })).toThrow(ReportSealError);
  });
});
