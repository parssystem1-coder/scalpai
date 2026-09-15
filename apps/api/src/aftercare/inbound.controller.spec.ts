import "reflect-metadata";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi, afterEach } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import { InboundController } from "./inbound.controller.js";
import { WebhookGuard } from "../billing/webhook.guard.js";

const body = { channel: "kavenegar", from: "09120000000", body: "سلام", receivedAt: "2026-09-15T10:00:00.000Z" };
function signature(payload: unknown, secret: string): string { return createHmac("sha256", secret).update(Buffer.from(JSON.stringify(payload))).digest("hex"); }
function executionContext(handler: object, request: Record<string, unknown>) {
  return { getHandler: () => handler, switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe("InboundController webhook security", () => {
  afterEach(() => { delete process.env.KAVENEGAR_WEBHOOK_SECRET; delete process.env.ZARINPAL_WEBHOOK_SECRET; });

  it("accepts a valid Kavenegar signature and delegates ingestion", async () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const service = { ingestInbound: vi.fn().mockResolvedValue({ accepted: true }) };
    const controller = new InboundController(service as never);
    const handler = controller.ingestKavenegar;
    const guard = new WebhookGuard();
    expect(guard.canActivate(executionContext(handler, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-webhook-signature": signature(body, "k-secret") } }))).toBe(true);
    await expect(controller.ingestKavenegar(body as never)).resolves.toEqual({ accepted: true });
    expect(service.ingestInbound).toHaveBeenCalledWith(body);
  });
  it("rejects an invalid signature", () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const guard = new WebhookGuard();
    expect(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-webhook-signature": "bad" } }))).toThrow(UnauthorizedException);
  });
  it("rejects a missing signature", () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const guard = new WebhookGuard();
    expect(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: {} }))).toThrow(UnauthorizedException);
  });
  it("rejects a tampered body even when the original signature is retained", () => {
    process.env.KAVENEGAR_WEBHOOK_SECRET = "k-secret";
    const original = { ...body, body: "original" };
    const guard = new WebhookGuard();
    expect(() => guard.canActivate(executionContext(InboundController.prototype.ingestKavenegar, { body: { ...body, body: "tampered" }, rawBody: Buffer.from(JSON.stringify({ ...body, body: "tampered" })), headers: { "x-webhook-signature": signature(original, "k-secret") } }))).toThrow(UnauthorizedException);
  });
  it("uses the provider-specific secret/header for Zarinpal", () => {
    process.env.ZARINPAL_WEBHOOK_SECRET = "z-secret";
    const guard = new WebhookGuard();
    expect(guard.canActivate(executionContext(InboundController.prototype.ingestZarinpal, { body, rawBody: Buffer.from(JSON.stringify(body)), headers: { "x-zarinpal-signature": signature(body, "z-secret") } }))).toBe(true);
  });
  it("exposes rate-limit metadata for both webhook routes", () => {
    const metadataKey = "rate_limit";
    expect(Reflect.getMetadata(metadataKey, InboundController.prototype.ingestKavenegar)).toMatchObject({ name: "webhook-kavenegar", max: 600 });
    expect(Reflect.getMetadata(metadataKey, InboundController.prototype.ingestZarinpal)).toMatchObject({ name: "webhook-zarinpal", max: 600 });
  });
});
