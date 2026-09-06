import { Injectable } from "@nestjs/common";
import { errors } from "@scalpai/shared";
import { envNumber } from "../common/state/kv.store.js";
import { StateStore } from "../common/state/state.store.js";

interface BucketConfig {
  max: number;
  windowMs: number;
}

const FAIL_THRESHOLD = 5;

/**
 * §5 progressive brute-force defense (W16 / WEAKNESSES R11).
 *
 * All state lives in the shared store (Redis in production, in-process only for
 * a single-node dev run) — phase 2 kept it in per-process Maps, which meant the
 * lockout budget multiplied by the number of replicas. Three layers:
 *  1. per-email progressive lock: 5 consecutive failures -> AUTH_LOCK_MS,
 *     doubling up to AUTH_LOCK_MAX_MS
 *  2. per-IP window on login attempts (AUTH_IP_MAX / AUTH_IP_WINDOW_MS)
 *  3. independent per-IP windows for the other sensitive auth routes (R12), so
 *     refresh/logout floods can never consume the login budget or vice versa.
 *
 * Env names are the canonical ones documented in `.env.example`; the legacy
 * `IP_WINDOW_MS` spelling is gone (R11 — code and docs read one name only).
 */
@Injectable()
export class LoginThrottleService {
  private readonly baseLockMs = envNumber("AUTH_LOCK_MS", 60_000);
  private readonly maxLockMs = envNumber("AUTH_LOCK_MAX_MS", 15 * 60_000);
  private readonly failWindowMs = envNumber("AUTH_FAIL_WINDOW_MS", 15 * 60_000);
  private readonly configs: Record<string, BucketConfig> = {
    login: {
      max: envNumber("AUTH_IP_MAX", 20),
      windowMs: envNumber("AUTH_IP_WINDOW_MS", 60_000),
    },
    refresh: {
      max: envNumber("AUTH_REFRESH_IP_MAX", 60),
      windowMs: envNumber("AUTH_REFRESH_IP_WINDOW_MS", 60_000),
    },
    logout: {
      max: envNumber("AUTH_LOGOUT_IP_MAX", 60),
      windowMs: envNumber("AUTH_LOGOUT_IP_WINDOW_MS", 60_000),
    },
  };

  constructor(private state: StateStore) {}

  /** Fixed-window limiter for one named route bucket + one client IP. */
  async assertBucketAllowed(bucket: string, ip: string): Promise<void> {
    const cfg = this.configs[bucket] ?? this.configs.login!;
    if (cfg.max <= 0) return;
    const hits = await this.state.hit(this.bucketKey(bucket, ip), cfg.windowMs);
    if (hits > cfg.max) {
      throw errors.tooManyRequests("تعداد درخواست‌ها از این IP بیش از حد مجاز است");
    }
  }

  async assertIpAllowed(ip: string): Promise<void> {
    await this.assertBucketAllowed("login", ip);
  }

  async assertEmailAllowed(email: string): Promise<void> {
    const raw = await this.state.get(this.lockKey(email));
    if (!raw) return;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) return;
    throw errors.loginLocked(Math.max(1, Math.ceil((until - Date.now()) / 1000)));
  }

  async noteFailure(email: string): Promise<void> {
    const count = await this.state.hit(this.failKey(email), this.failWindowMs);
    if (count < FAIL_THRESHOLD) return;
    const factor = Math.min(2 ** (count - FAIL_THRESHOLD), 2 ** 4); // cap the doubling
    const lockMs = Math.min(this.baseLockMs * factor, this.maxLockMs);
    if (lockMs <= 0) return;
    await this.state.set(this.lockKey(email), String(Date.now() + lockMs), lockMs);
  }

  async noteSuccess(email: string): Promise<void> {
    await this.state.del(this.failKey(email));
    await this.state.del(this.lockKey(email));
  }

  private bucketKey(bucket: string, ip: string): string {
    return this.state.key("throttle", bucket, StateStore.digest(ip));
  }

  private failKey(email: string): string {
    return this.state.key("auth", "fail", StateStore.digest(email));
  }

  private lockKey(email: string): string {
    return this.state.key("auth", "lock", StateStore.digest(email));
  }
}
