import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "../types.js";
import { KavenegarAdapter } from "./kavenegar.adapter.js";
import type { HttpClientPort } from "./http-client.port.js";

const message: OutboundMessage = { channel: "kavenegar", to: "09120000000", body: "پیام آزمایشی", locale: "fa", idempotencyKey: "m-1" };
const env = { KAVENEGAR_API_KEY: "key", KAVENEGAR_SENDER: "1000" };

describe("KavenegarAdapter", () => {
  it("posts the provider form, timeout signal and idempotency key", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ return: { status: 200 }, entries: [{ messageid: 42 }] }) });
    const result = await new KavenegarAdapter({ post } as HttpClientPort).send(message, env);
    expect(post).toHaveBeenCalledOnce();
    const body = post.mock.calls[0]?.[1] as URLSearchParams;
    expect(body.get("receptor")).toBe(message.to);
    expect(body.get("message")).toBe(message.body);
    expect(body.get("localid")).toBe(message.idempotencyKey);
    expect(post.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ outcome: "accepted", providerMessageId: "42" });
  });

  it("maps invalid receptor/provider rejection without retry", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ return: { status: 414 } }) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "blocked-receptor", retryable: false });
  });

  it("marks rate limits as retryable", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => ({ return: { status: 429 } }) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "rate-limited", retryable: true });
  });

  it("trusts the HTTP status over a contradictory provider body", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({ return: { status: 200 }, entries: [{ messageid: 42 }] }) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "provider-error", retryable: true });
  });

  it("does not accept a 502 gateway page that carries no provider body", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 502, ok: false, json: async () => ({}) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "provider-error", retryable: true });
  });

  it("rejects malformed provider responses without exposing provider text", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "invalid-provider-response", retryable: true });
  });

  it("maps transport failures to a safe retryable reason", async () => {
    const http = { post: vi.fn().mockRejectedValue(new Error("patient 09120000000 leaked by provider")) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "provider-unreachable", retryable: true });
  });

  it("does not call HTTP when credentials are missing", async () => {
    const post = vi.fn();
    await expect(new KavenegarAdapter({ post } as HttpClientPort).send(message, {})).resolves.toMatchObject({ reason: "not-configured" });
    expect(post).not.toHaveBeenCalled();
  });

  it("returns a normalized inbound envelope", () => {
    expect(new KavenegarAdapter().parseInbound({ from: "0912", message: "سلام", messageid: 7 })).toMatchObject({ channel: "kavenegar", from: "0912", body: "سلام", providerMessageId: "7" });
  });
});
