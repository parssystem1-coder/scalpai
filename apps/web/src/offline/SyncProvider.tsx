import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Outbox,
  PermanentPushError,
  flushOutbox,
  pullBackoffMs,
  type MutationEnvelope,
  type PushItemResult,
} from "@scalpai/sync-client";
import { ApiError, apiFetch } from "../api/client.js";
import { useAuth } from "../context/AuthContext.js";
import { closeOfflineScope, purgeLegacyOfflineDb, setOfflineScope, type OfflineScope } from "./db.js";
import {
  countDeadLetters,
  createDexieCursorStore,
  createDexieOutboxStore,
  drainPull,
  loadOutboxItems,
  purgeForeignOutbox,
  type CursorStore,
  type PullPage,
} from "./sync.js";

interface SyncCtx {
  isOnline: boolean;
  pendingCount: number;
  /** Mutations the server refused, or that ran out of attempts (C9). */
  deadLetterCount: number;
  lastPullAt: number | null;
  enqueue: (
    entity: MutationEnvelope["entity"],
    op: MutationEnvelope["op"],
    payload: Record<string, unknown>,
    baseVersion?: number | null,
  ) => Promise<MutationEnvelope>;
  flush: () => Promise<number>;
  syncNow: () => Promise<void>;
}

const Ctx = createContext<SyncCtx>({
  isOnline: true,
  pendingCount: 0,
  deadLetterCount: 0,
  lastPullAt: null,
  enqueue: async () => {
    throw new Error("sync not ready");
  },
  flush: async () => 0,
  syncNow: async () => {},
});

export function useSync() {
  return useContext(Ctx);
}

/** Which react-query cache a pulled entity invalidates. */
const QUERY_KEY_BY_ENTITY: Record<string, string> = {
  patients: "patients",
  treatment_plans: "treatment-plans",
  analyses: "analyses",
};

/**
 * Offline sync boundary (ADR-0039).
 *
 * Phase 7 closes four holes at once:
 *  - H2 the client PULLS: a durable cursor, a cycle on mount, on `online`, on tab
 *    focus and on a polling timer that backs off while the transport is failing;
 *  - M6 the queue belongs to the signed-in principal — a mutation is never pushed
 *    with another clinic's token;
 *  - C9 flush is bounded and rejected items are dead-lettered instead of looping;
 *  - H8 the store is per (clinic, user) and is wiped on logout.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== "undefined" ? navigator.onLine : true));
  const [pendingCount, setPendingCount] = useState(0);
  const [deadLetterCount, setDeadLetterCount] = useState(0);
  const [lastPullAt, setLastPullAt] = useState<number | null>(null);

  const outboxRef = useRef<Outbox | null>(null);
  const cursorsRef = useRef<CursorStore | null>(null);
  const busyRef = useRef(false);
  const failuresRef = useRef(0);
  const cycleRef = useRef<() => Promise<void>>(async () => {});

  const clinicId = user?.clinicId ?? null;
  // AuthUser carries the email, not the internal id — it is the stable per-user
  // part of the scope key on a shared workstation.
  const userKey = user?.email ?? null;

  // Bind the queue to the signed-in principal (M6/H8).
  useEffect(() => {
    let cancelled = false;

    if (!clinicId || !userKey || !token) {
      outboxRef.current = null;
      cursorsRef.current = null;
      setPendingCount(0);
      setDeadLetterCount(0);
      void closeOfflineScope();
      return () => {
        cancelled = true;
      };
    }

    const scope: OfflineScope = { clinicId, userId: userKey };
    void (async () => {
      try {
        await purgeLegacyOfflineDb();
        const db = setOfflineScope(scope);
        await purgeForeignOutbox(db, scope);
        const outbox = new Outbox(createDexieOutboxStore(db, scope));
        outbox.restore(await loadOutboxItems(db, scope));
        if (cancelled) return;
        outboxRef.current = outbox;
        cursorsRef.current = createDexieCursorStore(db);
        setPendingCount(outbox.size);
        setDeadLetterCount(await countDeadLetters());
        await cycleRef.current();
      } catch {
        // IndexedDB unavailable (private mode / no storage): stay memory-only
        // rather than losing the ability to queue anything at all.
        if (!cancelled) outboxRef.current = new Outbox();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, userKey, token]);

  cycleRef.current = async () => {
    const outbox = outboxRef.current;
    if (!outbox || busyRef.current) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    busyRef.current = true;
    try {
      if (outbox.size > 0) {
        const report = await flushOutbox(outbox, pushToServer);
        setPendingCount(outbox.size);
        if (report.dead > 0) setDeadLetterCount(await countDeadLetters());
      }
      const cursors = cursorsRef.current;
      if (cursors) {
        const result = await drainPull(cursors, fetchPullPage, {
          onPage: async (page) => {
            await invalidatePulled(page);
          },
        });
        if (result.received > 0) setLastPullAt(Date.now());
      }
      failuresRef.current = 0;
    } catch {
      failuresRef.current += 1;
    } finally {
      busyRef.current = false;
    }
  };

  async function invalidatePulled(page: PullPage): Promise<void> {
    const keys = new Set<string>();
    for (const item of page.items) {
      const key = QUERY_KEY_BY_ENTITY[item.entity];
      if (key) keys.add(key);
    }
    for (const key of keys) {
      await queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  // Connectivity, focus and the polling timer (H2).
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      await cycleRef.current();
      if (stopped) return;
      timer = setTimeout(() => void tick(), pullBackoffMs(failuresRef.current));
    };

    const onOnline = () => {
      setIsOnline(true);
      failuresRef.current = 0;
      void cycleRef.current();
    };
    const onOffline = () => setIsOnline(false);
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void cycleRef.current();
    };

    void tick();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const value = useMemo<SyncCtx>(
    () => ({
      isOnline,
      pendingCount,
      deadLetterCount,
      lastPullAt,
      enqueue: async (entity, op, payload, baseVersion) => {
        const outbox = outboxRef.current;
        if (!outbox) throw new Error("sync not ready — sign in first");
        // Throws on an entity outside the §8 contract or an update without a
        // baseVersion: a forged envelope used to 400 the whole batch on the
        // server and stall every mutation queued behind it.
        const envelope = await outbox.enqueue(entity, op, payload, baseVersion ?? null);
        setPendingCount(outbox.size);
        if (isOnline) void cycleRef.current();
        return envelope;
      },
      flush: async () => {
        const outbox = outboxRef.current;
        if (!outbox) return 0;
        const report = await flushOutbox(outbox, pushToServer);
        setPendingCount(outbox.size);
        if (report.dead > 0) setDeadLetterCount(await countDeadLetters());
        return report.applied + report.duplicate;
      },
      syncNow: async () => {
        await cycleRef.current();
      },
    }),
    [isOnline, pendingCount, deadLetterCount, lastPullAt],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * A 4xx the server will never accept is permanent — the batch is dead-lettered
 * instead of retried five times. 401/403/408/429 are NOT permanent: those are a
 * token refresh or a rate budget, and the mutation is still perfectly valid.
 */
const PERMANENT_STATUSES = new Set([400, 404, 413, 422]);

async function pushToServer(mutations: MutationEnvelope[]): Promise<PushItemResult[]> {
  try {
    const res = await apiFetch<{ results: PushItemResult[] }>("/sync/push", {
      method: "POST",
      body: JSON.stringify({ mutations }),
    });
    return res.results ?? [];
  } catch (err) {
    if (err instanceof ApiError && PERMANENT_STATUSES.has(err.status)) {
      throw new PermanentPushError(`${err.code}: ${err.message}`, err.status);
    }
    throw err;
  }
}

async function fetchPullPage(cursor: string, limit: number): Promise<PullPage> {
  const res = await apiFetch<PullPage>(`/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=${limit}`);
  return { items: res.items ?? [], cursor: res.cursor ?? cursor, hasMore: Boolean(res.hasMore) };
}
