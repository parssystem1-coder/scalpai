import { loadPhiKeyRing, phiKeyRotationStatus } from "@scalpai/db";
import { isProduction } from "./security.config.js";
import { logEvent } from "./logging.js";

/**
 * Boot gate for PHI key material (WEAKNESSES C2, ADR-0038).
 *
 * In production a missing key ring aborts startup: there is no plaintext
 * fallback, so booting without keys would mean every note write fails at the
 * database CHECK anyway — better to refuse loudly at boot than to serve a broken
 * clinical surface.
 *
 * Outside production the ring is optional so `npm run dev` and unit suites that
 * never touch a note still start; the moment a note IS written, phi-crypto
 * throws, and the CHECK constraint backs it up.
 */
export function assertPhiConfig(): void {
  if (!isProduction()) {
    try {
      const status = phiKeyRotationStatus();
      if (status.overdue) {
        logEvent("warn", { event: "phi.key_rotation_overdue", keyId: status.kid, count: status.ageDays });
      }
    } catch (err) {
      logEvent("warn", {
        event: "phi.key_ring_absent",
        message: `${(err as Error).message} — clinical notes cannot be written until a key ring is configured`,
      });
    }
    return;
  }

  // Throws when PHI_KEY_RING_FILE / PHI_KEY_RING is missing or malformed.
  loadPhiKeyRing();
  const status = phiKeyRotationStatus();
  if (status.overdue) {
    logEvent("warn", {
      event: "phi.key_rotation_overdue",
      keyId: status.kid,
      count: status.ageDays,
      reason: `active key is older than ${status.maxAgeDays} days — rotate it`,
    });
  }
}
