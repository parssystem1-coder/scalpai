import { describe, expect, it, vi } from "vitest";
import { ZarinpalAdapter, type ZarinpalHttpClient } from "./zarinpal.adapter.js";

const env = { ZARINPAL_MERCHANT_ID: "merchant", ZARINPAL_GATEWAY_URL: "https://gateway/" };
function client(json: unknown, status = 200, ok = true): ZarinpalHttpClient { return { post: vi.fn().mockResolvedValue({ status, ok, json: async () => json }) }; }

describe("ZarinpalAdapter", () => {
  it("creates a gateway redirect", async () => {
    const result = await new ZarinpalAdapter(client({ data: { code: 100, authority: "A-1" } }, 200, true), env).requestPayment("i-1", 1000, "https://app/callback");
    expect(result).toBe("https://gateway/A-1");
  });
  it("rejects failed request", async () => {
    await expect(new ZarinpalAdapter(client({ data: { code: -9 } }), env).requestPayment("i-1", 1000, "cb")).rejects.toThrow("request failed");
  });
  it("verifies a payment", async () => {
    const result = await new ZarinpalAdapter(client({ data: { code: 100, ref_id: 55 } }), env).verifyPayment("A-1", 1000);
    expect(result).toMatchObject({ verified: true, refId: "55" });
  });
  it("treats an already verified payment as idempotently successful", async () => {
    await expect(new ZarinpalAdapter(client({ data: { code: 101, ref_id: 55 } }), env).verifyPayment("A-1", 1000)).resolves.toMatchObject({ verified: true, reason: "already-verified" });
  });
  it("reports failed verification", async () => {
    await expect(new ZarinpalAdapter(client({ data: { code: -21 } }), env).verifyPayment("A-1", 1000)).resolves.toMatchObject({ verified: false });
  });
});
