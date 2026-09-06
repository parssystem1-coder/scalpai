import { Injectable } from "@nestjs/common";
import { resolveEntitlement, type ResolvedEntitlement } from "@scalpai/db";
import { envNumber } from "../common/state/kv.store.js";
import { StateStore } from "../common/state/state.store.js";
import { TenantScope } from "../tenancy/tenant.scope.js";

/**
 * §9.1 — single source of truth for what a clinic may do.
 *
 * The cache moved out of the process into the shared store (WEAKNESSES M6):
 * keyed per clinic, with an explicit TTL, so a plan change is not served from a
 * warm Map on a replica that never handled the write.
 */
@Injectable()
export class EntitlementService {
  private readonly ttlMs = envNumber("ENTITLEMENT_CACHE_TTL_MS", 60_000);

  constructor(
    private scope: TenantScope,
    private state: StateStore,
  ) {}

  async resolve(clinicId: string): Promise<ResolvedEntitlement | null> {
    const key = this.cacheKey(clinicId);
    const cached = await this.state.get(key);
    if (cached) {
      try {
        return JSON.parse(cached) as ResolvedEntitlement;
      } catch {
        await this.state.del(key);
      }
    }
    const data = await this.scope.tx((tx) => resolveEntitlement(tx, clinicId));
    if (data && this.ttlMs > 0) await this.state.set(key, JSON.stringify(data), this.ttlMs);
    return data;
  }

  /** Plan/entitlement writes must not stay masked by a warm cache. */
  async invalidate(clinicId: string): Promise<void> {
    await this.state.del(this.cacheKey(clinicId));
  }

  private cacheKey(clinicId: string): string {
    return this.state.tenantKey(clinicId, "entitlement");
  }
}
