import { describe, expect, it } from "vitest";
import { LINK_MAX_TTL_MS, MESSAGE_TEMPLATES, renderTemplate, renderTemplateLink } from "./template.js";

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

  it("still refuses raw links passed as plain variables (D18 rule intact)", () => {
    expect(() => renderTemplate("aftercare.day1", { clinicName: "https://evil.example.ir" }, options)).toThrow("raw link");
  });
});

describe("tokenized expiring links (D18 / §13)", () => {
  const base = "https://portal.clinic-a.example.ir";
  const allowlist = new Map([[base, base]]);
  const token = "ABCDEFGHJKLMNPQRSTUVWXYZ234567ABCDEFGH";
  const future = new Date(Date.now() + 60 * 60 * 1000);

  it("renderTemplateLink builds https link with token and exp query", () => {
    const link = renderTemplateLink("session.reminder", "visit", { base, path: "ap/abc", token, expiresAt: future }, allowlist);
    expect(link.startsWith(`${base}/ap/abc?token=${token}&exp=`)).toBe(true);
  });

  it("refuses a base outside the allow-list", () => {
    expect(() => renderTemplateLink("session.reminder", "visit", { base: "https://evil.example.ir", token, expiresAt: future }, allowlist)).toThrow("allow-listed");
  });

  it("refuses an http (non-https) base", () => {
    const httpAllowlist = new Map([["http://portal.example.ir", "http://portal.example.ir"]]);
    expect(() => renderTemplateLink("session.reminder", "visit", { base: "http://portal.example.ir", token, expiresAt: future }, httpAllowlist)).toThrow("https");
  });

  it("refuses an already-expired link and one beyond the 30-day ceiling", () => {
    const past = new Date(Date.now() - 1000);
    expect(() => renderTemplateLink("session.reminder", "visit", { base, token, expiresAt: past }, allowlist)).toThrow("expired");
    const tooFar = new Date(Date.now() + LINK_MAX_TTL_MS + 60_000);
    expect(() => renderTemplateLink("session.reminder", "visit", { base, token, expiresAt: tooFar }, allowlist)).toThrow("expiry");
  });

  it("refuses unsafe paths and weak tokens", () => {
    expect(() => renderTemplateLink("session.reminder", "visit", { base, path: "../../admin", token, expiresAt: future }, allowlist)).toThrow("unsafe");
    expect(() => renderTemplateLink("session.reminder", "visit", { base, path: "a?b=1", token, expiresAt: future }, allowlist)).toThrow("unsafe");
    expect(() => renderTemplateLink("session.reminder", "visit", { base, token: "short", expiresAt: future }, allowlist)).toThrow("token");
  });

  it("refuses an empty allow-list — no base, no link (fail-closed)", () => {
    expect(() => renderTemplateLink("session.reminder", "visit", { base, token, expiresAt: future }, new Map())).toThrow("allow-listed");
  });

  it("a links entry whose name the template does not declare breaks the render", () => {
    expect(() =>
      renderTemplate("session.reminder", { clinicName: "x", when: "۱۲ مهر" }, {
        locale: "fa",
        channel: "kavenegar",
        maxChars: 480,
        links: { unknownVar: { base, token, expiresAt: future } },
        linkBaseAllowlist: allowlist,
      }),
    ).toThrow("does not declare");
  });

  it("MESSAGE_TEMPLATES remain link-free — the §13 placeholder goes through options.links only", () => {
    for (const template of Object.values(MESSAGE_TEMPLATES)) {
      expect(template.vars).not.toContain("visit");
    }
  });
});
