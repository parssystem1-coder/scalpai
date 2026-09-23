import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "../types.js";
import type { HttpClientPort } from "./http-client.port.js";
import { SmsIrAdapter } from "./smsir.adapter.js";

const message: OutboundMessage = { channel: "smsir", to: "09120000000", body: "یادآوری نوبت", locale: "fa", idempotencyKey: "m-1" };
const env = { SMSIR_API_KEY: "key", SMSIR_SENDER: "+983000505" };

describe("SmsIrAdapter", () => {
  it("posts the verify-send form with line, text and mobiles", async () => {
    const post = vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ status: 1, data: { messageId: 4032 } }) });
    const result = await new SmsIrAdapter({ post } as HttpClientPort).send(message, env);
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toBe("https://api.sms.ir/v1/send/verify");
    const body = post.mock.calls[0]?.[1] as URLSearchParams;
    expect(body.get("lineNumber")).toBe("+983000505");
    expect(body.get("messageText")).toBe(message.body);
    expect(body.get("mobiles")).toBe("09120000000");
    expect(post.mock.calls[0]?.[2]).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({ outcome: "accepted", provider: "smsir", providerMessageId: "4032" });
  });

  it("maps payload status 2 to a blocked receptor without retry", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ status: 2 }) }) } as HttpClientPort;
    await expect(new SmsIrAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "blocked-receptor", retryable: false });
  });

  it("maps insufficient credit as non-retryable (aligning with Kavenegar)", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({ status: 3 }) }) } as HttpClientPort;
    await expect(new SmsIrAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "insufficient-credit", retryable: false });
  });

  it("trusts the HTTP status over a contradictory provider body", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 500, ok: false, json: async () => ({ status: 1, data: { messageId: 1 } }) }) } as HttpClientPort;
    await expect(new SmsIrAdapter(http).send(message, env)).resolves.toMatchObject({ outcome: "rejected", reason: "provider-error", retryable: true });
  });

  it("marks transport 429 as retryable regardless of body", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 429, ok: false, json: async () => ({}) }) } as HttpClientPort;
    await expect(new SmsIrAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "rate-limited", retryable: true });
  });

  it("rejects malformed provider responses without exposing provider text", async () => {
    const http = { post: vi.fn().mockResolvedValue({ status: 200, ok: true, json: async () => ({}) }) } as HttpClientPort;
    await expect(new SmsIrAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "invalid-provider-response", retryable: true });
  });

  it("maps transport failures to a safe retryable reason", async () => {
    const http = { post: vi.fn().mockRejectedValue(new Error("mobile 09120000000 leaked by provider")) } as HttpClientPort;
    await expect(new SmsIrAdapter(http).send(message, env)).resolves.toMatchObject({ reason: "provider-unreachable", retryable: true });
  });

  it("does not call HTTP when credentials are missing", async () => {
    const post = vi.fn();
    await expect(new SmsIrAdapter({ post } as HttpClientPort).send(message, { SMSIR_API_KEY: "key" })).resolves.toMatchObject({ reason: "not-configured" });
    expect(post).not.toHaveBeenCalled();
  });

  it("rejects a body longer than the SMS cap before any HTTP call", async () => {
    const post = vi.fn();
    const long: OutboundMessage = { ...message, body: "x".repeat(481) };
    await expect(new SmsIrAdapter({ post } as HttpClientPort).send(long, env)).resolves.toMatchObject({ reason: "body-too-long" });
    expect(post).not.toHaveBeenCalled();
  });

  it("is one-way SMS: no inbound and no opt-in requirement", () => {
    const adapter = new SmsIrAdapter();
    expect(adapter.capabilities.supportsInbound).toBe(false);
    expect(adapter.capabilities.requiresOptIn).toBe(false);
    expect(adapter.parseInbound({ mobile: "09120000000", messageText: "payload never escapes" })).toBeNull();
  });
});
