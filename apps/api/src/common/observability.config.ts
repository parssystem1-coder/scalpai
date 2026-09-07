import { isProduction } from "./security.config.js";

/**
 * Observability configuration (WEAKNESSES L3, ADR-0042).
 *
 * Phases 1-8 established one pattern for anything that protects data: validate
 * it at boot and REFUSE to start rather than run degraded. Alerting belongs in
 * that list. A self-hosted clinic stack whose backup fails silently, whose disk
 * fills silently and whose 5xx rate is only visible in `docker logs` is not
 * operable - so production requires an alert sink, exactly like it requires
 * REDIS_URL and a PHI key ring.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export const SEVERITY_ORDER: Record<AlertSeverity, number> = { info: 0, warning: 1, critical: 2 };

export interface AlertConfig {
  webhookUrl: string | null;
  minSeverity: AlertSeverity;
  dedupeMs: number;
  timeoutMs: number;
}

function envInt(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function parseSeverity(raw: string | undefined): AlertSeverity {
  const value = raw?.trim().toLowerCase();
  if (value === "info" || value === "warning" || value === "critical") return value;
  return "warning";
}

export function resolveAlertConfig(env: NodeJS.ProcessEnv = process.env): AlertConfig {
  const raw = env.ALERT_WEBHOOK_URL?.trim() ?? "";
  let webhookUrl: string | null = null;
  if (raw.length > 0) {
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error("ALERT_WEBHOOK_URL is not a valid URL");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`ALERT_WEBHOOK_URL must be http(s), got ${parsed.protocol}`);
    }
    webhookUrl = parsed.toString();
  } else if (isProduction()) {
    throw new Error(
      "ALERT_WEBHOOK_URL is required in production - a stack whose backup, restore drill or 5xx burst pages nobody is not operable (ADR-0042)",
    );
  }
  return {
    webhookUrl,
    minSeverity: parseSeverity(env.ALERT_MIN_SEVERITY),
    dedupeMs: envInt("ALERT_DEDUPE_MS", 300_000, env),
    timeoutMs: envInt("ALERT_TIMEOUT_MS", 5_000, env),
  };
}

/**
 * Scrape token for `/api/v1/metrics`. No token means the route does not exist:
 * request rates and route names are internal information, and a public metrics
 * endpoint is a free map of the deployment.
 */
export function resolveMetricsToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.METRICS_TOKEN?.trim() ?? "";
  if (raw.length === 0) return null;
  if (raw.length < 16) throw new Error("METRICS_TOKEN must be at least 16 characters");
  return raw;
}

/** Called from the boot gate in main.ts, next to the JWT/CORS/PHI assertions. */
export function assertObservabilityConfig(): void {
  resolveAlertConfig();
  resolveMetricsToken();
}
