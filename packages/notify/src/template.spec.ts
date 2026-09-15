import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template.js";

describe("safe notification templates", () => {
  const options = { locale: "fa" as const, channel: "kavenegar" as const, maxChars: 480 };

  it("does not allow patient identity or phone interpolation", () => {
    expect(() => renderTemplate("aftercare.day1", { firstName: "بیمار", clinicName: "Clinic" }, options)).toThrow();
    expect(() => renderTemplate("aftercare.day1", { clinicName: "09120000000" }, options)).toThrow("phone");
  });

  it("does not recursively evaluate injected placeholders", () => {
    const rendered = renderTemplate("aftercare.day1", { clinicName: "{{phone}}" }, options);
    expect(rendered.body).toContain("{{phone}}");
  });

  it("requires declared values and enforces the channel limit", () => {
    expect(() => renderTemplate("aftercare.day1", {}, options)).toThrow("missing");
    expect(() => renderTemplate("aftercare.day1", { clinicName: "x" }, { ...options, maxChars: 1 })).toThrow("over");
  });
});
