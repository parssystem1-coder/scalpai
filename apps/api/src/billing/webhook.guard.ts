import { createHmac, timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

const WEBHOOK_PROVIDER = "webhook-provider";
export const WebhookSignature = (provider: string): MethodDecorator & ClassDecorator => SetMetadata(WEBHOOK_PROVIDER, provider);

/** Verifies provider HMAC signatures before any webhook payload reaches business logic. */
@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const provider = this.reflector.getAllAndOverride<string | undefined>(WEBHOOK_PROVIDER, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!provider) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer }>();
    const signatureHeader = providerHeader(provider);
    const signature = request.headers[signatureHeader];
    const supplied = Array.isArray(signature) ? signature[0] : signature;
    const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
    // A signature over a re-serialized body is not a signature over the request.
    // Fail closed until the Fastify raw-body capture has supplied the original bytes.
    const rawBody = request.rawBody;
    if (!secret || typeof supplied !== "string" || !rawBody || !verifySignature(rawBody, supplied, secret)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }
    return true;
  }
}

export function verifySignature(body: Buffer, supplied: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest();
  const normalized = supplied.startsWith("sha256=") ? supplied.slice(7) : supplied;
  if (!/^[0-9a-f]{64}$/i.test(normalized)) return false;
  const right = Buffer.from(normalized, "hex");
  return expected.length === right.length && timingSafeEqual(expected, right);
}

function providerHeader(provider: string): string {
  return provider.toLowerCase() === "zarinpal" ? "x-zarinpal-signature" : "x-webhook-signature";
}
