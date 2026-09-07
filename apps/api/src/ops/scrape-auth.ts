import { timingSafeEqual } from "node:crypto";

/**
 * `/api/v1/metrics` authorisation (ADR-0042).
 *
 * Request rates, route names and error counts map the deployment, so the scrape
 * endpoint is not public. Two rules:
 *  - no METRICS_TOKEN configured => the route does not exist (404), because a
 *    disabled endpoint should not advertise itself;
 *  - the comparison is constant time, like every other token check in this repo.
 */
export function extractBearer(header: unknown): string {
  if (typeof header !== "string") return "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

export function metricsAuthorized(header: unknown, token: string | null): boolean {
  if (!token) return false;
  const presented = extractBearer(header);
  if (presented.length === 0 || presented.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(presented, "utf8"), Buffer.from(token, "utf8"));
}
