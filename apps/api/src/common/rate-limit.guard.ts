import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { errors } from "@scalpai/shared";
import { TenantScope } from "../tenancy/tenant.scope.js";
import { metrics } from "./metrics.js";
import { envNumber } from "./state/kv.store.js";
import { StateStore } from "./state/state.store.js";

export const RATE_LIMIT_KEY = "rate_limit";

export interface RateLimitSpec {
  /** Bucket name — also the env override prefix: RATE_LIMIT_<NAME>_MAX. */
  name: string;
  max: number;
  windowMs?: number;
}

/**
 * WEAKNESSES L4 — expensive endpoints (sync push/pull, upload, analysis) get a
 * per-clinic request budget on top of the plan quota. Quota answers "how much
 * may this clinic do this month", this answers "how fast", which is what keeps
 * one tenant from starving the others (or the box) in a burst.
 */
export const RateLimit = (name: string, max: number, windowMs?: number) =>
  SetMetadata(RATE_LIMIT_KEY, { name, max, windowMs } satisfies RateLimitSpec);

/**
 * Phase 9 (L4) — "operationalize" the limiter.
 *
 * Until now a route was only limited when somebody remembered to decorate it, so
 * `/patients`, `/consents` and every future endpoint had no ceiling at all: one
 * scripted client could saturate the pool while the four decorated routes stayed
 * politely inside their budget. Two layers close that:
 *
 *   DEFAULT — every route gets a per-clinic (or per-IP, pre-auth) budget.
 *   GLOBAL  — one ceiling for the whole deployment, so the sum of all tenants
 *             still cannot exceed what this host can serve.
 *
 * `max = 0` remains the explicit opt-out and now skips BOTH layers: that is what
 * the health/metrics probes use, because throttling a monitor during an incident
 * is how an incident becomes invisible.
 */
export const DEFAULT_LIMIT: RateLimitSpec = { name: "default", max: 600, windowMs: 60_000 };
export const GLOBAL_LIMIT: RateLimitSpec = { name: "global", max: 5_000, windowMs: 60_000 };

export interface ResolvedRateLimit {
  max: number;
  windowMs: number;
}

function envKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function resolveLimit(spec: RateLimitSpec): ResolvedRateLimit {
  const prefix = envKey(spec.name);
  return {
    max: envNumber(`RATE_LIMIT_${prefix}_MAX`, spec.max),
    windowMs: envNumber(`RATE_LIMIT_${prefix}_WINDOW_MS`, spec.windowMs ?? 60_000),
  };
}

export function isDisabled(limit: ResolvedRateLimit): boolean {
  return limit.max <= 0 || limit.windowMs <= 0;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private state: StateStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== "http") return true;

    const declared = this.reflector.getAllAndOverride<RateLimitSpec | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const spec = declared ?? DEFAULT_LIMIT;
    const limit = resolveLimit(spec);
    // An explicit opt-out (or a disabled default) skips the global ceiling too.
    if (isDisabled(limit)) return true;

    const globalLimit = resolveLimit(GLOBAL_LIMIT);
    if (!isDisabled(globalLimit)) {
      await this.consume(this.state.key("rl", GLOBAL_LIMIT.name), globalLimit, GLOBAL_LIMIT.name);
    }

    const ctx = TenantScope.current();
    const key = ctx
      ? this.state.tenantKey(ctx.clinicId, "rl", spec.name)
      : this.state.key("rl", spec.name, "ip", StateStore.digest(clientIp(context)));
    await this.consume(key, limit, spec.name);
    return true;
  }

  private async consume(key: string, limit: ResolvedRateLimit, bucket: string): Promise<void> {
    const hits = await this.state.hit(key, limit.windowMs);
    if (hits <= limit.max) return;
    metrics.counter("scalpai_rate_limit_rejected_total", { bucket });
    throw errors.tooManyRequests(`سقف درخواست برای ${bucket} در این بازه پر شده است`);
  }
}

function clientIp(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest<{ ip?: string }>();
  return req?.ip ?? "unknown";
}
