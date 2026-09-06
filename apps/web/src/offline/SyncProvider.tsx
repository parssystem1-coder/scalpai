import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Outbox, type MutationEnvelope } from "@scalpai/sync-client";
import { apiFetch } from "../api/client.js";
import { createDexieAdapter, flushOutbox, rehydrateOutbox } from "./sync.js";

interface SyncCtx {
  isOnline: boolean;
  pendingCount: number;
  enqueue: (entity: MutationEnvelope["entity"], op: MutationEnvelope["op"], payload: Record<string, unknown>, baseVersion?: string | null) => Promise<MutationEnvelope>;
  flush: () => Promise<number>;
}

const Ctx = createContext<SyncCtx>({ isOnline: true, pendingCount: 0, enqueue: async () => { throw new Error("sync not ready"); }, flush: async () => 0 });

export function useSync() {
  return useContext(Ctx);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendingCount, setPendingCount] = useState(0);
  const outboxRef = useRef<Outbox>(new Outbox(createDexieAdapter()));
  const flushedRef = useRef(false);

  // rehydrate on mount
  useEffect(() => {
    rehydrateOutbox(outboxRef.current).then(() => setPendingCount(outboxRef.current.size));
  }, []);

  // listen to online/offline
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // flush when coming online (once per online session)
  useEffect(() => {
    if (!isOnline || flushedRef.current) return;
    flushedRef.current = true;
    flushOutbox(outboxRef.current, pushToServer).then((n) => {
      if (n > 0) setPendingCount(outboxRef.current.size);
    });
    const goOffline = () => { flushedRef.current = false; };
    window.addEventListener("offline", goOffline, { once: true });
    return () => window.removeEventListener("offline", goOffline);
  }, [isOnline]);

  const value = useMemo<SyncCtx>(() => ({
    isOnline,
    pendingCount,
    enqueue: async (entity, op, payload, baseVersion) => {
      const m = await outboxRef.current.enqueue(entity, op, payload, baseVersion);
      setPendingCount(outboxRef.current.size);
      // optimistic: try push immediately if online
      if (isOnline) {
        flushOutbox(outboxRef.current, pushToServer).then((n) => {
          if (n > 0) setPendingCount(outboxRef.current.size);
        });
      }
      return m;
    },
    flush: async () => {
      const n = await flushOutbox(outboxRef.current, pushToServer);
      setPendingCount(outboxRef.current.size);
      return n;
    },
  }), [isOnline, pendingCount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

async function pushToServer(mutations: MutationEnvelope[]): Promise<{ clientMutationId: string; status: string }[]> {
  const res = await apiFetch<{ results: { clientMutationId: string; status: string }[] }>("/sync/push", {
    method: "POST",
    body: JSON.stringify({ mutations }),
  });
  return res.results;
}
