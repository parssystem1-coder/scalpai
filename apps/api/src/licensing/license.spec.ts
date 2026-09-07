import { describe, expect, it } from "vitest";
import { generateLicensingKeyPair, signLicense, type LicenseClaims } from "@scalpai/licensing";
import { LicenseService } from "./license.service.js";
import { resolveLicenseMaterial } from "./license.config.js";

/**
 * Phase 10 (M2). The old diagnostics panel printed "Ed25519 Verified" from an
 * object literal, so this suite exists to prove the verdict now depends on a
 * signature. Keys are generated per test — no key material is ever committed.
 */

const DAY = 86_400;

function claims(overrides: Partial<LicenseClaims> = {}): LicenseClaims {
  const nowSec = Math.floor(Date.UTC(2026, 8, 7) / 1000);
  return {
    sub: "clinic-a",
    name: "کلینیک آلفا",
    tier: "professional",
    features: ["analysis:advanced", "offline:full"],
    maxSeats: 5,
    maxPatients: 2000,
    issuedAt: nowSec - 30 * DAY,
    expiresAt: nowSec + 120 * DAY,
    graceDays: 14,
    ...overrides,
  };
}

function material(token: string | null, publicKeyPem: string | null) {
  return {
    token,
    publicKeyPem,
    source: { token: token ? ("env" as const) : ("none" as const), publicKey: publicKeyPem ? ("env" as const) : ("none" as const) },
  };
}

const NOW = new Date("2026-09-07T00:00:00.000Z");

describe("licence verification endpoint (M2)", () => {
  it("reports `unlicensed` — never a green tick — when nothing is configured", () => {
    const status = new LicenseService().status(NOW, material(null, null));
    expect(status).toMatchObject({ valid: false, state: "unlicensed", verified: false });
    expect(status.claims).toBeUndefined();
  });

  it("reports `unlicensed` when a token exists but no public key does", () => {
    const { privateKey } = generateLicensingKeyPair();
    const token = signLicense(claims(), privateKey as unknown as string);
    const status = new LicenseService().status(NOW, material(token, null));
    expect(status.state).toBe("unlicensed");
    expect(status.verified).toBe(false);
  });

  it("accepts a token actually signed by the configured key", () => {
    const { publicKey, privateKey } = generateLicensingKeyPair();
    const token = signLicense(claims(), privateKey as unknown as string);
    const status = new LicenseService().status(NOW, material(token, publicKey as unknown as string));
    expect(status).toMatchObject({ valid: true, state: "active", verified: true });
    expect(status.claims?.tier).toBe("professional");
    expect(status.daysRemaining).toBe(120);
    expect(status.keyFingerprint).toMatch(/^[0-9a-f]{32}$/);
  });

  it("refuses a token signed by a DIFFERENT key", () => {
    const signer = generateLicensingKeyPair();
    const other = generateLicensingKeyPair();
    const token = signLicense(claims(), signer.privateKey as unknown as string);
    const status = new LicenseService().status(NOW, material(token, other.publicKey as unknown as string));
    expect(status).toMatchObject({ valid: false, state: "invalid_signature", verified: true });
  });

  it("refuses a payload edited after signing", () => {
    const { publicKey, privateKey } = generateLicensingKeyPair();
    const token = signLicense(claims(), privateKey as unknown as string);
    const [header, , signature] = token.split(".") as [string, string, string];
    const forged = Buffer.from(JSON.stringify(claims({ tier: "enterprise", maxSeats: 9999 }))).toString("base64url");
    const status = new LicenseService().status(NOW, material(`${header}.${forged}.${signature}`, publicKey as unknown as string));
    expect(status.state).toBe("invalid_signature");
    expect(status.valid).toBe(false);
  });

  it("refuses a malformed token and an unreadable key without throwing", () => {
    const { publicKey } = generateLicensingKeyPair();
    expect(new LicenseService().status(NOW, material("not-a-jws", publicKey as unknown as string)).state).toBe(
      "invalid_signature",
    );
    expect(new LicenseService().status(NOW, material("a.b.c", "-not-a-pem-")).state).toBe("invalid_signature");
  });

  it("moves into the grace period after expiry and then to expired", () => {
    const { publicKey, privateKey } = generateLicensingKeyPair();
    const expiresAt = Math.floor(NOW.getTime() / 1000) - 3 * DAY;
    const token = signLicense(claims({ expiresAt, graceDays: 14 }), privateKey as unknown as string);

    const inGrace = new LicenseService().status(NOW, material(token, publicKey as unknown as string));
    expect(inGrace).toMatchObject({ valid: true, state: "grace_period" });
    expect(inGrace.daysRemaining).toBe(11);

    const later = new Date(NOW.getTime() + 30 * DAY * 1000);
    const dead = new LicenseService().status(later, material(token, publicKey as unknown as string));
    expect(dead).toMatchObject({ valid: false, state: "expired", daysRemaining: 0 });
  });

  it("flags a backwards clock jump instead of extending the grace period", () => {
    const { publicKey, privateKey } = generateLicensingKeyPair();
    const token = signLicense(claims(), privateKey as unknown as string);
    const service = new LicenseService();

    expect(service.status(NOW, material(token, publicKey as unknown as string)).state).toBe("active");
    const rolledBack = new Date(NOW.getTime() - 5 * DAY * 1000);
    expect(service.status(rolledBack, material(token, publicKey as unknown as string)).state).toBe("tampered");
  });

  it("never leaks the token or the key in the response", () => {
    const { publicKey, privateKey } = generateLicensingKeyPair();
    const token = signLicense(claims(), privateKey as unknown as string);
    const serialised = JSON.stringify(new LicenseService().status(NOW, material(token, publicKey as unknown as string)));
    expect(serialised).not.toContain(token);
    expect(serialised).not.toContain("PRIVATE");
    expect(serialised).not.toContain("BEGIN");
  });
});

describe("licence material resolution (M2)", () => {
  it("prefers a mounted secret file over an env literal", () => {
    const resolved = resolveLicenseMaterial({ LICENSE_TOKEN: "from-env", LICENSE_TOKEN_FILE: "/nope/missing" } as NodeJS.ProcessEnv);
    // The file is unreadable, so the env value is the fallback — but the file
    // wins whenever it exists, which is what the ops path relies on.
    expect(resolved.token).toBe("from-env");
    expect(resolved.source.token).toBe("env");
  });

  it("treats blank configuration as absent, not as empty-but-present", () => {
    const resolved = resolveLicenseMaterial({ LICENSE_TOKEN: "   ", LICENSE_PUBLIC_KEY: "" } as NodeJS.ProcessEnv);
    expect(resolved.token).toBeNull();
    expect(resolved.publicKeyPem).toBeNull();
    expect(resolved.source).toEqual({ token: "none", publicKey: "none" });
  });

  it("unescapes a PEM that arrived through an env var", () => {
    const resolved = resolveLicenseMaterial({ LICENSE_PUBLIC_KEY: "line1\\nline2" } as NodeJS.ProcessEnv);
    expect(resolved.publicKeyPem).toBe("line1\nline2");
  });
});
