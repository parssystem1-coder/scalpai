import { SCHEMA_VERSION_CURRENT, SUPPORTED_SCHEMA_VERSIONS, policyFor, type EntityName, type Op } from "./contract.js";

export interface MutationEnvelope<P = Record<string, unknown>> {
  clientMutationId: string; // uuid — idempotency key end-to-end
  entity: EntityName;
  op: Op;
  schemaVersion: number;
  /** ISO timestamp from the ORIGINATING device clock (advisory only). */
  clientUpdatedAt: string;
  /** server `updatedAt` this mutation was based on — stale base ⇒ rejected */
  baseVersion?: string | null;
  payload: P;
}

export type PushItemStatus = "applied" | "duplicate" | "rejected";
export interface PushItemResult {
  clientMutationId: string;
  status: PushItemStatus;
  reason?: string;
}

export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Node fallback (tests)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeMutation(entity: EntityName, op: Op, payload: Record<string, unknown>, baseVersion?: string | null): MutationEnvelope {
  const schemaVersion = SCHEMA_VERSION_CURRENT;
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion as 1 | 2)) {
    throw new Error(`schemaVersion ${schemaVersion} outside supported window`);
  }
  void policyFor(entity); // validates entity name via exhaustive mapping
  return {
    clientMutationId: newMutationId(),
    entity,
    op,
    schemaVersion,
    clientUpdatedAt: new Date().toISOString(),
    baseVersion: baseVersion ?? null,
    payload,
  };
}

/** Older-than-window check — server side semantics, exposed for parity tests. */
export function isSchemaVersionSupported(v: number): boolean {
  return (SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(v);
}
