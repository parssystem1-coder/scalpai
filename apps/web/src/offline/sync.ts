import {
  CURSOR_ZERO,
  PULL_MAX_ROUNDS,
  PULL_PAGE_SIZE,
  type MutationEnvelope,
  type OutboxItem,
  type OutboxStore,
} from "@scalpai/sync-client";
import { redactPhiPayload } from "@scalpai/shared";
import {
  getOfflineDb,
  type DeadLetterRecord,
  type OfflineDb,
  type OfflineScope,
  type OutboxRecord,
} from "./db.js";

const PULL_CURSOR_KEY = "pull-cursor";

/* ── record mapping ─────────────────────────────────────────────────── */

export function toRecord(item: OutboxItem, scope: OfflineScope, createdAt?: number): OutboxRecord {
  const envelope = item.envelope;
  return {
    id: envelope.clientMutationId,
    entity: envelope.entity,
    op: envelope.op,
    schemaVersion: envelope.schemaVersion,
    clientUpdatedAt: envelope.clientUpdatedAt,
    baseVersion: envelope.baseVersion ?? null,
    // IndexedDB is not a secret store: keep the same redacted delta that the
    // server ledger will receive. Ciphertext survives; readable notes do not.
    payload: JSON.stringify(redactPhiPayload(envelope.payload)),
    createdAt: createdAt ?? Date.now(),
    attempts: item.attempts,
    nextAttemptAt: item.nextAttemptAt,
    lastError: item.lastError,
    clinicId: scope.clinicId,
    userId: scope.userId,
  };
}

export function toItem(record: OutboxRecord): OutboxItem {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(record.payload);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as Record<string, unknown>;
    }
  } catch {
    payload = {};
  }
  return {
    envelope: {
      clientMutationId: record.id,
      entity: record.entity as MutationEnvelope["entity"],
      op: record.op as MutationEnvelope["op"],
      schemaVersion: record.schemaVersion,
      clientUpdatedAt: record.clientUpdatedAt,
      baseVersion: record.baseVersion,
      payload,
    },
    attempts: record.attempts ?? 0,
    nextAttemptAt: record.nextAttemptAt ?? 0,
    lastError: record.lastError ?? null,
  };
}

/* ── outbox persistence (WEAKNESSES C9) ──────────────────────────────────── */

/**
 * The old adapter rewrote the WHOLE queue on every change with
 * `clear() + bulkAdd()`. A crash inside that window lost every pending
 * mutation. Each method here touches one record inside one Dexie transaction.
 */
export function createDexieOutboxStore(db: OfflineDb, scope: OfflineScope): OutboxStore {
  return {
    async put(item: OutboxItem): Promise<void> {
      await db.transaction("rw", db.outbox, async () => {
        const existing = await db.outbox.get(item.envelope.clientMutationId);
        await db.outbox.put(toRecord(item, scope, existing?.createdAt));
      });
    },
    async remove(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db.outbox.bulkDelete(ids);
    },
    async deadLetter(item: OutboxItem, reason: string): Promise<void> {
      const record = toRecord(item, scope);
      await db.transaction("rw", db.outbox, db.deadLetter, async () => {
        await db.deadLetter.put({
          id: record.id,
          entity: record.entity,
          op: record.op,
          payload: record.payload,
          reason: reason.slice(0, 500),
          attempts: record.attempts,
          failedAt: Date.now(),
          clinicId: record.clinicId,
          userId: record.userId,
        });
        await db.outbox.delete(record.id);
      });
    },
  };
}

/**
 * Rehydrate the queue for THIS principal. The scope filter is belt and braces:
 * the database is already per (clinic, user), but a mutation must never be
 * pushed with another clinic's token (WEAKNESSES M6).
 */
export async function loadOutboxItems(db: OfflineDb, scope: OfflineScope): Promise<OutboxItem[]> {
  const records = await db.outbox.orderBy("createdAt").toArray();
  return records
    .filter((r) => r.clinicId === scope.clinicId && r.userId === scope.userId)
    .map(toItem);
}

/** Records that do NOT belong to the active principal — they are never pushed. */
export async function purgeForeignOutbox(db: OfflineDb, scope: OfflineScope): Promise<number> {
  const records = await db.outbox.toArray();
  const foreign = records.filter((r) => r.clinicId !== scope.clinicId || r.userId !== scope.userId);
  if (foreign.length > 0) await db.outbox.bulkDelete(foreign.map((r) => r.id));
  return foreign.length;
}

/* ── durable pull cursor (WEAKNESSES H2/H5) ──────────────────────────────── */

export interface CursorStore {
  read(): Promise<string>;
  write(cursor: string): Promise<void>;
}

export function createDexieCursorStore(db: OfflineDb): CursorStore {
  return {
    async read(): Promise<string> {
      const row = await db.syncState.get(PULL_CURSOR_KEY);
      return row?.cursor ?? CURSOR_ZERO;
    },
    async write(cursor: string): Promise<void> {
      await db.syncState.put({ key: PULL_CURSOR_KEY, cursor, updatedAt: Date.now() });
    },
  };
}

export interface PullPageItem {
  entity: string;
  op: string;
  serverSeq: number;
  cursor: string;
}

export interface PullPage {
  items: PullPageItem[];
  cursor: string;
  hasMore: boolean;
}

export interface PullResult {
  received: number;
  entities: string[];
  cursor: string;
  rounds: number;
}

/**
 * Drain `sync/pull` in BOUNDED rounds, persisting the cursor as we go.
 *
 * Order matters: `onPage` runs BEFORE the cursor advances, so a page that could
 * not be applied is fetched again on the next cycle instead of being skipped.
 */
export async function drainPull(
  cursors: CursorStore,
  fetchPage: (cursor: string, limit: number) => Promise<PullPage>,
  opts: { limit?: number; maxRounds?: number; onPage?: (page: PullPage) => Promise<void> | void } = {},
): Promise<PullResult> {
  const limit = opts.limit ?? PULL_PAGE_SIZE;
  const maxRounds = opts.maxRounds ?? PULL_MAX_ROUNDS;
  let cursor = await cursors.read();
  const entities = new Set<string>();
  let received = 0;
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    const page = await fetchPage(cursor, limit);
    rounds += 1;
    received += page.items.length;
    for (const item of page.items) entities.add(item.entity);
    if (page.items.length > 0) await opts.onPage?.(page);
    if (page.cursor && page.cursor !== cursor) {
      cursor = page.cursor;
      await cursors.write(cursor);
    }
    if (!page.hasMore || page.items.length === 0) break;
  }

  return { received, entities: [...entities], cursor, rounds };
}

/* ── inspector helpers ─────────────────────────────────────────────── */

/** Outbox contents for the UI. Empty (never throwing) when nobody is signed in. */
export async function listOutbox(): Promise<OutboxRecord[]> {
  const db = getOfflineDb();
  if (!db) return [];
  try {
    return await db.outbox.orderBy("createdAt").toArray();
  } catch {
    return [];
  }
}

export async function listDeadLetters(): Promise<DeadLetterRecord[]> {
  const db = getOfflineDb();
  if (!db) return [];
  try {
    return await db.deadLetter.orderBy("failedAt").toArray();
  } catch {
    return [];
  }
}

export async function countDeadLetters(): Promise<number> {
  const db = getOfflineDb();
  if (!db) return 0;
  try {
    return await db.deadLetter.count();
  } catch {
    return 0;
  }
}
