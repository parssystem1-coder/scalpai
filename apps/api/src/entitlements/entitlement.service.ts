import { Injectable } from "@nestjs/common";
import { resolveEntitlement, type ResolvedEntitlement } from "@scalpai/db";
import { TenantScope } from "../tenancy/tenant.scope.js";

interface CacheEntry {
  data: ResolvedEntitlement;
  expires: number;
}

/** §9.1 — single source of truth, short in-memory cache (60s). */
@Injectable()
export class EntitlementService {
  private cache = new Map<string, CacheEntry>();

  constructor(private scope: TenantScope) {}

  async resolve(clinicId: string): Promise<ResolvedEntitlement | null> {
    const hit = this.cache.get(clinicId);
    if (hit && hit.expires > Date.now()) return hit.data;
    const data = await this.scope.tx((tx) => resolveEntitlement(tx, clinicId));
    if (data) this.cache.set(clinicId, { data, expires: Date.now() + 60_000 });
    return data;
  }
}
