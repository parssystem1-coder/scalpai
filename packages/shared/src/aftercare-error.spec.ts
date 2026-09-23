import { describe, expect, it } from "vitest";
import { MESSAGE_ERROR_CODES, sanitizeMessageError } from "./aftercare.js";

describe("sanitizeMessageError", () => {
  it.each(MESSAGE_ERROR_CODES)("keeps closed-set code %s", (code) => {
    expect(sanitizeMessageError(code)).toBe(code);
  });

  it("maps AdapterNotImplementedError text to adapter-not-implemented", () => {
    expect(sanitizeMessageError("notify: adapter 'bale' is a stub and refuses to run in production")).toBe(
      "adapter-not-implemented",
    );
  });

  it("maps timeout wording without keeping the rest", () => {
    expect(sanitizeMessageError("AbortError: provider timeout after 10000ms")).toBe("provider-timeout");
  });

  it("never stores a phone number or provider body", () => {
    const stored = sanitizeMessageError("receptor 09121234567 rejected: متن خام پروایدر");
    expect(stored).toBe("send-failed");
    expect(stored).not.toMatch(/\d{8,}/);
    expect(MESSAGE_ERROR_CODES).toContain(stored);
  });
});
