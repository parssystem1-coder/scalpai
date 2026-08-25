import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { ZodError } from "zod";
import { ApiError } from "@scalpai/shared";

/**
 * Single exit shape: {code, message, details?} (engineering-rules Â§3).
 * Logs stay PHI-free â€” no request bodies here, ever.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: { code: string; message: string; details?: unknown } = {
      code: "INTERNAL",
      message: "Ø®Ø·Ø§ÛŒ Ø¯Ø§Ø®Ù„ÛŒ Ø³Ø±ÙˆØ±",
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
      body = { code: "VALIDATION_ERROR", message: "ÙˆØ±ÙˆØ¯ÛŒ Ù†Ø§Ù…Ø¹ØªØ¨Ø±", details: exception.issues };
    } else if (isPgError(exception)) {
      if ((exception as { code: string }).code === "23505") {
        status = 409;
        body = { code: "CONFLICT", message: "Ø±Ú©ÙˆØ±Ø¯ ØªÚ©Ø±Ø§Ø±ÛŒ Ø§Ø³Øª" };
      } else if ((exception as { code: string }).code === "23503") {
        status = 400;
        body = { code: "FK_VIOLATION", message: "Ø§Ø±Ø¬Ø§Ø¹ Ù†Ø§Ù…Ø¹ØªØ¨Ø±" };
      }
    }
     
    console.error(`[api] ${status} ${(exception as Error)?.message?.slice(0, 160) ?? "unknown"}`);
    void res.status(status).send(body);
  }
}

function isPgError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
}
