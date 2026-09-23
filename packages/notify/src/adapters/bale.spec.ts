import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "../types.js";
import type { HttpClientPort } from "./http-client.port.js";
import { BaleAdapter } from "./bale.adapter.js";

const message: OutboundMessage = { channel: "bale", to: "12345", body: "یادآوری نوبت", locale: "fa", idempotencyKey: "m-1" };
const env = { BALE_BOT_TOKEN: "token" };

describe("BaleAdapter", () => {
  it("posts the Bot API sendMessage form with chat_id and text", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true, result: { message_id: 77 } }) });
    const result = await new BaleAdapter({ post } as HttpClientPort).send(message, env);
    expect(post).toHaveBeenCalledOnce();
    const url = post.mock.calls[0]?.[0] as string;
    expect(url).toBe("https://tapi.bale.ai/bottoken/sendMessage");
    const body = post.mock.calls[0]?.[1] as URLSearchParams;
    expect(body.get("chat_id")).toBe("12345");
    expect(body.get("text")).toBe(message.body);
    expect(post.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ outcome: "accepted", provider: "bale", providerMessageId: "77" });
  });

  it("maps a 403 block to a non-retryable rejection", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 403, ok: false, json: async () => ({ ok: false, error_code: 403, description: "bot was blocked" }) }) } as HttpClientPort;
    await expect(new BaleAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "blocked-receptor", retryable: false });
  });

  it("marks rate limits (429 and retry_after) as retryable", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => ({ ok: false, error_code: 429, parameters: { retry_after: 3 } }) }) } as HttpClientPort;
    await expect(new BaleAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "rate-limited", retryable: true });
  });

  it("trusts the HTTP status over a contradictory provider body", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({ ok: true, result: { message_id: 1 } }) }) } as HttpClientPort;
    await expect(new BaleAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "provider-error", retryable: true });
  });

  it("does not accept a 502 gateway page that carries no provider body", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 502, ok: false, json: async () => { throw new Error("unexpected token"); } }) } as HttpClientPort;
    await expect(new BaleAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "provider-error", retryable: true });
  });

  it("refuses an ambiguous ok:true without a message_id", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ ok: true }) }) } as HttpClientPort;
    await expect(new BaleAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "invalid-provider-response", retryable: true });
  });

  it("maps transport failures to a safe retryable reason", async () => {
    const http = { post: vi.fn().mockRejectedValue(new Error("chat 12345 leaked by provider")) } as HttpClientPort;
    await expect(new BaleAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "provider-unreachable", retryable: true });
  });

  it("does not call HTTP when credentials are missing", async () => {
    const post = vi.fn();
    await expect(new BaleAdapter({ post } as HttpClientPort).send(message, {})).resolves.toMatchObject({ reason: "not-configured" });
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects a body longer than the messenger cap before any HTTP call", async () => {
    const post = vi.fn();
    const long: OutboundMessage = { ...message, body: "x".repeat(4097) };
    await expect(new BaleAdapter({ post } as HttpClientPort).send(long, env)).resolves.toMatchObject({ reason: "body-too-long" });
    expect(post).not.toHaveBeenCalled();
  });

  it("requires opt-in by capability so the router never picks Bale for a silent recipient", () => {
    expect(new BaleAdapter().capabilities.requiresOptIn).toBe(true);
  });

  it("returns a normalized inbound envelope from a Bot API update", () => {
    expect(new BaleAdapter().parseInbound({ message: { chat: { id: 12345 }, text: "سلام", message_id: 9, date: "2026-09-23" } })).toMatchObject({ channel: "bale", from: "12345", body: "سلام", providerMessageId: "9" });
  });

  it("returns null for updates without a text message", () => {
    expect(new BaleAdapter().parseInbound({ message: { chat: { id: 1 } } })).toBeNull();
    expect(new BaleAdapter().parseInbound({ update_id: 5 })).toBeNull();
  });
});
