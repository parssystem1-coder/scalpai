import { describe, expect, it, vi } from "vitest";
import { ZarinpalAdapter, type ZarinpalHttpClient } from "./zarinpal.adapter.js";

const env = { ZARINPAL_MERCHANT_ID: "merchant", ZARINPAL_GATEWAY_URL: "https://gateway/" };
function client(json: unknown, status = 200, ok = true): ZarinpalHttpClient {
  return { post: vi.fn().mockResolvedValue({ status, ok, json: async () => json }) };
}

describe("ZarinpalAdapter", () => {
  it("creates a gateway redirect and sends the expected payment parameters", async () => {
    const http = client({ data: { code: 100, authority: "A-1" } });
    const result = await new ZarinpalAdapter(http, env).requestPayment("i-1", 1000, "https://app/callback");
    expect(result).toBe("https://gateway/A-1");
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining("payment/request"),
      expect.objectContaining({ merchant_id: "merchant", amount: 1000, callback_url: "https://app/callback" }),
      expect.any(AbortSignal),
    );
  });

  it("rejects failed request with a safe error", async () => {
    await expect(new ZarinpalAdapter(client({ data: { code: -9 } }), env).requestPayment("i-1", 1000, "cb")).rejects.toThrow("request failed");
  });

  it("verifies a payment", async () => {
    const result = await new ZarinpalAdapter(client({ data: { code: 100, ref_id: 55 } }), env).verifyPayment("A-1", 1000);
    expect(result).toMatchObject({ verified: true, refId: "55" });
  });

  it("treats an already verified payment as idempotently successful", async () => {
    await expect(new ZarinpalAdapter(client({ data: { code: 101, ref_id: 55 } }), env).verifyPayment("A-1", 1000)).resolves.toMatchObject({ verified: true, reason: "already-verified" });
  });

  it("reports failed verification without provider payload", async () => {
    await expect(new ZarinpalAdapter(client({ data: { code: -21 }, errors: { description: "phone 09120000000" } }), env).verifyPayment("A-1", 1000)).resolves.toMatchObject({ verified: false, reason: "verification-failed" });
  });

  it("maps transport failures to a safe error", async () => {
    const http: ZarinpalHttpClient = { post: vi.fn().mockRejectedValue(new Error("raw provider body with phone 09120000000")) };
    await expect(new ZarinpalAdapter(http, env).verifyPayment("A-1", 1000)).rejects.toThrow("payment provider unreachable");
  });
});
