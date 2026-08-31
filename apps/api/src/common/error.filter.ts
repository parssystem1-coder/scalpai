import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { ApiError } from "@scalpai/shared";
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

/**
 * Single exit shape: {code, message, details?} (engineering-rules §3).
 * Logs stay PHI-free — no request bodies here, ever.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const req = host.switchToHttp().getRequest<FastifyRequest>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: { code: string; message: string; details?: unknown } = {
      code: "INTERNAL",
      message: "خطای داخلی سرور",
    };

    if (exception instanceof ApiError) {
      status = exception.status;
      body = exception.body;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        body = { code: "ERROR", message: payload };
      } else {
        const p = payload as { code?: string; message?: string; details?: unknown };
        body = { code: p.code ?? "ERROR", message: p.message ?? "خطا", details: p.details };
      }
    } else if (exception instanceof ZodError) {
      status = 400;
      body = { code: "VALIDATION_ERROR", message: "ورودی نامعتبر", details: exception.issues };
    } else if (isPgError(exception)) {
      if ((exception as { code: string }).code === "23505") {
        status = 409;
        body = { code: "CONFLICT", message: "رکورد تکراری است" };
      } else if ((exception as { code: string }).code === "23503") {
        status = 400;
        body = { code: "FK_VIOLATION", message: "ارجاع نامعتبر" };
      }
    }

    if (status === 404 && !req.url.startsWith("/api")) {
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
     
    console.error(`[api] ${status} ${(exception as Error)?.message?.slice(0, 160) ?? "unknown"}`);
    const cause = (exception as { cause?: unknown })?.cause;
    if (cause) console.error(`[api] cause: ${String((cause as Error)?.message ?? cause).slice(0, 220)}`);
    void res.status(status).send(body);
  }
}

function isPgError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}
