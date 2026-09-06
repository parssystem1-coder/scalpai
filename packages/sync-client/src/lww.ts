import { policyFor } from "./contract.js";
import { isBaseVersion, type MutationEnvelope } from "./mutation.js";

/**
 * Field-level merge for patients / treatment_plans (§8).
 *
 * WEAKNESSES H6: the previous implementation compared `clientUpdatedAt` with the
 * server's `updated_at`. That made data loss a function of device clocks — a
 * phone an hour ahead won every conflict, and a phone an hour behind silently
 * lost every edit it made.
 *
 * The only ordering input now is a SERVER counter:
 *  - `row_version`    — bumped by a database trigger on every update
 *  - `field_versions` — per field, the row_version at which the server last
 *                       changed that field
 *
 * A field applies when the server has not touched it since the client's base
 * version. Anything else stays server-owned and is REPORTED as a conflict, so
 * neither side's field is lost and the client can re-apply on a fresh base.
 */
export interface ServerRow {
  rowVersion: number;
  fieldVersions: Record<string, number>;
}

export interface FieldPatch {
  [field: string]: unknown;
}

export type MergeRejection = "missing-base-version" | "unknown-base-version";

export type MergeOutcome =
  | { action: "apply"; fields: FieldPatch; conflicts: string[] }
  | { action: "rejected"; reason: MergeRejection };

export function mergeFieldLww(serverRow: ServerRow, mutation: MutationEnvelope<FieldPatch>): MergeOutcome {
  if (policyFor(mutation.entity) !== "field-lww") {
    throw new Error(`mergeFieldLww is not applicable to ${mutation.entity}`);
  }
  const base = mutation.baseVersion;
  if (!isBaseVersion(base)) return { action: "rejected", reason: "missing-base-version" };
  // A base the server never issued means the client invented a version.
  if (base > serverRow.rowVersion) return { action: "rejected", reason: "unknown-base-version" };

  const fields: FieldPatch = {};
  const conflicts: string[] = [];
  for (const [key, value] of Object.entries(mutation.payload)) {
    const fieldVersion = serverRow.fieldVersions[key] ?? 0;
    if (fieldVersion > base) {
      conflicts.push(key);
      continue;
    }
    fields[key] = value;
  }
  conflicts.sort();
  return { action: "apply", fields, conflicts };
}

/** Outbox ordering: mutations first, then heavy media — encoded as priority. */
export function outboxPriority(m: MutationEnvelope): number {
  return m.entity === "analyses" ? 1 : 0;
}
