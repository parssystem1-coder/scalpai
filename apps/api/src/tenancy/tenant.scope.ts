import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { DbService } from "@scalpai/db";

export interface TenantCtx {
  clinicId: string;
  userId: string;
  role: string;
}

/**
 * One mutable holder per request. The store is created at the request boundary
 * (see tenant-context.hook.ts) and only ever populated by the auth guard.
 */
interface TenantStore {
  ctx: TenantCtx | null;
}

const als = new AsyncLocalStorage<TenantStore>();

/**
 * Tenant context + the only door to the database (rules §1).
 *
 * WEAKNESSES R3: `enterWith()` leaked context across continuations — it mutates
 * the *current* async resource, so anything already awaiting outside the request
 * (or a second request sharing a continuation) could observe the wrong clinic.
 * Phase 2 replaces it with a real `als.run(store, next)` boundary registered as
 * a fastify onRequest hook: each request gets its own store object, the guard
 * writes into that store, and nothing outside the request can see or change it.
 */
@Injectable()
export class TenantScope {
  /** Open a fresh, empty store for one request. */
  static run<T>(fn: () => T): T {
    return als.run({ ctx: null }, fn);
  }

  /** Open a store that already carries a context (jobs, workers, tests). */
  static runWith<T>(ctx: TenantCtx, fn: () => T): T {
    return als.run({ ctx }, fn);
  }

  static current(): TenantCtx | undefined {
    return als.getStore()?.ctx ?? undefined;
  }

  static hasStore(): boolean {
    return als.getStore() !== undefined;
  }

  /** Pin the authenticated principal onto the current request store. */
  static enter(ctx: TenantCtx): void {
    const store = als.getStore();
    if (!store) {
      throw new InternalServerErrorException({
        code: "TENANT_CONTEXT_MISSING",
        message: "مرز درخواست برای tenant context رجیستر نشده است",
      });
    }
    store.ctx = ctx;
  }

  constructor(private db: DbService) {}

  /** Runs fn inside a clinic-scoped transaction; RLS key is set first. */
  tx<T>(fn: (tx: import("@scalpai/db").Tx, ctx: TenantCtx) => Promise<T>): Promise<T> {
    const ctx = this.requireCtx();
    return this.db.withTenant(ctx.clinicId, ctx.userId, (tx) => fn(tx, ctx));
  }

  /** Context outside a tx (e.g. presigning) — guards against unauthenticated paths. */
  requireCtx(): TenantCtx {
    const ctx = als.getStore()?.ctx;
    if (!ctx) throw new Error("tenant scope missing — guard not applied?");
    return ctx;
  }
}
