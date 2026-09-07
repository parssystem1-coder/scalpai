import { afterEach, describe, expect, it } from "vitest";
import { resolveAlertConfig, resolveMetricsToken } from "./observability.config.js";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

afterEach(() => {
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe("L3 - production refuses to boot without an alert sink", () => {
  it("accepts an http(s) webhook", () => {
    const cfg = resolveAlertConfig({ ALERT_WEBHOOK_URL: "https://alerts.example/hook", NODE_ENV: "production" });
    expect(cfg.webhookUrl).toBe("https://alerts.example/hook");
    expect(cfg.minSeverity).toBe("warning");
    expect(cfg.dedupeMs).toBeGreaterThan(0);
  });

  it("rejects a non-URL and a non-http scheme", () => {
    expect(() => resolveAlertConfig({ ALERT_WEBHOOK_URL: "not a url" })).toThrow(/valid URL/);
    expect(() => resolveAlertConfig({ ALERT_WEBHOOK_URL: "file:///tmp/alerts" })).toThrow(/http/);
  });

  it("fails closed in production when the sink is missing", () => {
    process.env.NODE_ENV = "production";
    expect(() => resolveAlertConfig({})).toThrow(/ALERT_WEBHOOK_URL is required/);
  });

  it("stays optional outside production", () => {
    process.env.NODE_ENV = "test";
    expect(resolveAlertConfig({}).webhookUrl).toBeNull();
  });

  it("honours an explicit severity floor", () => {
    expect(resolveAlertConfig({ ALERT_WEBHOOK_URL: "https://a.example/h", ALERT_MIN_SEVERITY: "critical" }).minSeverity).toBe(
      "critical",
    );
    expect(resolveAlertConfig({ ALERT_WEBHOOK_URL: "https://a.example/h", ALERT_MIN_SEVERITY: "nonsense" }).minSeverity).toBe(
      "warning",
    );
  });

  it("treats a missing metrics token as a disabled endpoint, and a weak one as an error", () => {
    expect(resolveMetricsToken({})).toBeNull();
    expect(() => resolveMetricsToken({ METRICS_TOKEN: "tooshort" })).toThrow(/16 characters/);
    expect(resolveMetricsToken({ METRICS_TOKEN: "a-long-enough-metrics-token" })).toBe("a-long-enough-metrics-token");
  });
});
