import { scrubForLog } from "@scalpai/shared";
import { logEvent } from "./logging.js";
import { SEVERITY_ORDER, resolveAlertConfig, type AlertConfig, type AlertSeverity } from "./observability.config.js";

/**
 * Alerting (WEAKNESSES L3, ADR-0042).
 *
 * Three properties, because an alert channel is a PHI egress path like any other:
 *
 *  1. SCRUBBED - the payload goes through the same scrubber as the logs. An
 *     alert about a failed write must never quote the row that failed.
 *  2. DEDUPED - one broken endpoint produces one page per dedupe window, not one
 *     per request. An alert stream nobody can read is the same as no alerting.
 *  3. NON-BLOCKING - delivery never fails a request. A dead webhook is logged,
 *     not raised.
 */

export interface AlertEvent {
  event: string;
  severity: AlertSeverity;
  /** Correlates with the access log and the error filter. */
  requestId?: string | null;
  status?: number;
  path?: string;
  detail?: string;
}

export interface AlertPayload extends Record<string, unknown> {
  event: string;
  severity: AlertSeverity;
  source: "api";
  at: string;
  environment: string;
}

/** Only these keys ever leave the process, and each one is scrubbed. */
const ALLOWED_ALERT_KEYS = ["requestId", "status", "path", "detail"] as const;

export function buildAlertPayload(event: AlertEvent, env: NodeJS.ProcessEnv = process.env): AlertPayload {
  const payload: AlertPayload = {
    event: event.event,
    severity: event.severity,
    source: "api",
    at: new Date().toISOString(),
    environment: env.NODE_ENV?.trim() || "development",
  };
  for (const key of ALLOWED_ALERT_KEYS) {
    const value = event[key];
    if (value === undefined || value === null) continue;
    payload[key] = scrubForLog(value);
  }
  return payload;
}

export class AlertSink {
  private lastSentAt = new Map<string, number>();

  constructor(private readonly loadConfig: () => AlertConfig = () => resolveAlertConfig()) {}

  private config(): AlertConfig | null {
    try {
      return this.loadConfig();
    } catch {
      // Boot already refuses an invalid configuration; here we must not turn a
      // misconfigured sink into a failed request.
      return null;
    }
  }

  /** Returns true when the alert was actually delivered. */
  async notify(event: AlertEvent): Promise<boolean> {
    const config = this.config();
    if (!config?.webhookUrl) return false;
    if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[config.minSeverity]) return false;

    const key = `${event.event}:${event.path ?? ""}:${event.status ?? ""}`;
    const now = Date.now();
    const last = this.lastSentAt.get(key) ?? 0;
    if (now - last < config.dedupeMs) return false;
    this.lastSentAt.set(key, now);
    if (this.lastSentAt.size > 500) {
      for (const [k, sentAt] of this.lastSentAt) {
        if (now - sentAt > config.dedupeMs) this.lastSentAt.delete(k);
      }
    }

    const payload = buildAlertPayload(event);
    try {
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      if (!res.ok) {
        logEvent("warn", { event: "alert.rejected", code: String(res.status), reason: event.event });
        return false;
      }
      return true;
    } catch (err) {
      logEvent("warn", {
        event: "alert.delivery_failed",
        reason: event.event,
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /** Test seam: forget the dedupe window. */
  reset(): void {
    this.lastSentAt.clear();
  }
}

export const alerts = new AlertSink();
