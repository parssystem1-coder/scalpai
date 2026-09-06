import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalJson, canonicalTimestamp } from "@scalpai/shared";

/**
 * Report authenticity (WEAKNESSES M9).
 *
 * The PDF/report surface used to print «اصالت» / "Ed25519 Verified" as static
 * decoration. Either the claim is backed by something a third party can check,
 * or it must not appear. This module provides the backing:
 *
 *   1. `contentSha256` — the digest of the exact bytes that were rendered.
 *   2. an Ed25519 signature over the CANONICAL seal payload (ADR-0038), so key
 *      order or timestamp precision cannot change the verdict.
 *   3. a QR/verify string that carries the seal id, digest and signature.
 *
 * `mayClaimAuthenticity()` is the only gate the UI is allowed to call. With no
 * key configured, it returns false and the label disappears — silence beats a
 * lie.
 */

export const REPORT_SEAL_VERSION = "rseal.v1";

export class ReportSealError extends Error {
  constructor(message: string) {
    super(`report-seal: ${message}`);
    this.name = "ReportSealError";
  }
}

export interface ReportSealSubject {
  clinicId: string;
  patientId: string;
  reportId: string;
  /** sha256 hex of the rendered document bytes. */
  contentSha256: string;
  issuedAt: Date | string;
  /** Present for analysis reports; proves WHICH model produced the numbers. */
  modelVersion?: string | null;
  /** Mandatory clinical disclaimer, carried inside the signed payload. */
  disclaimer?: string;
}

export interface ReportSeal {
  version: typeof REPORT_SEAL_VERSION;
  keyId: string;
  payload: Record<string, unknown>;
  signature: string;
  qr: string;
  verifyUrl: string | null;
}

/** Non-diagnostic label required on every analysis output (M9/H13). */
export const CLINICAL_DISCLAIMER_FA = "این گزارش کمکی و غیرتشخیصی است و جایگزین نظر متخصص نیست.";

const SHA256_HEX = /^[0-9a-f]{64}$/;

interface SealKeys {
  privateKeyPem: string | null;
  publicKeyPem: string | null;
  keyId: string | null;
}

function readMaybeFile(inlineVar: string, fileVar: string): string | null {
  const file = process.env[fileVar]?.trim();
  if (file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      throw new ReportSealError(`${fileVar} '${file}' could not be read`);
    }
  }
  const inline = process.env[inlineVar]?.trim();
  return inline ? inline.replace(/\\n/g, "\n") : null;
}

export function reportKeyId(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

let cachedKeys: SealKeys | null = null;

export function resolveSealKeys(): SealKeys {
  if (cachedKeys) return cachedKeys;
  const privateKeyPem = readMaybeFile("REPORT_SEAL_PRIVATE_KEY", "REPORT_SEAL_PRIVATE_KEY_FILE");
  let publicKeyPem = readMaybeFile("REPORT_SEAL_PUBLIC_KEY", "REPORT_SEAL_PUBLIC_KEY_FILE");
  if (!publicKeyPem && privateKeyPem) {
    publicKeyPem = createPublicKey(createPrivateKey(privateKeyPem))
      .export({ type: "spki", format: "pem" })
      .toString();
  }
  cachedKeys = {
    privateKeyPem,
    publicKeyPem,
    keyId: publicKeyPem ? reportKeyId(publicKeyPem) : null,
  };
  return cachedKeys;
}

export function resetSealKeyCache(): void {
  cachedKeys = null;
}

/** Bootstrap helper for ops — the private half never leaves the secret store. */
export function generateReportSealKeyPair(): { privateKey: string; publicKey: string; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  }) as unknown as { privateKey: string; publicKey: string };
  return { privateKey, publicKey, keyId: reportKeyId(publicKey) };
}

function sealPayload(subject: ReportSealSubject): Record<string, unknown> {
  if (!SHA256_HEX.test(subject.contentSha256)) {
    throw new ReportSealError("contentSha256 must be a lowercase sha256 hex digest of the rendered bytes");
  }
  return {
    v: REPORT_SEAL_VERSION,
    clinicId: subject.clinicId,
    patientId: subject.patientId,
    reportId: subject.reportId,
    contentSha256: subject.contentSha256,
    issuedAt: canonicalTimestamp(subject.issuedAt),
    modelVersion: subject.modelVersion ?? null,
    disclaimer: subject.disclaimer ?? CLINICAL_DISCLAIMER_FA,
  };
}

/** Sign a report. Throws when no key is configured — callers must fall back to "unsealed". */
export function sealReport(subject: ReportSealSubject): ReportSeal {
  const keys = resolveSealKeys();
  if (!keys.privateKeyPem || !keys.keyId) {
    throw new ReportSealError("no REPORT_SEAL private key configured — reports must ship without an authenticity claim");
  }
  const payload = sealPayload(subject);
  const signature = sign(null, Buffer.from(canonicalJson(payload), "utf8"), createPrivateKey(keys.privateKeyPem)).toString(
    "base64url",
  );
  const base = process.env.REPORT_SEAL_VERIFY_URL?.trim().replace(/\/$/, "") ?? null;
  const qr = [REPORT_SEAL_VERSION, keys.keyId, subject.reportId, subject.contentSha256, signature].join("|");
  return {
    version: REPORT_SEAL_VERSION,
    keyId: keys.keyId,
    payload,
    signature,
    qr,
    verifyUrl: base ? `${base}?id=${encodeURIComponent(subject.reportId)}&sig=${signature}` : null,
  };
}

/** Try to seal; return null instead of throwing so a render path can degrade. */
export function trySealReport(subject: ReportSealSubject): ReportSeal | null {
  try {
    return sealReport(subject);
  } catch {
    return null;
  }
}

export function verifyReportSeal(seal: ReportSeal | null, publicKeyPem?: string): boolean {
  if (!seal || seal.version !== REPORT_SEAL_VERSION) return false;
  const pem = publicKeyPem ?? resolveSealKeys().publicKeyPem;
  if (!pem) return false;
  try {
    if (reportKeyId(pem) !== seal.keyId) return false;
    return verify(
      null,
      Buffer.from(canonicalJson(seal.payload), "utf8"),
      createPublicKey(pem),
      Buffer.from(seal.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

/**
 * The ONLY authorization for printing an authenticity claim: the seal verifies
 * AND its digest matches the bytes actually rendered.
 */
export function mayClaimAuthenticity(
  seal: ReportSeal | null,
  renderedSha256?: string,
  publicKeyPem?: string,
): boolean {
  if (!verifyReportSeal(seal, publicKeyPem)) return false;
  if (!renderedSha256) return true;
  return seal!.payload.contentSha256 === renderedSha256;
}
