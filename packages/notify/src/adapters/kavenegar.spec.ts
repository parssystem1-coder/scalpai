import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "../types.js";
import { KavenegarAdapter } from "./kavenegar.adapter.js";
import type { HttpClientPort } from "./http-client.port.js";

const message: OutboundMessage = { channel: "kavenegar", to: "09120000000", body: "پیام آزمایشی", locale: "fa", idempotencyKey: "m-1" };
const env = { KAVENEGAR_API_KEY: "key", KAVENEGAR_SENDER: "1000" };

describe("KavenegarAdapter", () => {
  it("posts the provider form and returns the provider id", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ return: { status: 200 }, entries: [{ messageid: 42 }] }) });
    const result = await new KavenegarAdapter({ post } as HttpClientPort).send(message, env);
    expect(post).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ outcome: "accepted", providerMessageId: "42" });
  });
  it("maps invalid receptor/provider rejection without retry", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ return: { status: 414 } }) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "blocked-receptor", retryable: false });
  });
  it("marks rate limits as retryable", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => ({}) }) } as HttpClientPort;
    await expect(new KavenegarAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "rate-limited", retryable: true });
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
