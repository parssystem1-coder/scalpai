import { Injectable } from "@nestjs/common";
import { errors } from "@scalpai/shared";

interface FailState {
  count: number;
  lockUntil: number;
}

interface BucketConfig {
  max: number;
  windowMs: number;
}

const IP_TRACKING_LIMIT = 10_000;

/**
 * §5 progressive brute-force defense (W16) — in-memory until Redis lands in
 * phase 3. Three layers:
 *  1. per-email progressive lock: 5 consecutive failures -> 60s, doubling to 15min
 *  2. per-IP sliding window on login attempts (default 20/min)
 *  3. independent per-IP windows for the other sensitive auth routes (R12), so
 *     refresh/logout floods can never consume the login budget or vice versa.
 * AUTH_LOCK_MS / IP_WINDOW_MS env overrides exist for deterministic tests.
 */
@Injectable()
export class LoginThrottleService {
  private fails = new Map<string, FailState>();
  private buckets = new Map<string, Map<string, number[]>>();

  private readonly baseLockMs = Number(process.env.AUTH_LOCK_MS ?? 60_000);
  private readonly maxLockMs = Number(process.env.AUTH_LOCK_MAX_MS ?? 15 * 60_000);
  private readonly configs: Record<string, BucketConfig> = {
    login: {
      max: Number(process.env.AUTH_IP_MAX ?? 20),
      windowMs: Number(process.env.IP_WINDOW_MS ?? 60_000),
    },
    refresh: {
      max: Number(process.env.AUTH_REFRESH_IP_MAX ?? 60),
      windowMs: Number(process.env.AUTH_REFRESH_IP_WINDOW_MS ?? 60_000),
    },
    logout: {
      max: Number(process.env.AUTH_LOGOUT_IP_MAX ?? 60),
      windowMs: Number(process.env.AUTH_LOGOUT_IP_WINDOW_MS ?? 60_000),
    },
  };

  /** Sliding-window limiter for one named route bucket + one client IP. */
  assertBucketAllowed(bucket: string, ip: string): void {
    const cfg = this.configs[bucket] ?? this.configs.login!;
    let hitsByIp = this.buckets.get(bucket);
    if (!hitsByIp) {
      hitsByIp = new Map<string, number[]>();
      this.buckets.set(bucket, hitsByIp);
    }
    if (hitsByIp.size >= IP_TRACKING_LIMIT) hitsByIp.clear();

    const now = Date.now();
    const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < cfg.windowMs);
    if (hits.length >= cfg.max) {
      throw errors.tooManyRequests("تعداد درخواست‌ها از این IP بیش از حد مجاز است");
    }
    hits.push(now);
    hitsByIp.set(ip, hits);
  }

  assertIpAllowed(ip: string): void {
    this.assertBucketAllowed("login", ip);
  }

  assertEmailAllowed(email: string): void {
    const st = this.fails.get(email);
    if (!st) return;
    if (Date.now() < st.lockUntil) {
      const secs = Math.ceil((st.lockUntil - Date.now()) / 1000);
      throw errors.loginLocked(secs);
    }
  }

  noteFailure(email: string): void {
    const st = this.fails.get(email) ?? { count: 0, lockUntil: 0 };
    st.count += 1;
    if (st.count >= 5) {
      const mult = Math.min(2 ** (st.count - 5), 2 ** 4); // 60s->120->...->15min cap
      st.lockUntil = Date.now() + Math.min(this.baseLockMs * mult, this.maxLockMs);
    }
    this.fails.set(email, st);
  }

  noteSuccess(email: string): void {
    this.fails.delete(email);
  }
}
