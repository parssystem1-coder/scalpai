import { afterEach, describe, expect, it } from "vitest";
import { resolveAlertConfig, resolveMetricsToken } from "./observability.config.js";

const ORIGINAL = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = ORIGINAL;
});

describe("L3 - production refuses to boot without an alert sink", () => {
  it("accepts an http(s) webhook", () => {
    const cfg = resolveAlertConfig({ ALERT_WEBHOOK_URL: "https://alerts.example/hook", NODE_ENV: "production" });
    expect(cfg.webhookUrl).toBe("https://alerts.example/hook");
    expect(cfg.minSeverity).toBe("warning");
  });

  it("rejects a non-URL and a non-http scheme", () => {
    expect(() => resolveAlertConfig({ ALERT_WEBHOOK_URL: "not a url" })).toThrow(/valid URL/);
    expect(() => resolveAlertConfig({ ALERT_WEBHOOK_URL: "file:///tmp/alerts" })).toThrow(/http/);
  });

  it("fails closed in production when the sink is missing", () => {
    process.env.NODE_ENV = "production";
    expect(() => resolveAlertConfig({ NODE_ENV: "production" })).toThrow(/ALERT_WEBHOOK_URL is required/);
  });

  it("stays optional outside production", () => {
    process.env.NODE_ENV = "test";
    expect(resolveAlertConfig({ NODE_ENV: "test" }).webhookUrl).toBeNull();
  });

  it("treats a missing metrics token as a disabled endpoint, and a weak one as an error", () => {
    expect(resolveMetricsToken({})).toBeNull();
    expect(() => resolveMetricsToken({ METRICS_TOKEN: "short" })).toThrow(/16 characters/);
    expect(resolveMetricsToken({ METRICS_TOKEN: "0123456789abcdef01" })).toBe("0123456789abcdef01");
  });
});
