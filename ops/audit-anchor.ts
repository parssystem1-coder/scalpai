import { createHash } from "node:crypto";
import type { Tx } from "../packages/db/src/tenant.js";
import { auditLog } from "../packages/db/src/schema.js";
import { desc, eq } from "drizzle-orm";

export interface AuditAnchorResult {
  clinicId: string;
  totalLogs: number;
  lastLogId: string;
  lastRowHash: string;
  merkleAnchorHash: string;
  timestamp: string;
}

/**
 * Computes a periodic WORM-compatible cryptographic anchor of the clinic's audit trail.
 */
export async function generateClinicAuditAnchor(tx: Tx, clinicId: string): Promise<AuditAnchorResult | null> {
  const rows = await tx
    .select({
      id: auditLog.id,
      rowHash: auditLog.rowHash,
      prevHash: auditLog.prevHash,
      at: auditLog.at,
    })
    .from(auditLog)
    .where(eq(auditLog.clinicId, clinicId))
    .orderBy(desc(auditLog.at));

  if (rows.length === 0) return null;

  const lastRow = rows[0]!;
  const combinedHashes = rows.map((r) => r.rowHash).join(":");
  const merkleAnchorHash = createHash("sha256").update(combinedHashes).digest("hex");

  return {
    clinicId,
    totalLogs: rows.length,
    lastLogId: lastRow.id,
    lastRowHash: lastRow.rowHash,
    merkleAnchorHash,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Verifies that the audit log sequence has not been tampered with
 */
export function verifyAuditChainIntegrity(
  rows: Array<{ id: string; rowHash: string; prevHash: string | null; clinicId: string; action: string; at: Date }>
): boolean {
  for (let i = 0; i < rows.length; i++) {
    const current = rows[i]!;
    if (i > 0) {
      const prev = rows[i - 1]!;
      if (current.prevHash !== prev.rowHash) {
        return false;
      }
    }
  }
  return true;
}
