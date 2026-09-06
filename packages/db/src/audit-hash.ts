import { createHash } from "node:crypto";
import { canonicalJson, canonicalTimestamp } from "@scalpai/shared";

/**
 * The ONE definition of an audit row's hash input (WEAKNESSES H17, ADR-0038).
 *
 * It used to live twice — once in `appendAudit`, once in `verifyChain` — as two
 * hand-rolled `JSON.stringify` calls. Two copies of a hash definition is one
 * copy too many: the writer and the verifier only agreed by luck, and
 * `verifyAuditChainIntegrity` didn't recompute anything at all, it just compared
 * `prevHash` links (so rewriting a row's CONTENT and its `row_hash` together
 * passed as untampered).
 *
 * Now: one canonical payload, one hash function, used by the writer, the
 * verifier and the Merkle anchor.
 */

export interface AuditRowInput {
  clinicId: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta?: unknown;
  at: Date | string | number;
}

/** Canonical, deterministic hash input. Key order and ms precision are pinned. */
export function canonicalAuditPayload(row: AuditRowInput): string {
  return canonicalJson({
    clinicId: row.clinicId,
    userId: row.userId,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    meta: row.meta ?? null,
    at: canonicalTimestamp(row.at),
  });
}

export function computeAuditRowHash(row: AuditRowInput, prevHash: string | null): string {
  return createHash("sha256").update(`${prevHash ?? ""}|${canonicalAuditPayload(row)}`).digest("hex");
}
