import { alerts } from "../common/alerting.js";
import { logEvent, onRequestFinished, type FinishedRequest } from "../common/logging.js";
import { metrics } from "../common/metrics.js";

/**
 * Wiring for phase 9 observability (L3, ADR-0042).
 *
 * Kept out of both logging.ts and the Nest module so the behaviour - "a 5xx is
 * counted AND paged, a 4xx is only counted" - is a plain function with a test,
 * not an implicit side effect of importing a module.
 */

let installed = false;

export function handleFinishedRequest(finished: FinishedRequest): void {
  metrics.observeHttp(finished);
  if (finished.status < 500) return;
  // Deduped inside the sink: one broken route pages once per window, not once
  // per request.
  void alerts.notify({
    event: "http.server_error",
    severity: "critical",
    requestId: finished.requestId,
    status: finished.status,
    path: finished.path,
  });
}

/** Idempotent: a second call must not double-count every request. */
export function installObservability(): void {
  if (installed) return;
  installed = true;
  onRequestFinished(handleFinishedRequest);
  logEvent("info", { event: "observability.installed" });
}

/** Test seam. */
export function resetObservabilityInstallation(): void {
  installed = false;
}
