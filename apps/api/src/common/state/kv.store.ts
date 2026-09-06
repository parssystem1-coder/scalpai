import { isProduction } from "../security.config.js";
import { RedisClient } from "./redis.client.js";

/**
 * Shared key/value state (ADR-0034 — WEAKNESSES R11/M6/L4).
 *
 * Login throttling, the principal cache, the entitlement cache and the endpoint
 * rate limits used to be per-process `Map`s: on two replicas every budget was
 * silently doubled and a revoked principal stayed warm on the replica that did
 * not serve the logout. All of them now go through this contract:
 *  - `redis` driver in production (REDIS_URL is mandatory there — boot fails)
 *  - `memory` driver for a single-process dev/test run
 *
 * Every key carries a TTL, so nothing needs a sweeper, and the memory driver
 * evicts by insertion order once it hits its cap.
 */

export interface KvStore {
  readonly driver: "memory" | "redis";
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Fixed-window counter: returns the number of hits inside the current window. */
  hit(key: string, windowMs: number): Promise<number>;
  close(): Promise<void>;
}

const MEMORY_KEY_LIMIT = 20_000;
const DEGRADE_WINDOW_MS = 5_000;

export function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

export class MemoryKvStore implements KvStore {
  readonly driver = "memory" as const;
  private entries = new Map<string, MemoryEntry>();

  async get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.evict();
    this.entries.set(key, { value, expiresAt: Date.now() + Math.max(1, ttlMs) });
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async hit(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= now) {
      this.evict();
      this.entries.set(key, { value: "1", expiresAt: now + Math.max(1, windowMs) });
      return 1;
    }
    const next = Number(entry.value) + 1;
    // the window keeps its original deadline — a fixed window, not a rolling one
    entry.value = String(next);
    return next;
  }

  async close(): Promise<void> {
    this.entries.clear();
  }

  private evict(): void {
    if (this.entries.size < MEMORY_KEY_LIMIT) return;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
    if (this.entries.size < MEMORY_KEY_LIMIT) return;
    const excess = this.entries.size - Math.floor(MEMORY_KEY_LIMIT / 2);
    let removed = 0;
    for (const key of this.entries.keys()) {
      if (removed >= excess) break;
      this.entries.delete(key);
      removed += 1;
    }
  }
}

/**
 * Redis driver with a bounded degradation path: if Redis is unreachable the
 * limiter must not open wide, so we fall back to a per-process window for a few
 * seconds (still limiting, just not shared) and retry the real store after.
 */
export class RedisKvStore implements KvStore {
  readonly driver = "redis" as const;
  private readonly fallback = new MemoryKvStore();
  private degradedUntil = 0;

  constructor(private client: RedisClient) {}

  async get(key: string): Promise<string | null> {
    if (this.degraded()) return this.fallback.get(key);
    try {
      const reply = await this.client.command("GET", key);
      return typeof reply === "string" ? reply : null;
    } catch (err) {
      this.degrade(err);
      return this.fallback.get(key);
    }
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    if (this.degraded()) {
      await this.fallback.set(key, value, ttlMs);
      return;
    }
    try {
      await this.client.command("SET", key, value, "PX", Math.max(1, Math.round(ttlMs)));
    } catch (err) {
      this.degrade(err);
      await this.fallback.set(key, value, ttlMs);
    }
  }

  async del(key: string): Promise<void> {
    if (this.degraded()) {
      await this.fallback.del(key);
      return;
    }
    try {
      await this.client.command("DEL", key);
    } catch (err) {
      this.degrade(err);
      await this.fallback.del(key);
    }
  }

  async hit(key: string, windowMs: number): Promise<number> {
    if (this.degraded()) return this.fallback.hit(key, windowMs);
    try {
      const count = Number(await this.client.command("INCR", key));
      if (count === 1) await this.client.command("PEXPIRE", key, Math.max(1, Math.round(windowMs)));
      return count;
    } catch (err) {
      this.degrade(err);
      return this.fallback.hit(key, windowMs);
    }
  }

  async close(): Promise<void> {
    await this.client.close();
    await this.fallback.close();
  }

  private degraded(): boolean {
    return Date.now() < this.degradedUntil;
  }

  private degrade(err: unknown): void {
    this.degradedUntil = Date.now() + DEGRADE_WINDOW_MS;
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[state] redis unavailable, using per-process limits for ${DEGRADE_WINDOW_MS}ms: ${reason}`);
  }
}

/**
 * Production refuses to boot without REDIS_URL: an in-process limiter behind two
 * replicas is a silently wrong security control, not a graceful default.
 */
export function createKvStore(): KvStore {
  const url = process.env.REDIS_URL?.trim();
  if (url && url.length > 0) {
    return new RedisKvStore(
      new RedisClient({
        url,
        connectTimeoutMs: envNumber("REDIS_CONNECT_TIMEOUT_MS", 1_500),
        commandTimeoutMs: envNumber("REDIS_COMMAND_TIMEOUT_MS", 1_500),
      }),
    );
  }
  if (isProduction()) {
    throw new Error(
      "REDIS_URL is required in production — auth throttling, entitlement cache and endpoint rate limits must be shared across replicas (ADR-0034)",
    );
  }
  return new MemoryKvStore();
}
