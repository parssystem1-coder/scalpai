import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ApiError, resolveLocale, ERROR_MESSAGES } from "@scalpai/shared";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { logEvent, requestIdOf } from "./logging.js";

/**
 * Single exit shape: {code, message, details?} (engineering-rules §3).
 *
 * Phase 6 (L3): the log line is structured and SCRUBBED. It used to print the
 * raw driver message, and a Postgres unique-violation message quotes the value
 * that collided — which for `patients_clinic_phone_live_uq` is a patient's phone
 * number. It also correlates with the access log through the request id.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    const locale = resolveLocale(req.headers["accept-language"] as string | undefined);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
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
      const code = (exception as { code: string }).code;
      if (code === "23505" || code === "23505".slice(0)) {
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

    // SPA fallback: only for non-API GETs, and it must never swallow a real
    // /api 404 (M11 keeps the rest of this; the /api guard is the part that
    // matters for a machine client).
    if (status === 404 && req.method === "GET" && !req.url.startsWith("/api")) {
      try {
        const p1 = join(process.cwd(), "apps/web/dist/index.html");
        const p2 = join(process.cwd(), "../web/dist/index.html");
        const filePath = existsSync(p1) ? p1 : existsSync(p2) ? p2 : null;
        if (filePath) {
          const indexHtml = readFileSync(filePath, "utf-8");
          void res.type("text/html").send(indexHtml);
          return;
        }
      } catch {
        // Fallback if not built yet
      }
    }

    logEvent(status >= 500 ? "error" : "warn", {
      event: "http.error",
      requestId: requestIdOf(req),
      status,
      code: body.code,
      // Scrubbed and truncated by the logger — driver messages quote values.
      message: (exception as Error)?.message ?? "unknown",
    });

    void res.status(status).send(body);
  }
}

function isPgError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}
