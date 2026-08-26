import { Injectable } from "@nestjs/common";
import { errors } from "@scalpai/shared";

interface FailState {
  count: number;
  lockUntil: number;
}

/**
 * §5 progressive brute-force defense (W16) — in-memory until Redis lands in
 * phase 5. Two layers:
 *  1. per-email progressive lock: 5 consecutive failures → 60s, doubling to 15min
 *  2. per-IP sliding window on login attempts (default 20/min)
 * AUTH_LOCK_MS / AUTH_IP_WINDOW_MS env overrides exist for deterministic tests.
 */
@Injectable()
export class LoginThrottleService {
  private fails = new Map<string, FailState>();
  private ipHits = new Map<string, number[]>();

  private readonly baseLockMs = Number(process.env.AUTH_LOCK_MS ?? 60_000);
  private readonly maxLockMs = Number(process.env.AUTH_LOCK_MAX_MS ?? 15 * 60_000);
  private readonly ipMax = Number(process.env.AUTH_IP_MAX ?? 20);
  private readonly ipWindowMs = Number(process.env.IP_WINDOW_MS ?? 60_000);

  assertIpAllowed(ip: string): void {
    const now = Date.now();
    const hits = (this.ipHits.get(ip) ?? []).filter((t) => now - t < this.ipWindowMs);
    if (hits.length >= this.ipMax) {
      throw errors.tooManyRequests("تلاش‌های ورود از این IP بیش از حد مجاز است");
    }
    hits.push(now);
    this.ipHits.set(ip, hits);
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
      const mult = Math.min(2 ** (st.count - 5), 2 ** 4); // 60s→120→…→15min cap
      st.lockUntil = Date.now() + Math.min(this.baseLockMs * mult, this.maxLockMs);
    }
    this.fails.set(email, st);
  }

  noteSuccess(email: string): void {
    this.fails.delete(email);
  }
}
