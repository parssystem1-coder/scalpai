import Dexie, { type EntityTable } from "dexie";

/**
 * Local-first store (ADR-0027) — phase 7 rework (ADR-0039), phase 8 uploads
 * (ADR-0041).
 *
 * WEAKNESSES H8: there used to be ONE database called `scalpai-offline`. On a
 * shared clinic workstation that meant clinic A's queued mutations were still
 * sitting in IndexedDB when clinic B logged in, and a logout left PHI behind.
 * The database is now named after the (clinic, user) pair, and logout deletes it.
 */
export interface OutboxRecord {
  id: string; // clientMutationId — primary key for dedup
  entity: string;
  op: string;
  schemaVersion: number;
  clientUpdatedAt: string;
  /** server row_version the edit was based on (H6) */
  baseVersion: number | null;
  payload: string; // JSON-serialized, PHI-redacted
  createdAt: number; // FIFO ordering
  attempts: number;
  nextAttemptAt: number; // epoch ms — backoff gate (C9)
  lastError: string | null;
  clinicId: string;
  userId: string;
}

/** A mutation the server refused, or that ran out of attempts (C9). */
export interface DeadLetterRecord {
  id: string;
  entity: string;
  op: string;
  payload: string;
  reason: string;
  attempts: number;
  failedAt: number;
  clinicId: string;
  userId: string;
}

/** Durable sync bookkeeping — today: the pull cursor (H2/H5). */
export interface SyncStateRecord {
  key: string;
  cursor: string;
  updatedAt: number;
}

/**
 * An upload in flight (phase 8 / H7).
 *
 * This used to live in `localStorage` under one shared key: it survived a logout,
 * it was readable by the next person at the terminal, and it was the ONLY record
 * of a multipart upload — so clearing site data silently orphaned parts in the
 * bucket. It is now a row in the scoped offline database, and it is a POINTER:
 * the authoritative part geometry belongs to the server's `upload_sessions` row,
 * and which parts exist is answered by the bucket.
 */
export interface PendingUpload {
  /** Gallery item id — stable across a resume, so it is the primary key. */
  key: string;
  sessionId: string;
  patientId: string;
  fileName: string;
  fileSize: number;
  mime: string;
  partSizeBytes: number;
  totalParts: number;
  multipart: boolean;
  /** ETags this device saw acknowledged. The server re-verifies every one. */
  partEtags: Record<number, string>;
  createdAt: number;
  updatedAt: number;
}

export interface OfflineScope {
  clinicId: string;
  userId: string;
}

export type OfflineDb = Dexie & {
  outbox: EntityTable<OutboxRecord, "id">;
  deadLetter: EntityTable<DeadLetterRecord, "id">;
  syncState: EntityTable<SyncStateRecord, "key">;
  pendingUploads: EntityTable<PendingUpload, "key">;
};

const DB_PREFIX = "scalpai-offline";

/** The pre-phase-7 shared database. It has no owner, so it is never kept. */
export const LEGACY_DB_NAME = "scalpai-offline";

/** The pre-phase-8 localStorage key for uploads — removed, never migrated. */
export const LEGACY_UPLOAD_STORAGE_KEY = "scalpai-chunked-uploads";

function sanitize(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return cleaned.length > 0 ? cleaned : "unknown";
}

export function offlineDbName(scope: OfflineScope): string {
  return `${DB_PREFIX}-${sanitize(scope.clinicId)}-${sanitize(scope.userId)}`;
}

export function sameScope(a: OfflineScope | null, b: OfflineScope | null): boolean {
  if (!a || !b) return false;
  return a.clinicId === b.clinicId && a.userId === b.userId;
}

function openScoped(scope: OfflineScope): OfflineDb {
  const db = new Dexie(offlineDbName(scope)) as OfflineDb;
  db.version(1).stores({
    outbox: "id, createdAt, nextAttemptAt",
    deadLetter: "id, failedAt",
    syncState: "key",
    pendingUploads: "key, createdAt",
  });
  // v2: pendingUploads carries the server session id and is looked up per
  // patient. The old rows had no sessionId, so there is nothing to resume from —
  // they are dropped rather than half-migrated into something that cannot work.
  db.version(2)
    .stores({
      outbox: "id, createdAt, nextAttemptAt",
      deadLetter: "id, failedAt",
      syncState: "key",
      pendingUploads: "key, createdAt, patientId",
    })
    .upgrade(async (tx) => {
      await tx.table("pendingUploads").clear();
    });
  return db;
}

let active: { scope: OfflineScope; db: OfflineDb } | null = null;

/** Open (or reuse) the database that belongs to this principal. */
export function setOfflineScope(scope: OfflineScope): OfflineDb {
  if (active && sameScope(active.scope, scope)) return active.db;
  if (active) {
    try {
      active.db.close();
    } catch {
      // a database that refuses to close is still leaving our reference
    }
  }
  active = { scope, db: openScoped(scope) };
  return active.db;
}

export function activeOfflineScope(): OfflineScope | null {
  return active?.scope ?? null;
}

/** `null` when nobody is signed in — callers must handle it, never guess a scope. */
export function getOfflineDb(): OfflineDb | null {
  return active?.db ?? null;
}

/**
 * Close the scoped database. With `wipe`, DELETE it: after a logout the clinical
 * data of that session must not be readable by the next person at the terminal.
 */
export async function closeOfflineScope(options: { wipe?: boolean } = {}): Promise<void> {
  const current = active;
  active = null;
  if (!current) return;
  const name = current.db.name;
  try {
    current.db.close();
  } catch {
    // ignore
  }
  if (!options.wipe) return;
  try {
    await Dexie.delete(name);
  } catch {
    // IndexedDB may be unavailable (private mode, SSR) — nothing to wipe then
  }
}

/** H8: remove the unscoped legacy database wherever we find it. */
export async function purgeLegacyOfflineDb(): Promise<void> {
  try {
    await Dexie.delete(LEGACY_DB_NAME);
  } catch {
    // ignore
  }
  // Phase 8: and the unscoped localStorage upload state it used to sit next to.
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(LEGACY_UPLOAD_STORAGE_KEY);
  } catch {
    // storage may be unavailable
  }
}
