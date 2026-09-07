import { describe, expect, it, beforeEach } from "vitest";
import { LATENCY_BUCKETS_SECONDS, MetricsRegistry, SERIES_LIMIT, normalizeMetricPath } from "./metrics.js";

describe("L3 - metric labels are closed, so a scan cannot explode the registry", () => {
  it("collapses identifiers into a single series", () => {
    expect(normalizeMetricPath("/api/v1/patients/6f1c4a6e-6d1e-4c3a-9a1f-2b7c8d9e0f11/notes")).toBe(
      "/api/v1/patients/:id/notes",
    );
    expect(normalizeMetricPath("/api/v1/sessions/42")).toBe("/api/v1/sessions/:n");
    expect(normalizeMetricPath("/api/v1/gallery/img_01H9XQ4Z8K2M7")).toBe("/api/v1/gallery/:id");
  });

  it("drops the query string - a search term is patient data", () => {
    expect(normalizeMetricPath("/api/v1/patients?q=Ali")).toBe("/api/v1/patients");
  });

  it("keeps static routes readable", () => {
    expect(normalizeMetricPath("/api/v1/health/ready")).toBe("/api/v1/health/ready");
    expect(normalizeMetricPath("/")).toBe("/");
  });
});

describe("L3 - the registry counts requests, errors and latency", () => {
  let registry: MetricsRegistry;
  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it("renders a counter, a histogram and the process gauges", () => {
    registry.observeHttp({ method: "get", path: "/api/v1/patients", status: 200, durationMs: 120 });
    registry.observeHttp({ method: "GET", path: "/api/v1/patients", status: 200, durationMs: 90 });
    const text = registry.render();
    expect(text).toContain('scalpai_http_requests_total{method="GET",path="/api/v1/patients",status="200"} 2');
    expect(text).toContain("# TYPE scalpai_http_request_duration_seconds histogram");
    expect(text).toContain('scalpai_http_request_duration_seconds_count{method="GET",path="/api/v1/patients"} 2');
    expect(text).toContain("scalpai_process_uptime_seconds");
  });

  it("counts 5xx separately - that is the number an alert fires on", () => {
    registry.observeHttp({ method: "POST", path: "/api/v1/sync/push", status: 500, durationMs: 10 });
    expect(registry.render()).toContain('scalpai_http_server_errors_total{path="/api/v1/sync/push"} 1');
  });

  it("puts an observation in every bucket at or above it", () => {
    registry.observe("scalpai_test_seconds", 0.2);
    const text = registry.render();
    const first = LATENCY_BUCKETS_SECONDS[0]!;
    expect(text).toContain(`scalpai_test_seconds_bucket{le="${first}"} 0`);
    expect(text).toContain('scalpai_test_seconds_bucket{le="0.25"} 1');
    expect(text).toContain('scalpai_test_seconds_bucket{le="+Inf"} 1');
  });

  it("caps the series count instead of growing without bound", () => {
    for (let i = 0; i < SERIES_LIMIT + 50; i++) {
      registry.counter("scalpai_test_total", { series: String(i) });
    }
    const snapshot = registry.snapshot();
    expect(snapshot.series).toBeLessThanOrEqual(SERIES_LIMIT);
    expect(snapshot.dropped).toBeGreaterThan(0);
    expect(registry.render()).toContain("scalpai_metrics_series_dropped_total");
  });

  it("still increments a series that already exists once full", () => {
    for (let i = 0; i < SERIES_LIMIT; i++) registry.counter("scalpai_test_total", { series: String(i) });
    registry.counter("scalpai_test_total", { series: "0" });
    expect(registry.render()).toContain('scalpai_test_total{series="0"} 2');
  });
});
