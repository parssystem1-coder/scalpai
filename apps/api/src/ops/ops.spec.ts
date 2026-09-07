import { describe, expect, it, vi, afterEach } from "vitest";
import { clearRequestObservers, emitRequestFinished, onRequestFinished } from "../common/logging.js";
import { metrics } from "../common/metrics.js";
import { handleFinishedRequest, installObservability, resetObservabilityInstallation } from "./observability.js";
import { evaluateReadiness, runProbe } from "./readiness.js";
import { extractBearer, metricsAuthorized } from "./scrape-auth.js";

afterEach(() => {
  clearRequestObservers();
  resetObservabilityInstallation();
  metrics.reset();
  vi.unstubAllGlobals();
});

describe("L3 - readiness answers 'can this instance serve', not 'is the process alive'", () => {
  it("is ready when both dependencies answer", async () => {
    const report = await evaluateReadiness({
      database: async () => 1,
      sharedState: async () => 1,
    });
    expect(report).toMatchObject({ ok: true, status: "ready" });
    expect(report.checks.database.ok).toBe(true);
  });

  it("is unavailable when the database is down - that instance must leave rotation", async () => {
    const report = await evaluateReadiness({
      database: async () => {
        throw new Error("connection terminated unexpectedly");
      },
      sharedState: async () => 1,
    });
    expect(report.ok).toBe(false);
    expect(report.status).toBe("unavailable");
    expect(report.checks.database.error).toContain("connection terminated");
  });

  it("is degraded - not down - when only the shared state blinks", async () => {
    const report = await evaluateReadiness({
      database: async () => 1,
      sharedState: async () => {
        throw new Error("redis unavailable");
      },
    });
    expect(report.ok).toBe(true);
    expect(report.status).toBe("degraded");
  });

  it("never hangs on a probe that never settles", async () => {
    const result = await runProbe(() => new Promise(() => {}), 20);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
  });

  it("scrubs a driver message instead of echoing the value that collided", async () => {
    const result = await runProbe(async () => {
      throw new Error("duplicate key value violates unique constraint: phone=09121234567");
    }, 100);
    expect(result.error).not.toContain("09121234567");
  });
});

describe("L3 - the access log feeds metrics, and only a 5xx pages", () => {
  it("counts every request and pages on a server error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    process.env.ALERT_WEBHOOK_URL = "https://alerts.example/hook";

    handleFinishedRequest({
      requestId: "req-abcdefgh",
      method: "GET",
      path: "/api/v1/patients",
      status: 200,
      durationMs: 12,
    });
    handleFinishedRequest({
      requestId: "req-ijklmnop",
      method: "POST",
      path: "/api/v1/sync/push",
      status: 500,
      durationMs: 30,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const text = metrics.render();
    expect(text).toContain('scalpai_http_requests_total{method="GET",path="/api/v1/patients",status="200"} 1');
    expect(text).toContain('scalpai_http_server_errors_total{path="/api/v1/sync/push"} 1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete process.env.ALERT_WEBHOOK_URL;
  });

  it("registers exactly one observer however often it is installed", () => {
    let seen = 0;
    onRequestFinished(() => {
      seen += 1;
    });
    installObservability();
    installObservability();
    emitRequestFinished({ requestId: "r", method: "GET", path: "/x", status: 200, durationMs: 1 });
    expect(seen).toBe(1);
    expect(metrics.render()).toContain('scalpai_http_requests_total{method="GET",path="/x",status="200"} 1');
  });

  it("never lets a broken observer fail the request", () => {
    onRequestFinished(() => {
      throw new Error("observer exploded");
    });
    expect(() =>
      emitRequestFinished({ requestId: "r", method: "GET", path: "/x", status: 200, durationMs: 1 }),
    ).not.toThrow();
  });
});

describe("L3 - the scrape endpoint is closed by default", () => {
  it("refuses everything when no token is configured", () => {
    expect(metricsAuthorized("Bearer whatever", null)).toBe(false);
  });

  it("accepts only the exact token", () => {
    const token = "0123456789abcdef01";
    expect(metricsAuthorized(`Bearer ${token}`, token)).toBe(true);
    expect(metricsAuthorized(token, token)).toBe(true);
    expect(metricsAuthorized("Bearer 0123456789abcdef02", token)).toBe(false);
    expect(metricsAuthorized("Bearer short", token)).toBe(false);
    expect(metricsAuthorized(undefined, token)).toBe(false);
  });

  it("tolerates a header without the Bearer prefix or with odd spacing", () => {
    expect(extractBearer("bearer   abc")).toBe("abc");
    expect(extractBearer(" abc ")).toBe("abc");
    expect(extractBearer(42)).toBe("");
  });
});
