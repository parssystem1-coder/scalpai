import type { Analysis } from '../../db';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import type { MetricDelta } from './resultInsights';

export interface TrendPoint {
  id: string;
  date: string;
  density: number;
  oiliness: number;
  dryness: number;
  dandruff: number;
  redness: number;
}

export function buildClinicalTrendPoints(
  clientHistory: Analysis[],
  source: 'offline' | 'ai' = 'offline',
): TrendPoint[] {
  return [...clientHistory]
    .filter(a => source === 'ai' ? !!a.aiResults : !!a.offlineResults)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map(a => {
      const r = source === 'ai' ? a.aiResults! : a.offlineResults!;
      return {
        id: a.id,
        date: formatDateForDisplay(a.createdAt.split('T')[0]),
        density: r.hairDensity.score,
        oiliness: r.scalpCondition.oiliness,
        dryness: r.scalpCondition.dryness,
        dandruff: r.scalpCondition.dandruff ?? 0,
        redness: r.scalpCondition.redness ?? 0,
      };
    });
}

export function buildOfflineTrendPoints(clientHistory: Analysis[]): TrendPoint[] {
  return buildClinicalTrendPoints(clientHistory, 'offline');
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const SERIES = [
  { key: 'density' as const, color: '#059669', labelKey: 'density' },
  { key: 'oiliness' as const, color: '#2563eb', labelKey: 'oiliness' },
  { key: 'dryness' as const, color: '#ca8a04', labelKey: 'dryness' },
  { key: 'dandruff' as const, color: '#7c3aed', labelKey: 'dandruff' },
  { key: 'redness' as const, color: '#dc2626', labelKey: 'redness' },
];

/** نمودار خطی SVG روشن و خوانا برای چاپ / PDF */
function buildTrendSvg(
  points: TrendPoint[],
  labels: Record<(typeof SERIES)[number]['labelKey'], string>,
): string {
  const W = 700;
  const H = 280;
  const padL = 44;
  const padR = 16;
  const padT = 20;
  const padB = 36;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB - 28; // جا برای راهنما پایین
  const n = points.length;
  if (n < 2) return '';

  const xAt = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => padT + plotH - (clamp(v, 0, 100) / 100) * plotH;

  const grid = [0, 25, 50, 75, 100]
    .map(v => {
      const y = yAt(v);
      return `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#d1d5db" stroke-width="1" />
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#374151" font-family="Tahoma,Segoe UI,sans-serif">${v}</text>`;
    })
    .join('');

  const xLabels = points
    .map((p, i) => {
      const x = xAt(i);
      const label = p.date.length > 12 ? `${p.date.slice(0, 11)}…` : p.date;
      return `<text x="${x}" y="${padT + plotH + 18}" text-anchor="middle" font-size="10" fill="#374151" font-family="Tahoma,Segoe UI,sans-serif">${esc(label)}</text>`;
    })
    .join('');

  const lines = SERIES.map(s => {
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p[s.key]).toFixed(1)}`)
      .join(' ');
    const dots = points
      .map(
        (p, i) =>
          `<circle cx="${xAt(i).toFixed(1)}" cy="${yAt(p[s.key]).toFixed(1)}" r="3.5" fill="${s.color}" stroke="#fff" stroke-width="1.2" />`,
      )
      .join('');
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />${dots}`;
  }).join('');

  const legendY = H - 16;
  const legend = SERIES.map((s, i) => {
    const x = padL + i * 128;
    return `
      <rect x="${x}" y="${legendY - 10}" width="11" height="11" rx="2" fill="${s.color}" stroke="#111827" stroke-width="0.5" />
      <text x="${x + 15}" y="${legendY}" font-size="11" fill="#111827" font-family="Tahoma,Segoe UI,sans-serif">${esc(labels[s.labelKey])}</text>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:700px;height:auto;display:block;background:#fff;border:1px solid #d1d5db;border-radius:8px">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />
      ${grid}
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#9ca3af" stroke-width="1.2" />
      <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#9ca3af" stroke-width="1.2" />
      ${lines}
      ${xLabels}
      ${legend}
    </svg>`;
}

function metricBar(label: string, value: number, color: string): string {
  const pct = clamp(Math.round(value), 0, 100);
  return `
    <div class="mrow">
      <div class="mrow-top">
        <span class="mlabel">${esc(label)}</span>
        <span class="mval">${pct}%</span>
      </div>
      <div class="mtrack">
        <div class="mfill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
}

export interface TrendPrintLabels {
  trendTitle: string;
  compareTitle: string;
  noTrend: string;
  density: string;
  oiliness: string;
  dryness: string;
  dandruff: string;
  redness: string;
  improved: string;
  worsened: string;
  unchanged: string;
  sessionTable: string;
  dateCol: string;
  latestValues: string;
}

/** بخش کامل روند برای چاپ/PDF: دلتا + نمودار + جدول + نوارها */
export function buildTrendPrintSection(opts: {
  points: TrendPoint[];
  deltas: MetricDelta[];
  labels: TrendPrintLabels;
}): string {
  const { points, deltas, labels } = opts;

  if (points.length < 2) {
    return `
      <section class="section">
        <h2>${esc(labels.trendTitle)}</h2>
        <p class="muted">${esc(labels.noTrend)}</p>
      </section>`;
  }

  const seriesLabels = {
    density: labels.density,
    oiliness: labels.oiliness,
    dryness: labels.dryness,
    dandruff: labels.dandruff,
    redness: labels.redness,
  };

  const svg = buildTrendSvg(points, seriesLabels);
  const latest = points[points.length - 1];

  const deltaChips = deltas.length
    ? `<div class="delta-row">${deltas
        .map(d => {
          const improved =
            d.delta === 0
              ? 'unchanged'
              : d.higherIsBetter
                ? d.delta > 0
                  ? 'good'
                  : 'bad'
                : d.delta < 0
                  ? 'good'
                  : 'bad';
          const sign = d.delta > 0 ? '+' : '';
          const tag =
            improved === 'good'
              ? labels.improved
              : improved === 'bad'
                ? labels.worsened
                : labels.unchanged;
          return `<span class="delta-chip ${improved}"><strong>${esc(d.label)}</strong> ${sign}${d.delta} · ${esc(tag)}</span>`;
        })
        .join('')}</div>`
    : '';

  const tableRows = points
    .map(
      p => `
      <tr>
        <td>${esc(p.date)}</td>
        <td>${Math.round(p.density)}%</td>
        <td>${Math.round(p.oiliness)}%</td>
        <td>${Math.round(p.dryness)}%</td>
        <td>${Math.round(p.dandruff)}%</td>
        <td>${Math.round(p.redness)}%</td>
      </tr>`,
    )
    .join('');

  const latestBars = `
    <div class="mbars">
      ${metricBar(labels.density, latest.density, '#059669')}
      ${metricBar(labels.oiliness, latest.oiliness, '#2563eb')}
      ${metricBar(labels.dryness, latest.dryness, '#ca8a04')}
      ${metricBar(labels.dandruff, latest.dandruff, '#7c3aed')}
      ${metricBar(labels.redness, latest.redness, '#dc2626')}
    </div>`;

  return `
    <section class="section trend-section">
      <h2>${esc(labels.compareTitle)}</h2>
      ${deltaChips}
      <h3 class="chart-title">${esc(labels.trendTitle)}</h3>
      <div class="chart-block trend-chart">${svg}</div>
      <h3 class="chart-title">${esc(labels.sessionTable)}</h3>
      <table class="trend-table">
        <thead>
          <tr>
            <th>${esc(labels.dateCol)}</th>
            <th>${esc(labels.density)}</th>
            <th>${esc(labels.oiliness)}</th>
            <th>${esc(labels.dryness)}</th>
            <th>${esc(labels.dandruff)}</th>
            <th>${esc(labels.redness)}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <h3 class="chart-title">${esc(labels.latestValues)} — ${esc(latest.date)}</h3>
      ${latestBars}
    </section>`;
}
