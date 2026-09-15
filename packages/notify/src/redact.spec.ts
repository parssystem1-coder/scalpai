import { describe, expect, it } from "vitest";
import { assertVarsRedacted, previewBody, redactVars, scrubNotificationText } from "./redact.js";

describe("notification redaction", () => {
  it("scrubs Iranian phone variants and long digit runs", () => {
    const text = scrubNotificationText("0912-000-0000 +98 912 000 0000 ۰۰۹۸۹۱۲۰۰۰۰۰۰۰ 123456789");
    expect(text).not.toMatch(/0912|912|123456789/);
    expect(previewBody("patient 09120000000 email@example.test")).not.toContain("09120000000");
  });

  it("drops sensitive keys but keeps money and counters", () => {
    expect(redactVars({ firstName: "بیمار", amount: 5_000_000, clinicName: "Clinic" })).toEqual({ amount: 5_000_000, clinicName: "Clinic" });
    expect(() => assertVarsRedacted({ phone: "09120000000" })).toThrow("PHI");
    expect(() => assertVarsRedacted({ amount: 5_000_000, clinicName: "Clinic" })).not.toThrow();
  });
});
