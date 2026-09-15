import "reflect-metadata";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InboundController } from "./inbound.controller.js";
import { WebhookGuard } from "../billing/webhook.guard.js";
import { TenantScope } from "../tenancy/tenant.scope.js";

const body = { channel: "kavenegar", from: "09120000000", body: "سلام", receivedAt: "2026-09-15T10:00:00.000Z" };
function signature(payload: unknown, secret: string): string { return createHmac("sha256", secret).update(Buffer.from(JSON.stringify(payload))).digest("hex"); }
function executionContext(handler: object, request: Record<string, unknown>) {
  return {
    getHandler: () => handler,
    getClass: () => InboundController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

/** WebhookGuard now needs DbService + TenantScope ALS store. */
function newGuard(dbOverrides?: { withClient: ReturnType<typeof vi.fn> }) {
  const db = dbOverrides ?? { withClient: vi.fn().mockResolvedValue(undefined) };
  return new WebhookGuard(new Reflector(), db as never);
}

describe("InboundController webhook security", () => {
  afterEach(() => {
    delete process.env.KAVENEGAR_WEBHOOK_SECRET;
    delete process.env.ZARINPAL_WEBHOOK_SECRET;
  });

  it("accepts a valid Kavenegar signature and binds tenant context", async () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const clinicId = "11111111-1111-1111-1111-111111111111";
    const db = { withClient: vi.fn().mockResolvedValue({ clinicId, active: true }) };
    const guard = newGuard(db);
    const handler = InboundController.prototype.ingestKavenegar;

    let result: boolean | undefined;
    await TenantScope.run(async () => {
      result = await guard.canActivate(executionContext(handler, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-webhook-signature": signature(body, "k-secret") } }));
    });

    expect(result).toBe(true);
    expect(db.withClient).toHaveBeenCalled();
  });

  it("rejects an invalid signature", async () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const guard = newGuard();
    await expect(
      TenantScope.run(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-webhook-signature": "bad" } })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a missing signature", async () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const guard = newGuard();
    await expect(
      TenantScope.run(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: {} })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects a tampered body even when the original signature is retained", async () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const guard = newGuard();
    await expect(
      TenantScope.run(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body: { ...body, body: "tampered" }, rawBody: Buffer.from(JSON.stringify({ ...body, body: "tampered" })), headers: { "x-webhook-signature": signature({ ...body, body: "original" }, "k-secret") } })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("rejects when provider is not registered in webhook_providers", async () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const db = { withClient: vi.fn().mockResolvedValue(undefined) };
    const guard = newGuard(db);
    await expect(
      TenantScope.run(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-webhook-signature": signature(body, "k-secret") } })),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("uses the provider-specific secret/header for Zarinpal", async () => {
    process.env.ZARINPAL_WEBHOOK_SECRET = "z-secret";
    const clinicId = "22222222-2222-2222-2222-222222222222";
    const db = { withClient: vi.fn().mockResolvedValue({ clinicId, active: true }) };
    const guard = newGuard(db);

    let result: boolean | undefined;
    await TenantScope.run(async () => {
      result = await guard.canActivate(executionContext(InboundController.prototype.ingestZarinpal, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-zarinpal-signature": signature(body, "z-secret") } }));
    });
    expect(result).toBe(true);
  });

  it("exposes rate-limit metadata for both webhook routes", () => {
    const metadataKey = "rate_limit";
    expect(Reflect.getMetadata(metadataKey, InboundController.prototype.ingestKavenegar)).toMatchObject({ name: "webhook-kavenegar", max: 600 });
    expect(Reflect.getMetadata(metadataKey, InboundController.prototype.ingestZarinpal)).toMatchObject({ name: "webhook-zarinpal", max: 600 });
  });
});
