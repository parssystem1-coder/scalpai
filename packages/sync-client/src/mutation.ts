import {
  SCHEMA_VERSION_CURRENT,
  SUPPORTED_SCHEMA_VERSIONS,
  isEntityName,
  isOp,
  policyFor,
  type EntityName,
  type Op,
} from "./contract.js";

export interface MutationEnvelope<P = Record<string, unknown>> {
  clientMutationId: string; // uuid — idempotency key end-to-end
  entity: EntityName;
  op: Op;
  schemaVersion: number;
  /**
   * ISO timestamp from the ORIGINATING device clock. Phase 7 (H6): metadata
   * only. Nothing on the server orders, merges or rejects by this value.
   */
  clientUpdatedAt: string;
  /** Measured device clock offset — diagnostics, never an ordering input (H6). */
  clientClockOffsetMs?: number;
  /**
   * The server `row_version` this mutation was based on. REQUIRED for `update`:
   * without it the server cannot tell an intentional overwrite from a blind one.
   */
  baseVersion?: number | null;
  payload: P;
}

export type PushItemStatus = "applied" | "duplicate" | "rejected";

export interface PushItemResult {
  clientMutationId: string;
  status: PushItemStatus;
  reason?: string;
  /** Fields the server kept for itself because they changed after `baseVersion`. */
  conflicts?: string[];
  /** Row version after the write — the client's next `baseVersion`. */
  rowVersion?: number;
}

export class MutationContractError extends Error {
  constructor(message: string) {
    super(`sync-contract: ${message}`);
    this.name = "MutationContractError";
  }
}

/** A 4xx the server will refuse forever — retrying identical bytes cannot help. */
export class PermanentPushError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "PermanentPushError";
  }
}

export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Node fallback (tests)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeMutation(
  entity: EntityName,
  op: Op,
  payload: Record<string, unknown>,
  baseVersion: number | null = null,
  clientClockOffsetMs?: number,
): MutationEnvelope {
  const entityName: string = entity;
  const opName: string = op;
  if (!isEntityName(entityName)) throw new MutationContractError(`entity '${entityName}' is not part of the §8 contract`);
  if (!isOp(opName)) throw new MutationContractError(`op '${opName}' is not part of the §8 contract`);
  void policyFor(entity);

  const envelope: MutationEnvelope = {
    clientMutationId: newMutationId(),
    entity,
    op,
    schemaVersion: SCHEMA_VERSION_CURRENT,
    clientUpdatedAt: new Date().toISOString(),
    baseVersion: baseVersion ?? null,
    payload,
  };
  if (clientClockOffsetMs !== undefined) envelope.clientClockOffsetMs = Math.trunc(clientClockOffsetMs);
  assertEnvelope(envelope);
  return envelope;
}

/**
 * The same validation the server runs, exposed so a bad envelope is refused at
 * ENQUEUE time. Historically a forged entity (`"consents" as "patients"`) was
 * only caught by the API, which 400s the whole batch and wedged the outbox.
 */
export function assertEnvelope(envelope: MutationEnvelope): void {
  if (!isEntityName(envelope.entity)) throw new MutationContractError(`unknown entity '${String(envelope.entity)}'`);
  if (!isOp(envelope.op)) throw new MutationContractError(`unknown op '${String(envelope.op)}'`);
  if (!isSchemaVersionSupported(envelope.schemaVersion)) {
    throw new MutationContractError(`unsupported schemaVersion ${envelope.schemaVersion}`);
  }
  if (envelope.op === "update" && !isBaseVersion(envelope.baseVersion)) {
    throw new MutationContractError("an update needs the server baseVersion it was based on (H6)");
  }
}

export function isBaseVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

/** Older-than-window check — server side semantics, exposed for parity tests. */
export function isSchemaVersionSupported(v: number): boolean {
  return (SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(v);
}
