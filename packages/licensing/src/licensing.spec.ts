import { describe, it, expect } from "vitest";
import {
  generateLicensingKeyPair,
  signLicense,
  verifyLicense,
  type LicenseClaims,
} from "./index.js";

describe("ScalpAI Ed25519 Licensing Package", () => {
  const keys = generateLicensingKeyPair();
  const now = 1750000000; // Reference timestamp

  const validClaims: LicenseClaims = {
    sub: "clinic-shiraz-01",
    name: "Shiraz Hair & Scalp Clinic",
    tier: "professional",
    features: ["analysis:advanced", "offline:full", "white_label"],
    maxSeats: 10,
    maxPatients: 5000,
    issuedAt: now - 86400 * 10,
    expiresAt: now + 86400 * 30, // 30 days remaining
    graceDays: 14,
  };

  it("should generate, sign, and verify a valid active license", () => {
    const token = signLicense(validClaims, keys.privateKey);
    const result = verifyLicense(token, keys.publicKey, { now });

    expect(result.valid).toBe(true);
    expect(result.state).toBe("active");
    expect(result.daysRemaining).toBe(30);
    expect(result.claims?.name).toBe("Shiraz Hair & Scalp Clinic");
  });

  it("should fail verification with invalid/tampered signature", () => {
    const token = signLicense(validClaims, keys.privateKey);
    const tamperedToken = token.slice(0, -5) + "abcde";
    const result = verifyLicense(tamperedToken, keys.publicKey, { now });

    expect(result.valid).toBe(false);
    expect(result.state).toBe("invalid_signature");
  });

  it("should enter 14-day grace period when expired but within grace window", () => {
    const expiredClaims: LicenseClaims = {
      ...validClaims,
      expiresAt: now - 86400 * 5, // Expired 5 days ago
    };
    const token = signLicense(expiredClaims, keys.privateKey);
    const result = verifyLicense(token, keys.publicKey, { now });

    expect(result.valid).toBe(true);
    expect(result.state).toBe("grace_period");
    expect(result.daysRemaining).toBe(9); // 14 - 5 = 9 days remaining
  });

  it("should reject expired license past the grace period", () => {
    const severelyExpiredClaims: LicenseClaims = {
      ...validClaims,
      expiresAt: now - 86400 * 20, // Expired 20 days ago (past 14d grace)
    };
    const token = signLicense(severelyExpiredClaims, keys.privateKey);
    const result = verifyLicense(token, keys.publicKey, { now });

    expect(result.valid).toBe(false);
    expect(result.state).toBe("expired");
    expect(result.daysRemaining).toBe(0);
  });

  it("should detect backward system clock tampering", () => {
    const token = signLicense(validClaims, keys.privateKey);
    // User set system clock back by 30 days compared to last recorded execution
    const result = verifyLicense(token, keys.publicKey, {
      now: now - 86400 * 30,
      lastSeenClock: now,
    });

    expect(result.valid).toBe(false);
    expect(result.state).toBe("tampered");
    expect(result.error).toContain("clock manipulation");
  });
});
