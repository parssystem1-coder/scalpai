import type { MutationEnvelope } from "./mutation.js";
import { policyFor } from "./contract.js";

export interface ServerRow {
  /** server-side updatedAt — the ONLY clock LWW trusts (DESIGN §8) */
  updatedAt: string;
  [field: string]: unknown;
}

export interface FieldPatch {
  [field: string]: unknown;
}

export type MergeOutcome =
  | { action: "apply"; fields: FieldPatch } // server accepts client patch
  | { action: "server-wins"; fields: FieldPatch } // conflicting fields stay server-owned
  | { action: "rejected-stale-base" }; // baseVersion mismatch → pull & re-apply

/**
 * Field-level LWW merge (§8) for patients / treatment_plans.
 * - stale base ⇒ rejected-stale-base (client must pull & retry)
 * - per field: newer clientUpdatedAt wins; ties/unknown ⇒ server keeps
 * The result NEVER loses a non-conflicting field from either side.
 */
export function mergeFieldLww(
  serverRow: ServerRow,
  mutation: MutationEnvelope<FieldPatch>,
): MergeOutcome {
  if (policyFor(mutation.entity) !== "field-lww") {
    throw new Error(`mergeFieldLww is not applicable to ${mutation.entity}`);
  }
  if (mutation.baseVersion && mutation.baseVersion !== serverRow.updatedAt) {
    return { action: "rejected-stale-base" };
  }

  const patch = mutation.payload;
  const fields: FieldPatch = { ...patch };
  const clientAt = Date.parse(mutation.clientUpdatedAt);
  const serverAt = Date.parse(serverRow.updatedAt);

  for (const key of Object.keys(patch)) {
    if (!(key in serverRow)) continue; // new field → client wins trivially
    if (!Number.isFinite(clientAt) || !Number.isFinite(serverAt) || serverAt >= clientAt) {
      delete fields[key]; // server copy is equal/newer → keep server value
    }
  }
  return { action: "apply", fields };
}

/** Outbox ordering: mutations first, then heavy media — encoded as priority. */
export function outboxPriority(m: MutationEnvelope): number {
  return m.entity === "analyses" ? 1 : 0;
}
