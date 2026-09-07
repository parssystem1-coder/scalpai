import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { scrubForLog, scrubText } from "@scalpai/shared";

/**
 * Structured, PHI-free logging (WEAKNESSES L3, ADR-0038 / ADR-0042).
 *
 * What was wrong: `console.error("[api] …")` with a raw error message. Postgres
 * unique-violation messages quote the conflicting VALUE, so a duplicate-phone
 * insert printed a patient's phone number into the container log. Nothing bounded
 * the length, nothing correlated two lines of the same request, and nothing
 * stopped a future `console.log(body)`.
 *
 * The rules now:
 *  - every line is one JSON object with a `requestId`;
 *  - top-level metadata keys are ALLOWLISTED — an unknown key is dropped, not
 *    printed "just in case";
 *  - every value goes through the shared scrubber (tokens, emails, phones,
 *    data URLs, PHI field names);
 *  - the request id comes from the caller only if it looks like an id.
 *
 * Phase 9 adds one thing: the access log is also the single place where a
 * finished request is announced, so metrics and alerting subscribe here instead
 * of being sprinkled through handlers.
 */

export const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Keys allowed at the top level of a log line. Everything else is dropped.
 * Deliberately absent: body, params, query, headers, email, patientId payloads.
 */
export const ALLOWED_LOG_KEYS = new Set([
  "at",
  "level",
  "event",
  "requestId",
  "method",
  "path",
  "status",
  "durationMs",
  "clinicId",
  "userId",
  "role",
  "code",
  "message",
  "entity",
  "entityId",
  "count",
  "fields",
  "keyId",
  "reason",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  event: string;
  requestId?: string | null;
  [key: string]: unknown;
}

/** Build the line without printing it — the unit test asserts on this. */
export function buildLogLine(level: LogLevel, fields: LogFields): Record<string, unknown> {
  const line: Record<string, unknown> = {
    at: new Date().toISOString(),
    level,
    event: fields.event,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "event") continue;
    if (!ALLOWED_LOG_KEYS.has(key)) continue;
    if (value === undefined) continue;
    line[key] = scrubForLog(value);
  }
  return line;
}

export function logEvent(level: LogLevel, fields: LogFields): void {
  const line = JSON.stringify(buildLogLine(level, fields));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** A caller-supplied id is only trusted if it is shaped like one. */
export function resolveRequestId(header: unknown): string {
  if (typeof header === "string" && REQUEST_ID_RE.test(header)) return header;
  return randomUUID();
}

export function requestIdOf(req: FastifyRequest): string {
  const existing = (req as unknown as { scalpaiRequestId?: string }).scalpaiRequestId;
  if (existing) return existing;
  const id = resolveRequestId(req.headers[REQUEST_ID_HEADER]);
  (req as unknown as { scalpaiRequestId?: string }).scalpaiRequestId = id;
  return id;
}

/**
 * Phase 9 (L3): one fan-out point for "a request finished". Metrics and alerting
 * register here (see ops/observability.ts) so neither of them has to wrap the
 * Fastify lifecycle again, and an observer that throws can never fail a request.
 */
export interface FinishedRequest {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

export type RequestObserver = (finished: FinishedRequest) => void;

const observers = new Set<RequestObserver>();

export function onRequestFinished(observer: RequestObserver): void {
  observers.add(observer);
}

export function clearRequestObservers(): void {
  observers.clear();
}

export function emitRequestFinished(finished: FinishedRequest): void {
  for (const observer of observers) {
    try {
      observer(finished);
    } catch (err) {
      logEvent("warn", {
        event: "observer.failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Correlation + access log. Registered next to the tenant-context hook so every
 * downstream line can quote the same id, and echoed back so a client can hand it
 * to support without anyone pasting PHI into a ticket.
 */
export function registerRequestLogging(fastify: FastifyInstance): void {
  fastify.addHook("onRequest", (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const id = requestIdOf(req);
    (req as unknown as { scalpaiStartedAt?: number }).scalpaiStartedAt = Date.now();
    void reply.header(REQUEST_ID_HEADER, id);
    done();
  });

  fastify.addHook("onResponse", (req: FastifyRequest, reply: FastifyReply, done: () => void) => {
    const startedAt = (req as unknown as { scalpaiStartedAt?: number }).scalpaiStartedAt ?? Date.now();
    const finished: FinishedRequest = {
      requestId: requestIdOf(req),
      method: req.method,
      // The PATH only — a query string can carry a search term, i.e. a name.
      path: scrubText(req.url.split("?")[0] ?? req.url),
      status: reply.statusCode,
      durationMs: Date.now() - startedAt,
    };
    logEvent(finished.status >= 500 ? "error" : "info", {
      event: "http.request",
      requestId: finished.requestId,
      method: finished.method,
      path: finished.path,
      status: finished.status,
      durationMs: finished.durationMs,
    });
    emitRequestFinished(finished);
    done();
  });
}
