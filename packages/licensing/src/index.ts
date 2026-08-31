import * as crypto from "node:crypto";

export interface LicenseClaims {
  sub: string; // tenant / clinic ID
  name: string; // clinic name
  tier: "standard" | "professional" | "enterprise";
  features: string[]; // e.g. ["analysis:advanced", "offline:full", "white_label"]
  maxSeats: number;
  maxPatients: number;
  issuedAt: number; // Unix timestamp in seconds
  expiresAt: number; // Unix timestamp in seconds
  graceDays?: number; // default 14 days
}

export interface LicenseValidationResult {
  valid: boolean;
  state: "active" | "grace_period" | "expired" | "tampered" | "invalid_signature";
  claims?: LicenseClaims;
  daysRemaining?: number;
  error?: string;
}

/**
 * Generate an Ed25519 keypair for licensing
 */
export function generateLicensingKeyPair() {
  return crypto.generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

/**
 * Signs license claims using an Ed25519 private key (PEM)
 */
export function signLicense(claims: LicenseClaims, privateKeyPem: string): string {
  const header = { alg: "EdDSA", typ: "JWT" };
  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const dataToSign = `${b64Header}.${b64Payload}`;

  const signature = crypto.sign(null, Buffer.from(dataToSign), privateKeyPem);
  const b64Signature = signature.toString("base64url");

  return `${dataToSign}.${b64Signature}`;
}

/**
 * Verifies a license token against an Ed25519 public key (PEM)
 * with Clock Tampering detection and 14-day Grace Period support.
 */
export function verifyLicense(
  token: string,
  publicKeyPem: string,
  options?: {
    lastSeenClock?: number; // Unix timestamp in seconds recorded from last legitimate run
    now?: number; // current Unix timestamp in seconds
  }
): LicenseValidationResult {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, state: "invalid_signature", error: "Malformed license token" };
    }

    const [b64Header, b64Payload, b64Signature] = parts;
    const dataToVerify = `${b64Header}.${b64Payload}`;
    const signature = Buffer.from(b64Signature, "base64url");

    const isVerified = crypto.verify(null, Buffer.from(dataToVerify), publicKeyPem, signature);
    if (!isVerified) {
      return { valid: false, state: "invalid_signature", error: "Signature verification failed" };
    }

    const payloadJson = Buffer.from(b64Payload, "base64url").toString("utf-8");
    const claims: LicenseClaims = JSON.parse(payloadJson);

    const now = options?.now ?? Math.floor(Date.now() / 1000);
    const lastSeenClock = options?.lastSeenClock ?? 0;

    // Clock Anti-Tamper Check: If current time is backward compared to last recorded time
    if (lastSeenClock > 0 && now < lastSeenClock - 3600) {
      return {
        valid: false,
        state: "tampered",
        claims,
        error: "System clock manipulation detected (clock set backward)",
      };
    }

    const graceDays = claims.graceDays ?? 14;
    const graceSeconds = graceDays * 86400;
    const expirationWithGrace = claims.expiresAt + graceSeconds;

    if (now <= claims.expiresAt) {
      const daysRemaining = Math.max(0, Math.ceil((claims.expiresAt - now) / 86400));
      return {
        valid: true,
        state: "active",
        claims,
        daysRemaining,
      };
    }

    if (now <= expirationWithGrace) {
      const daysRemainingInGrace = Math.max(0, Math.ceil((expirationWithGrace - now) / 86400));
      return {
        valid: true,
        state: "grace_period",
        claims,
        daysRemaining: daysRemainingInGrace,
        error: `License expired on ${new Date(claims.expiresAt * 1000).toISOString().split("T")[0]}. Grace period active (${daysRemainingInGrace} days remaining).`,
      };
    }

    return {
      valid: false,
      state: "expired",
      claims,
      daysRemaining: 0,
      error: "License and grace period expired. System operating in read-only mode.",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { valid: false, state: "invalid_signature", error: `Verification error: ${message}` };
  }
}
