import { createHash } from "node:crypto";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createKvStore, type KvStore } from "./kv.store.js";

/**
 * The one shared-state door for the API (ADR-0034).
 *
 * Key layout — everything is namespaced so two environments (or two test runs)
 * can share one Redis without stepping on each other, and tenant state is
 * always addressed under its clinic:
 *
 *   scalpai:{env}:throttle:{bucket}:{ipDigest}
 *   scalpai:{env}:auth:lock:{emailDigest}
 *   scalpai:{env}:t:{clinicId}:entitlement
 *   scalpai:{env}:t:{clinicId}:rl:{endpoint}
 *
 * Identifiers that are user data (email, IP) are stored as a truncated sha256
 * digest: the limiter only needs equality, not the value itself.
 */
@Injectable()
export class StateStore implements OnModuleDestroy {
  private readonly store: KvStore;
  private readonly namespace: string;

  constructor() {
    this.store = createKvStore();
    this.namespace = resolveNamespace();
  }

  get driver(): "memory" | "redis" {
    return this.store.driver;
  }

  static digest(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 32);
  }

  key(...parts: string[]): string {
    return [this.namespace, ...parts].join(":");
  }

  tenantKey(clinicId: string, ...parts: string[]): string {
    return this.key("t", clinicId, ...parts);
  }

  get(key: string): Promise<string | null> {
    return this.store.get(key);
  }

  set(key: string, value: string, ttlMs: number): Promise<void> {
    return this.store.set(key, value, ttlMs);
  }

  del(key: string): Promise<void> {
    return this.store.del(key);
  }

  hit(key: string, windowMs: number): Promise<number> {
    return this.store.hit(key, windowMs);
  }

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }
}

function resolveNamespace(): string {
  const explicit = process.env.REDIS_NAMESPACE?.trim();
  if (explicit && explicit.length > 0) return `scalpai:${explicit}`;
  const env = process.env.NODE_ENV?.trim();
  return `scalpai:${env && env.length > 0 ? env : "development"}`;
}
