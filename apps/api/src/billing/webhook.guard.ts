import { createHmac, timingSafeEqual } from "node:crypto";
import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { DbService, findActiveProvider } from "@scalpai/db";
import type { FastifyRequest } from "fastify";
import { TenantScope } from "../tenancy/tenant.scope.js";

const WEBHOOK_PROVIDER = "webhook-provider";
export const WebhookSignature = (provider: string): MethodDecorator & ClassDecorator => SetMetadata(WEBHOOK_PROVIDER, provider);

/**
 * Registered providers and the header each one signs with. This is an
 * allow-list on purpose: the previous default sent every unrecognised provider
 * to `x-webhook-signature`, so a typo in a decorator silently verified the
 * wrong header instead of failing closed.
 */
const PROVIDER_SIGNATURE_HEADERS: Readonly<Record<string, string>> = {
  kavenegar: "x-webhook-signature",
  zarinpal: "x-zarinpal-signature",
};

/**
 * شناسه سیستمی برای درخواست‌های وبهوک.
 *
 * وبهوک کاربر واقعی ندارد (Public route است)، ولی TenantScope نیاز به
 * userId دارد. از یک UUID ثابت استفاده می‌شود تا در audit log قابل
 * شناسایی باشد.
 */
const WEBHOOK_SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/** Verifies provider HMAC signatures before any webhook payload reaches business logic. */
@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const provider = this.reflector.getAllAndOverride<string | undefined>(WEBHOOK_PROVIDER, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!provider) return true;

    const request = context.switchToHttp().getRequest<FastifyRequest & { rawBody?: Buffer }>();
    const signatureHeader = providerHeader(provider);
    if (!signatureHeader) throw new UnauthorizedException("Unknown webhook provider");
    const signature = request.headers[signatureHeader];
    const supplied = Array.isArray(signature) ? signature[0] : signature;
    const secret = process.env[`${provider.toUpperCase()}_WEBHOOK_SECRET`];
    // A signature over a re-serialized body is not a signature over the request.
    // Fail closed until the Fastify raw-body capture has supplied the original bytes.
    const rawBody = request.rawBody;
    if (!secret || typeof supplied !== "string" || !rawBody || !verifySignature(rawBody, supplied, secret)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    // B1: tenant context binding — lookup provider → clinicId
    const record = await this.db.withClient((tx) =>
      findActiveProvider(tx, provider),
    );
    if (!record) {
      throw new UnauthorizedException("Webhook provider not registered");
    }

    // Pin clinicId onto the AsyncLocalStorage store so downstream
    // TenantScope.tx() / requireCtx() can access it.
    TenantScope.enter({
      clinicId: record.clinicId,
      userId: WEBHOOK_SYSTEM_USER_ID,
      role: "system",
    });

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

function providerHeader(provider: string): string | undefined {
  return PROVIDER_SIGNATURE_HEADERS[provider.trim().toLowerCase()];
}
