/**
 * Metrics (WEAKNESSES L3, ADR-0042).
 *
 * The stack had structured logs and nothing to graph: no request rate, no error
 * rate, no latency, no way to see a burst before a clinic calls. This is a
 * deliberately small in-process registry rendered as Prometheus text on
 * `/api/v1/metrics` - no new dependency, no push agent, no PHI.
 *
 * Two rules make it safe to expose:
 *  1. label values are CLOSED - the path is normalised (`/patients/:id`), so a
 *     scan of random URLs cannot explode the series count;
 *  2. the registry is capped. Past the cap, new series are dropped and counted,
 *     because an unbounded metric map is just a slower memory leak.
 */

export const SERIES_LIMIT = 2_000;

/** Seconds. Chosen around the SLOs that matter: interactive, slow, and "bad". */
export const LATENCY_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

export interface HttpObservation {
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_ID_RE = /^[A-Za-z0-9_-]{16,}$/;

/**
 * Path -> metric label. Identifiers become `:id` so `/patients/<uuid>` is one
 * series instead of one per patient (which would also leak how many there are).
 */
export function normalizeMetricPath(rawPath: string): string {
  const path = (rawPath.split("?")[0] ?? rawPath).replace(/\/+$/, "") || "/";
  const parts = path.split("/").map((segment) => {
    if (segment.length === 0) return segment;
    if (UUID_RE.test(segment)) return ":id";
    if (/^\d+$/.test(segment)) return ":n";
    if (LONG_ID_RE.test(segment) && /\d/.test(segment)) return ":id";
    return segment;
  });
  return parts.join("/") || "/";
}

function renderLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "";
  const body = entries.map(([k, v]) => `${k}="${v.replace(/([\\"])/g, "\\$1")}"`).join(",");
  return `{${body}}`;
}

function seriesKey(name: string, labels: Record<string, string>): string {
  return `${name}${renderLabels(labels)}`;
}

interface HistogramSeries {
  labels: Record<string, string>;
  counts: number[];
  sum: number;
  total: number;
}

export class MetricsRegistry {
  private counters = new Map<string, { name: string; labels: Record<string, string>; value: number }>();
  private gauges = new Map<string, { name: string; labels: Record<string, string>; value: number }>();
  private histograms = new Map<string, HistogramSeries>();
  private dropped = 0;

  private get size(): number {
    return this.counters.size + this.gauges.size + this.histograms.size;
  }

  private atCapacity(key: string): boolean {
    if (this.size < SERIES_LIMIT) return false;
    if (this.counters.has(key) || this.gauges.has(key) || this.histograms.has(key)) return false;
    this.dropped += 1;
    return true;
  }

  counter(name: string, labels: Record<string, string> = {}, by = 1): void {
    const key = seriesKey(name, labels);
    if (this.atCapacity(key)) return;
    const existing = this.counters.get(key);
    if (existing) existing.value += by;
    else this.counters.set(key, { name, labels, value: by });
  }

  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = seriesKey(name, labels);
    if (this.atCapacity(key)) return;
    this.gauges.set(key, { name, labels, value });
  }

  observe(name: string, seconds: number, labels: Record<string, string> = {}): void {
    const key = seriesKey(name, labels);
    if (this.atCapacity(key)) return;
    let series = this.histograms.get(key);
    if (!series) {
      series = { labels, counts: LATENCY_BUCKETS_SECONDS.map(() => 0), sum: 0, total: 0 };
      this.histograms.set(key, series);
    }
    series.sum += seconds;
    series.total += 1;
    LATENCY_BUCKETS_SECONDS.forEach((bucket, i) => {
      if (seconds <= bucket) series!.counts[i] = (series!.counts[i] ?? 0) + 1;
    });
  }

  /** One call per finished request, from the access-log hook. */
  observeHttp(o: HttpObservation): void {
    const labels = {
      method: o.method.toUpperCase(),
      path: normalizeMetricPath(o.path),
      status: String(o.status),
    };
    this.counter("scalpai_http_requests_total", labels);
    if (o.status >= 500) this.counter("scalpai_http_server_errors_total", { path: labels.path });
    this.observe("scalpai_http_request_duration_seconds", o.durationMs / 1_000, {
      method: labels.method,
      path: labels.path,
    });
  }

  snapshot(): { series: number; dropped: number } {
    return { series: this.size, dropped: this.dropped };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.dropped = 0;
  }

  /** Prometheus text exposition format (0.0.4). */
  render(): string {
    const lines: string[] = [];
    const counterNames = new Set([...this.counters.values()].map((c) => c.name));
    for (const name of [...counterNames].sort()) {
      lines.push(`# TYPE ${name} counter`);
      for (const c of [...this.counters.values()].filter((c) => c.name === name)) {
        lines.push(`${name}${renderLabels(c.labels)} ${c.value}`);
      }
    }
    const gaugeNames = new Set([...this.gauges.values()].map((g) => g.name));
    for (const name of [...gaugeNames].sort()) {
      lines.push(`# TYPE ${name} gauge`);
      for (const g of [...this.gauges.values()].filter((g) => g.name === name)) {
        lines.push(`${name}${renderLabels(g.labels)} ${g.value}`);
      }
    }
    const histNames = new Set([...this.histograms.keys()].map((k) => k.split("{")[0]!));
    for (const name of [...histNames].sort()) {
      lines.push(`# TYPE ${name} histogram`);
      for (const [key, series] of this.histograms) {
        if (key.split("{")[0] !== name) continue;
        LATENCY_BUCKETS_SECONDS.forEach((bucket, i) => {
          lines.push(`${name}_bucket${renderLabels({ ...series.labels, le: String(bucket) })} ${series.counts[i] ?? 0}`);
        });
        lines.push(`${name}_bucket${renderLabels({ ...series.labels, le: "+Inf" })} ${series.total}`);
        lines.push(`${name}_sum${renderLabels(series.labels)} ${series.sum}`);
        lines.push(`${name}_count${renderLabels(series.labels)} ${series.total}`);
      }
    }
    lines.push("# TYPE scalpai_metrics_series gauge");
    lines.push(`scalpai_metrics_series ${this.size}`);
    lines.push("# TYPE scalpai_metrics_series_dropped_total counter");
    lines.push(`scalpai_metrics_series_dropped_total ${this.dropped}`);
    lines.push("# TYPE scalpai_process_uptime_seconds gauge");
    lines.push(`scalpai_process_uptime_seconds ${Math.round(process.uptime())}`);
    return `${lines.join("\n")}\n`;
  }
}

export const metrics = new MetricsRegistry();
