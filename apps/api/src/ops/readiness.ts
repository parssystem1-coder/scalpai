import { scrubText } from "@scalpai/shared";

/**
 * Readiness (WEAKNESSES L3, ADR-0042).
 *
 * `GET /api/v1/health` answers "this process is alive", which is all a container
 * runtime needs and far less than an operator needs. Readiness answers the only
 * question that matters during an incident: can this instance serve a request?
 *
 * The split is deliberate:
 *  - DATABASE is REQUIRED. Without Postgres every clinical route is a 500, so
 *    the instance must be pulled out of rotation.
 *  - SHARED STATE is ADVISORY. The KV store already degrades to per-process
 *    limits for a few seconds when Redis blinks (ADR-0034); reporting `degraded`
 *    is honest, refusing traffic would turn a limiter hiccup into an outage.
 */

export interface CheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export type Probe = () => Promise<unknown>;

export interface ReadinessProbes {
  database: Probe;
  sharedState: Probe;
}

export type ReadinessStatus = "ready" | "degraded" | "unavailable";

export interface ReadinessReport {
  ok: boolean;
  status: ReadinessStatus;
  checks: { database: CheckResult; sharedState: CheckResult };
}

export const READINESS_TIMEOUT_MS_DEFAULT = 2_000;

export async function runProbe(probe: Probe, timeoutMs: number): Promise<CheckResult> {
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`probe timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    // Driver messages quote values; a probe error is still an error message.
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Date.now() - startedAt, error: scrubText(raw).slice(0, 200) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function evaluateReadiness(
  probes: ReadinessProbes,
  timeoutMs: number = READINESS_TIMEOUT_MS_DEFAULT,
): Promise<ReadinessReport> {
  const [database, sharedState] = await Promise.all([
    runProbe(probes.database, timeoutMs),
    runProbe(probes.sharedState, timeoutMs),
  ]);
  const status: ReadinessStatus = !database.ok ? "unavailable" : sharedState.ok ? "ready" : "degraded";
  return { ok: database.ok, status, checks: { database, sharedState } };
}
