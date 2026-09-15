import { createHmac, timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import type { FastifyRequest } from "fastify";

const WEBHOOK_PROVIDER = "webhook-provider";
export const WebhookSignature = (provider: string): MethodDecorator & ClassDecorator => SetMetadata(WEBHOOK_PROVIDER, provider);

/** Verifies provider HMAC signatures before any webhook payload reaches business logic. */
@Injectable()
export class WebhookGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const provider = context.getHandler() ? Reflect.getMetadata(WEBHOOK_PROVIDER, context.getHandler()) as string | undefined : undefined;
    if (!provider) return true;
    const request = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer }>();
    const signatureHeader = providerHeader(provider);
    const signature = request.headers[signatureHeader];
    const supplied = Array.isArray(signature) ? signature[0] : signature;
    const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? ""));
    if (!secret || typeof supplied !== "string" || !verifySignature(rawBody, supplied, secret)) throw new UnauthorizedException("Invalid webhook signature");
    return true;
  }
}

export function verifySignature(body: Buffer, supplied: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const normalized = supplied.startsWith("sha256=") ? supplied.slice(7) : supplied;
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(normalized, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function providerHeader(provider: string): string {
  return provider.toLowerCase() === "zarinpal" ? "x-zarinpal-signature" : "x-webhook-signature";
}
