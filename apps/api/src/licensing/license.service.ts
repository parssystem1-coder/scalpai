import { Injectable } from "@nestjs/common";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { LicenseClaimsPublic, type LicenseStatusDto } from "@scalpai/shared";
import { resolveLicenseMaterial, type LicenseMaterial } from "./license.config.js";

/**
 * Self-hosted licence verification (phase 10 / M2, ADR-0043).
 *
 * What this replaces: the web app rendered "License Valid & Active (Ed25519
 * Verified)" from an object literal in the component. No signature was ever
 * checked, and an installation with no licence at all still showed a green tick
 * with a `professional` tier and 120 days remaining.
 *
 * What happens now: the API verifies a compact EdDSA JWS (the exact format
 * `@scalpai/licensing#signLicense` produces) against a configured Ed25519 public
 * key, and the browser renders the SERVER's verdict. `unlicensed` and
 * `invalid_signature` are first-class answers.
 *
 * Clock anti-tamper: the process keeps a high-water mark of the largest clock
 * value it has observed. A backwards jump of more than an hour inside one
 * process lifetime is reported as `tampered` instead of silently extending the
 * grace period. This is deliberately NOT persisted — a durable anchor belongs
 * with the audit anchors, and claiming more than the process can prove is how
 * this surface got into the docs unverified in the first place.
 */

const GRACE_DAYS_DEFAULT = 14;
const CLOCK_ROLLBACK_TOLERANCE_SEC = 3600;

@Injectable()
export class LicenseService {
  private highWaterMarkSec = 0;

  status(now: Date = new Date(), material: LicenseMaterial = resolveLicenseMaterial()): LicenseStatusDto {
    const checkedAt = now.toISOString();
    const nowSec = Math.floor(now.getTime() / 1000);

    if (!material.token || !material.publicKeyPem) {
      return {
        valid: false,
        state: "unlicensed",
        verified: false,
        checkedAt,
        reason: !material.token
          ? "هیچ لایسنسی برای این نصب تنطیم نشده است"
          : "کلید عمومی اعتبارسنجی لایسنس تنطیم نشده است",
      };
    }

    let keyFingerprint: string | undefined;
    let publicKey: ReturnType<typeof createPublicKey>;
    try {
      publicKey = createPublicKey(material.publicKeyPem);
      keyFingerprint = fingerprintOf(publicKey.export({ type: "spki", format: "der" }));
    } catch {
      return {
        valid: false,
        state: "invalid_signature",
        verified: false,
        checkedAt,
        reason: "کلید عمومی لایسنس قابل خواندن نیست",
      };
    }

    const parts = material.token.split(".");
    if (parts.length !== 3) {
      return { valid: false, state: "invalid_signature", verified: false, checkedAt, keyFingerprint, reason: "قالب توکن لایسنس معتبر نیست" };
    }

    const [header, payload, signature] = parts as [string, string, string];
    // M19: assigned on both paths below, so an initialiser here would be dead.
    let signatureOk: boolean;
    try {
      signatureOk = verifySignature(
        null,
        Buffer.from(`${header}.${payload}`),
        publicKey,
        Buffer.from(signature, "base64url"),
      );
    } catch {
      signatureOk = false;
    }
    if (!signatureOk) {
      return {
        valid: false,
        state: "invalid_signature",
        verified: true,
        checkedAt,
        keyFingerprint,
        reason: "امضای Ed25519 توکن لایسنس تأیید نشد",
      };
    }

    const parsed = LicenseClaimsPublic.safeParse(decodeJson(payload));
    if (!parsed.success) {
      return {
        valid: false,
        state: "invalid_signature",
        verified: true,
        checkedAt,
        keyFingerprint,
        reason: "محتوای توکن لایسنس با قرارداد پلتفرم هم‌خوان نیست",
      };
    }
    const claims = parsed.data;

    // Clock rollback check runs only AFTER the signature verified, so an
    // unsigned token can never influence the high-water mark.
    const rolledBack = this.highWaterMarkSec > 0 && nowSec < this.highWaterMarkSec - CLOCK_ROLLBACK_TOLERANCE_SEC;
    this.highWaterMarkSec = Math.max(this.highWaterMarkSec, nowSec);
    if (rolledBack) {
      return {
        valid: false,
        state: "tampered",
        claims,
        verified: true,
        checkedAt,
        keyFingerprint,
        reason: "ساعت سیستم عقب کشیده شده است",
      };
    }

    const graceSeconds = (claims.graceDays ?? GRACE_DAYS_DEFAULT) * 86_400;

    if (nowSec <= claims.expiresAt) {
      return {
        valid: true,
        state: "active",
        claims,
        daysRemaining: Math.max(0, Math.ceil((claims.expiresAt - nowSec) / 86_400)),
        verified: true,
        checkedAt,
        keyFingerprint,
      };
    }

    if (nowSec <= claims.expiresAt + graceSeconds) {
      return {
        valid: true,
        state: "grace_period",
        claims,
        daysRemaining: Math.max(0, Math.ceil((claims.expiresAt + graceSeconds - nowSec) / 86_400)),
        verified: true,
        checkedAt,
        keyFingerprint,
        reason: "دوره اعتبار لایسنس تمام شده و سیستم در دوره فرجه است",
      };
    }

    return {
      valid: false,
      state: "expired",
      claims,
      daysRemaining: 0,
      verified: true,
      checkedAt,
      keyFingerprint,
      reason: "لایسنس و دوره فرجه منقضی شده است",
    };
  }
}

function decodeJson(b64url: string): unknown {
  try {
    return JSON.parse(Buffer.from(b64url, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function fingerprintOf(der: Buffer): string {
  return createHash("sha256").update(der).digest("hex").slice(0, 32);
}
