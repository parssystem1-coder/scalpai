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

/**
 * A 4xx the server will refuse forever — retrying identical bytes cannot help.
 *
 * Phase 7.1 (ADR-0040): a refusal now says WHO it is about. `itemIds` carries the
 * mutations the server actually named; an empty list means the server blamed the
 * REQUEST, which is not evidence against any single queued item. The old class
 * could not express that difference, so `flushOutbox` assumed the worst and
 * dead-lettered the entire batch on every 400.
 */
export class PermanentPushError extends Error {
  /** Mutations the server named. Empty = the request as a whole was refused. */
  readonly itemIds: string[];
  /** The API error code, when the transport could read one (`VALIDATION_ERROR`…). */
  readonly code: string | null;

  constructor(
    message: string,
    public status = 400,
    options: { itemIds?: readonly string[]; code?: string | null } = {},
  ) {
    super(message);
    this.name = "PermanentPushError";
    this.itemIds = [...(options.itemIds ?? [])];
    this.code = options.code ?? null;
  }

  /** True when no single mutation can be blamed for this refusal. */
  get isBatchScoped(): boolean {
    return this.itemIds.length === 0;
  }
}

/** RFC-4122 shape — the idempotency key the server can answer per item with. */
const MUTATION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMutationId(value: unknown): value is string {
  return typeof value === "string" && MUTATION_ID_RE.test(value);
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
 *
 * Phase 7.1: `flushOutbox` runs this again on the way OUT, because a queue can
 * gain a bad record without ever passing through `enqueue` — a hand-restored
 * backup, a downgraded build, a schema window that moved under a device that was
 * offline for a week.
 */
export function assertEnvelope(envelope: MutationEnvelope): void {
  if (!isMutationId(envelope.clientMutationId)) {
    throw new MutationContractError("clientMutationId must be a uuid — the server cannot answer per item without it");
  }
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
