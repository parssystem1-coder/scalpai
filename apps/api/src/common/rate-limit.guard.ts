import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { errors } from "@scalpai/shared";
import { TenantScope } from "../tenancy/tenant.scope.js";
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

function envKey(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private state: StateStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.getAllAndOverride<RateLimitSpec | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!spec) return true;

    const prefix = envKey(spec.name);
    const max = envNumber(`RATE_LIMIT_${prefix}_MAX`, spec.max);
    const windowMs = envNumber(`RATE_LIMIT_${prefix}_WINDOW_MS`, spec.windowMs ?? 60_000);
    if (max <= 0 || windowMs <= 0) return true; // explicitly disabled

    const ctx = TenantScope.current();
    const key = ctx
      ? this.state.tenantKey(ctx.clinicId, "rl", spec.name)
      : this.state.key("rl", spec.name, "ip", StateStore.digest(clientIp(context)));

    const hits = await this.state.hit(key, windowMs);
    if (hits > max) {
      throw errors.tooManyRequests(`سقف درخواست برای ${spec.name} در این بازه پر شده است`);
    }
    return true;
  }
}

function clientIp(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest<{ ip?: string }>();
  return req?.ip ?? "unknown";
}
