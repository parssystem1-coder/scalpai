import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ApiError, resolveLocale, ERROR_MESSAGES } from "@scalpai/shared";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { logEvent, requestIdOf } from "./logging.js";

/**
 * Single exit shape: {code, message, details?} (engineering-rules §3).
 *
 * Phase 6 (L3): the log line is structured and SCRUBBED. It used to print the
 * raw driver message, and a Postgres unique-violation message quotes the value
 * that collided — which for `patients_clinic_phone_live_uq` is a patient's phone
 * number. It also correlates with the access log through the request id.
 *
 * Phase 10 (M11): the SPA fallback was doing TWO sync calls plus a
 * synchronous file read of index.html on every single 404 — on the event
 * loop, per request, forever. It is now read once, cached (including the
 * "there is no build here" answer), and primed off the request path at module
 * load. It also stopped swallowing real 404s: /api answers with the canonical
 * error body, and so does anything that looks like a missing ASSET, because
 * returning HTML with status 200 for a missing .js chunk is how a broken deploy
 * turns into a silent white screen.
 */

/** Where a built web bundle can legitimately sit relative to the API's cwd. */
const SHELL_CANDIDATES = ["apps/web/dist/index.html", "../web/dist/index.html"] as const;

/** Requests that must NEVER receive the HTML shell. */
const API_PREFIXES = ["/api", "/health", "/ready", "/metrics", "/docs"] as const;

/** A path whose last segment carries an extension is an asset, not a route. */
const ASSET_LIKE = /\/[^/]+\.[a-zA-Z0-9]{1,16}$/;

type ShellCache = { loaded: true; html: string | null } | { loaded: false };

let shellCache: ShellCache = { loaded: false };
let shellLoading: Promise<void> | null = null;

async function loadShell(): Promise<void> {
  for (const candidate of SHELL_CANDIDATES) {
    try {
      const html = await readFile(join(process.cwd(), candidate), "utf-8");
      shellCache = { loaded: true, html };
      return;
    } catch {
      // try the next candidate
    }
  }
  // Cache the negative answer too: an API-only deployment must not retry the
  // filesystem on every 404 for the rest of its life.
  shellCache = { loaded: true, html: null };
}

/**
 * Kick the read off the request path. Exported so a test can await it instead of
 * racing it.
 */
export function primeSpaShell(): Promise<void> {
  shellLoading ??= loadShell();
  return shellLoading;
}

/** Test seam: forget everything the process learned about the bundle. */
export function resetSpaShellCache(): void {
  shellCache = { loaded: false };
  shellLoading = null;
}

/** The cached shell, or null when there is no build (or it is not read yet). */
export function cachedSpaShell(): string | null {
  if (!shellCache.loaded) {
    void primeSpaShell();
    return null;
  }
  return shellCache.html;
}

/**
 * M11 — a 404 may only be answered with the SPA shell when it is plausibly a
 * client-side ROUTE. Machine clients and missing assets get the real 404.
 */
export function isSpaShellCandidate(method: string, url: string): boolean {
  if (method !== "GET") return false;
  const path = url.split("?")[0] ?? url;
  if (API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  if (ASSET_LIKE.test(path)) return false;
  return true;
}

void primeSpaShell();

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    const locale = resolveLocale(req.headers["accept-language"]);

    // M19: annotated as `number`, not left to infer HttpStatus. Every branch
    // below writes a bare 400/409 into it, and the two checks at the bottom
    // (`>= 500`, `=== 404`) are numeric — comparing an enum-typed local against
    // a literal is exactly what no-unsafe-enum-comparison refuses.
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: { code: string; message: string; details?: unknown } = {
      code: "INTERNAL",
      message: ERROR_MESSAGES[locale].internal,
    };

    if (exception instanceof ApiError) {
      status = exception.status;
      body = exception.body;
      if (locale === "en" && body.code in ERROR_MESSAGES.en && !exception.message.match(/[a-zA-Z]/)) {
        // Translate default message if client requested English and message is Persian default
        const key = body.code.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof typeof ERROR_MESSAGES.en;
        const localized = ERROR_MESSAGES.en[key];
        if (typeof localized === "string") {
          body.message = localized;
        }
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        body = { code: "ERROR", message: payload };
      } else {
        const p = payload as { code?: string; message?: string; details?: unknown };
        body = { code: p.code ?? "ERROR", message: p.message ?? (locale === "en" ? "Error" : "خطا"), details: p.details };
      }
    } else if (exception instanceof ZodError) {
      status = 400;
      body = { code: "VALIDATION_ERROR", message: ERROR_MESSAGES[locale].validation, details: exception.issues };
    } else if (isPgError(exception)) {
      // M19: isPgError is a type predicate now, so `exception` is narrowed to
      // { code: string } here — no cast, and no unsafe member access.
      const code = exception.code;
      if (code === "23505") {
        status = 409;
        body = { code: "CONFLICT", message: ERROR_MESSAGES[locale].conflict };
      } else if (code === "23503") {
        status = 400;
        body = { code: "FK_VIOLATION", message: locale === "en" ? "Foreign key violation" : "ارجاع نامعتبر" };
      } else if (code === "23514") {
        // A CHECK constraint refused the write — phase 6 uses these to keep
        // plaintext PHI out of the database, so it is a client error, not a 500.
        status = 400;
        body = {
          code: "CONSTRAINT_VIOLATION",
          message: locale === "en" ? "The value violates a data-protection constraint" : "مقدار با قید حفاظت از داده سازگار نیست",
        };
      }
    }

    // The log line is written for EVERY refusal, including the ones answered with
    // the shell — a swallowed 404 that leaves no trace is how M11 stayed open.
    logEvent(status >= 500 ? "error" : "warn", {
      event: "http.error",
      requestId: requestIdOf(req),
      status,
      code: body.code,
      // Scrubbed and truncated by the logger — driver messages quote values.
      message: exception instanceof Error ? exception.message : "unknown",
    });

    if (status === 404 && isSpaShellCandidate(req.method, req.url)) {
      const html = cachedSpaShell();
      if (html !== null) {
        void res.status(200).type("text/html").send(html);
        return;
      }
    }

    void res.status(status).send(body);
  }
}

function isPgError(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code?: unknown }).code === "string";
}
