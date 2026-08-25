import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { DbService } from "@scalpai/db";

export interface TenantCtx {
  clinicId: string;
  userId: string;
  role: string;
}

const als = new AsyncLocalStorage<TenantCtx>();

/**
 * Auth guard runs first and calls `run(ctx, next)`-equivalent via enterWith,
 * so every downstream repo call inherits the tenant context. Data access
 * goes through tenantTx() — the only door to the database (rules §1).
 */
@Injectable()
export class TenantScope {
  static current(): TenantCtx | undefined {
    return als.getStore();
  }
  static enter(ctx: TenantCtx): void {
    als.enterWith(ctx);
  }
  constructor(private db: DbService) {}
  /** Runs fn inside a clinic-scoped transaction; RLS key is set first. */
  tx<T>(fn: (tx: import("@scalpai/db").Tx, ctx: TenantCtx) => Promise<T>): Promise<T> {
    const ctx = als.getStore();
    if (!ctx) throw new Error("tenant scope missing — guard not applied?");
    return this.db.withTenant(ctx.clinicId, ctx.userId, (tx) => fn(tx, ctx));
  }
}
