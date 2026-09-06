/** Sync contract constants (DESIGN §8) — shared by client queue and server API. */
export const SCHEMA_VERSION_CURRENT = 1;
/** Server accepts the two most recent contract versions; older → upgrade hint. */
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2] as const;

export type EntityName = "patients" | "treatment_plans" | "analyses";
export type Op = "create" | "update";

/**
 * §8 conflict policy, encoded:
 *  - analyses        : append-only (never merged — every push is a new row)
 *  - patients /
 *    treatment_plans : field-level LWW against the server row's updated_at,
 *                    with baseVersion check (409-style rejection on stale base)
 */
export type ConflictPolicy = "append-only" | "field-lww";

export function policyFor(entity: EntityName): ConflictPolicy {
  return entity === "analyses" ? "append-only" : "field-lww";
}
