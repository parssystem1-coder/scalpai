import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./webhook.guard.js";

describe("WebhookGuard signature verification", () => {
  const secret = "webhook-secret";
  const body = Buffer.from('{"event":"paid"}');
  const digest = createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a valid signature", () => expect(verifySignature(body, digest, secret)).toBe(true));
  it("accepts the common sha256= prefix", () => expect(verifySignature(body, `sha256=${digest}`, secret)).toBe(true));
  it("rejects a tampered body", () => expect(verifySignature(Buffer.from('{"event":"failed"}'), digest, secret)).toBe(false));
  it("rejects a wrong secret", () => expect(verifySignature(body, digest, "other-secret")).toBe(false));
  it("rejects a missing signature", () => expect(verifySignature(body, "", secret)).toBe(false));
  it("rejects a different-length signature safely", () => expect(verifySignature(body, digest.slice(0, -1), secret)).toBe(false));
});
