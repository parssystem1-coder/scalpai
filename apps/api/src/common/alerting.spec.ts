import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertSink, buildAlertPayload } from "./alerting.js";
import type { AlertConfig } from "./observability.config.js";

const config = (over: Partial<AlertConfig> = {}): AlertConfig => ({
  webhookUrl: "https://alerts.example/hook",
  minSeverity: "warning",
  dedupeMs: 60_000,
  timeoutMs: 1_000,
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("L3 - an alert never carries patient data", () => {
  it("keeps only allowlisted keys and scrubs their values", () => {
    const payload = buildAlertPayload(
      {
        event: "http.server_error",
        severity: "critical",
        requestId: "req-12345678",
        status: 500,
        path: "/api/v1/patients",
        detail: "duplicate key value violates unique constraint, phone=09121234567",
      },
      { NODE_ENV: "production" },
    );
    expect(payload.event).toBe("http.server_error");
    expect(payload.environment).toBe("production");
    expect(payload.status).toBe(500);
    expect(JSON.stringify(payload)).not.toContain("09121234567");
  });

  it("ignores anything not on the allowlist", () => {
    const smuggled = {
      event: "x",
      severity: "info",
      notes: "patient has a scalp condition",
      email: "owner@clinic-a.test",
    } as unknown as Parameters<typeof buildAlertPayload>[0];
    const payload = buildAlertPayload(smuggled, { NODE_ENV: "test" });
    expect(Object.keys(payload).sort()).toEqual(["at", "environment", "event", "severity", "source"]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("scalp condition");
    expect(serialized).not.toContain("owner@clinic-a.test");
  });
});

describe("L3 - delivery is filtered, deduped and never fatal", () => {
  it("posts JSON to the webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const sink = new AlertSink(() => config());
    await expect(sink.notify({ event: "backup.failed", severity: "critical" })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://alerts.example/hook");
    expect(String(init.body)).toContain('"event":"backup.failed"');
  });

  it("sends one page per window for the same failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const sink = new AlertSink(() => config());
    for (let i = 0; i < 3; i++) {
      await sink.notify({ event: "http.server_error", severity: "critical", path: "/api/v1/sync/push" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops events below the configured severity", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    const sink = new AlertSink(() => config({ minSeverity: "critical" }));
    await expect(sink.notify({ event: "noise", severity: "warning" })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is a no-op when no sink is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const sink = new AlertSink(() => config({ webhookUrl: null }));
    await expect(sink.notify({ event: "x", severity: "critical" })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("swallows a dead webhook instead of failing the request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const sink = new AlertSink(() => config());
    await expect(sink.notify({ event: "backup.failed", severity: "critical" })).resolves.toBe(false);
  });

  it("reports a rejected delivery without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const sink = new AlertSink(() => config());
    await expect(sink.notify({ event: "backup.failed", severity: "critical" })).resolves.toBe(false);
  });

  it("survives an invalid configuration without throwing", async () => {
    const sink = new AlertSink(() => {
      throw new Error("ALERT_WEBHOOK_URL is not a valid URL");
    });
    await expect(sink.notify({ event: "x", severity: "critical" })).resolves.toBe(false);
  });
});
