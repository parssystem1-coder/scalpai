/** Sync contract constants (DESIGN §8) — shared by client queue and server API. */
export const SCHEMA_VERSION_CURRENT = 1;

/**
 * WEAKNESSES H6: the window may only contain versions that EXIST. The previous
 * `[1, 2]` pre-accepted a contract nobody had written yet, so a device shipping
 * envelopes stamped `2` was applied under phase-1 rules without anyone noticing.
 */
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export type EntityName = "patients" | "treatment_plans" | "analyses";
export type Op = "create" | "update";

export const ENTITY_NAMES = ["patients", "treatment_plans", "analyses"] as const;
export const OPS = ["create", "update"] as const;

/**
 * §8 conflict policy, encoded:
 *  - analyses        : append-only (never merged — every push is a new row)
 *  - patients /
 *    treatment_plans : field-level merge against the server row_version counter
 */
export type ConflictPolicy = "append-only" | "field-lww";

export function isEntityName(value: unknown): value is EntityName {
  return typeof value === "string" && (ENTITY_NAMES as readonly string[]).includes(value);
}

export function isOp(value: unknown): value is Op {
  return typeof value === "string" && (OPS as readonly string[]).includes(value);
}

export function policyFor(entity: EntityName): ConflictPolicy {
  return entity === "analyses" ? "append-only" : "field-lww";
}

/* ── flush budget (WEAKNESSES C9) ────────────────────────────────────────── */

/** Mutations per push request. */
export const FLUSH_BATCH_SIZE = 20;
/** Hard bound on rounds per flush: `while (outbox.size > 0)` could never end. */
export const FLUSH_MAX_ROUNDS = 10;
/** Transport failures tolerated before an item is dead-lettered. */
export const OUTBOX_MAX_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_MS = 1_000;
export const RETRY_MAX_DELAY_MS = 300_000;

/** Exponential, deterministic and capped — 1s, 2s, 4s, 8s, 16s … 5min. */
export function retryDelayMs(attempts: number): number {
  const steps = Math.max(1, Math.trunc(attempts));
  return Math.min(RETRY_BASE_DELAY_MS * 2 ** (steps - 1), RETRY_MAX_DELAY_MS);
}

/* ── pull loop (WEAKNESSES H2) ───────────────────────────────────────────── */

export const PULL_PAGE_SIZE = 100;
export const PULL_INTERVAL_MS = 20_000;
/** Bound on pages drained per cycle, so a large backlog cannot block the UI. */
export const PULL_MAX_ROUNDS = 20;

/** Poll cadence, backing off while the transport keeps failing. */
export function pullBackoffMs(consecutiveFailures: number): number {
  const failures = Math.max(0, Math.trunc(consecutiveFailures));
  if (failures === 0) return PULL_INTERVAL_MS;
  return Math.min(PULL_INTERVAL_MS * 2 ** failures, RETRY_MAX_DELAY_MS);
}
