import type { ClinicalAnalysisResult } from '../../db';
import type { KeyFinding, MetricDelta, PrioritizedRecommendation } from './resultInsights';
import type { CapturedChart } from './capturePrintCharts';
import { buildClientPdfFileName, capturePrintCharts } from './capturePrintCharts';
import {
  buildTrendPrintSection,
  type TrendPoint,
  type TrendPrintLabels,
} from './printTrend';

export interface PrintReportOpts {
  title: string;
  clientName: string;
  dateLabel: string;
  score: number;
  scoreLabel: string;
  scoreColor: string;
  findings: KeyFinding[];
  result: ClinicalAnalysisResult;
  recommendations: PrioritizedRecommendation[];
  disclaimer: string;
  charts?: CapturedChart[];
  /** سری روند برای چاپ — از تاریخچه مشتری */
  trendPoints?: TrendPoint[];
  trendDeltas?: MetricDelta[];
  lesionLabels?: Record<string, string>;
  labels: {
    health: string;
    keyFindings: string;
    density: string;
    scalp: string;
    oiliness: string;
    dryness: string;
    dandruff: string;
    redness: string;
    hairLoss: string;
    lesions: string;
    noLesions: string;
    recommendations: string;
    urgent: string;
    care: string;
    followup: string;
    shine?: string;
    patchiness?: string;
    pigmentation?: string;
    hairThickness?: string;
    chartsSection?: string;
    previewPrint?: string;
    previewSavePdf?: string;
    previewClose?: string;
    specialized?: string;
    trendOverTime?: string;
    comparePrevious?: string;
    noPreviousSession?: string;
    improved?: string;
    worsened?: string;
    unchanged?: string;
    sessionDetails?: string;
    latestSession?: string;
    reportDate?: string;
    metricDensity?: string;
    metricOiliness?: string;
    metricDryness?: string;
    metricDandruff?: string;
    metricRedness?: string;
  };
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clampPct(n: number) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
}

/** رنگ پر کردن نوار — در چاپ تک‌رنگ هم با کنتراست/حاشیه دیده می‌شود */
function barTone(value: number, inverted = false): string {
  const v = inverted ? 100 - value : value;
  if (v >= 60) return '#dc2626';
  if (v >= 40) return '#d97706';
  return '#059669';
}

/**
 * ردیف نوار درصدی حرفه‌ای برای چاپ/PDF
 * track حاشیه دارد تا حتی بدون جوهر رنگی هم خوانا باشد
 */
function metricBarRow(
  label: string,
  value: number,
  opts?: { inverted?: boolean; color?: string },
): string {
  const pct = clampPct(value);
  const fill = opts?.color || barTone(pct, opts?.inverted);
  return `
    <div class="mrow">
      <div class="mrow-top">
        <span class="mlabel">${esc(label)}</span>
        <span class="mval">${pct}%</span>
      </div>
      <div class="mtrack">
        <div class="mfill" style="width:${pct}%;background:${fill}"></div>
      </div>
    </div>`;
}

function metricBarsBlock(
  items: { label: string; value: number; inverted?: boolean; color?: string }[],
): string {
  if (!items.length) return '';
  return `<div class="mbars">${items.map(i => metricBarRow(i.label, i.value, i)).join('')}</div>`;
}

const priorityLabel = (
  p: PrioritizedRecommendation['priority'],
  labels: PrintReportOpts['labels'],
) => (p === 'urgent' ? labels.urgent : p === 'care' ? labels.care : labels.followup);

function scoreMeterHtml(score: number, label: string, scoreLabel: string, color: string): string {
  const pct = clampPct(score);
  return `
    <div class="score-card">
      <div class="score-ring" style="background:conic-gradient(${color} ${pct * 3.6}deg, #e5e7eb 0deg)">
        <div class="score-inner">
          <div class="score-num" style="color:${color}">${pct}</div>
          <div class="score-tier">${esc(scoreLabel)}</div>
        </div>
      </div>
      <div class="score-side">
        <div class="score-title">${esc(label)}</div>
        ${metricBarRow(label, pct, { color, inverted: false })}
      </div>
    </div>`;
}

function chartsHtml(charts: CapturedChart[] | undefined, sectionTitle: string): string {
  if (!charts?.length) return '';
  const blocks = charts
    .map(
      c => `
    <section class="chart-block">
      <h3 class="chart-title">${esc(c.title)}</h3>
      <img class="chart-img" src="${c.dataUrl}" alt="${esc(c.title)}" />
    </section>`,
    )
    .join('');
  return `
    <section class="section">
      <h2>${esc(sectionTitle)}</h2>
      ${blocks}
    </section>`;
}

function toolbarHtml(labels: PrintReportOpts['labels'], defaultPdfName: string): string {
  return `
  <div class="toolbar no-print">
    <div class="toolbar-inner">
      <strong>پیش‌نمایش گزارش</strong>
      <div class="toolbar-actions">
        <button type="button" class="btn primary" id="btn-print">${esc(labels.previewPrint || 'Print')}</button>
        <button type="button" class="btn" id="btn-pdf" data-name="${esc(defaultPdfName)}">${esc(labels.previewSavePdf || 'PDF')}</button>
        <button type="button" class="btn ghost" id="btn-close">${esc(labels.previewClose || 'Close')}</button>
      </div>
    </div>
  </div>`;
}

/** HTML گزارش حرفه‌ای چاپ / PDF */
export function buildReportHtml(opts: PrintReportOpts, withToolbar = false): string {
  const { labels, result } = opts;

  const findingsBars = metricBarsBlock(
    opts.findings.map(f => ({
      label: f.label,
      value: f.value,
      inverted: Boolean(f.inverted),
    })),
  );

  const densityBars = metricBarsBlock([
    {
      label: `${labels.density} (${result.hairDensity.level})`,
      value: result.hairDensity.score,
      inverted: true,
      color: barTone(100 - result.hairDensity.score),
    },
  ]);

  const scalpItems: { label: string; value: number }[] = [
    { label: labels.oiliness, value: result.scalpCondition.oiliness },
    { label: labels.dryness, value: result.scalpCondition.dryness },
  ];
  if (result.scalpCondition.dandruff != null) {
    scalpItems.push({ label: labels.dandruff, value: result.scalpCondition.dandruff });
  }
  if (result.scalpCondition.redness != null) {
    scalpItems.push({ label: labels.redness, value: result.scalpCondition.redness });
  }

  const specializedItems: { label: string; value: number }[] = [];
  if (result.scalpCondition.shine != null && labels.shine) {
    specializedItems.push({ label: labels.shine, value: result.scalpCondition.shine });
  }
  if (result.scalpCondition.patchiness != null && labels.patchiness) {
    specializedItems.push({ label: labels.patchiness, value: result.scalpCondition.patchiness });
  }
  if (result.scalpCondition.pigmentation != null && labels.pigmentation) {
    specializedItems.push({ label: labels.pigmentation, value: result.scalpCondition.pigmentation });
  }
  if (result.scalpCondition.hairThickness != null && labels.hairThickness) {
    specializedItems.push({
      label: labels.hairThickness,
      value: result.scalpCondition.hairThickness,
    });
  }

  const lesionRows = result.lesionSummary?.global ?? result.lesions.map(l => ({
    type: l.type,
    maxConfidence: l.confidence,
  }));
  const lesionsBars =
    lesionRows.length === 0
      ? `<p class="muted">${esc(labels.noLesions)}</p>`
      : metricBarsBlock(
          lesionRows.map(l => ({
            label: opts.lesionLabels?.[l.type] ?? l.type,
            value: l.maxConfidence * 100,
          })),
        );

  const recsHtml = opts.recommendations
    .map(
      (r, i) => `
      <li class="rec ${r.priority}">
        <span class="rec-idx">${i + 1}</span>
        <span class="badge ${r.priority}">${esc(priorityLabel(r.priority, labels))}</span>
        <span class="rec-text">${esc(r.text)}</span>
      </li>`,
    )
    .join('');

  const chartsSection = chartsHtml(opts.charts, labels.chartsSection || 'Charts');
  const pdfName = buildClientPdfFileName(opts.clientName);
  const toolbar = withToolbar ? toolbarHtml(labels, pdfName) : '';

  const trendLabels: TrendPrintLabels = {
    trendTitle: labels.trendOverTime || 'Trend',
    compareTitle: labels.comparePrevious || 'Compare',
    noTrend: labels.noPreviousSession || 'No previous session',
    density: labels.metricDensity || labels.density,
    oiliness: labels.metricOiliness || labels.oiliness,
    dryness: labels.metricDryness || labels.dryness,
    dandruff: labels.metricDandruff || labels.dandruff,
    redness: labels.metricRedness || labels.redness,
    improved: labels.improved || 'Improved',
    worsened: labels.worsened || 'Worsened',
    unchanged: labels.unchanged || 'Unchanged',
    sessionTable: labels.sessionDetails || 'Sessions',
    dateCol: labels.reportDate || 'Date',
    latestValues: labels.latestSession || 'Latest',
  };

  const trendSection = buildTrendPrintSection({
    points: opts.trendPoints || [],
    deltas: opts.trendDeltas || [],
    labels: trendLabels,
  });

  return `<!DOCTYPE html>
<html lang="fa" dir="auto">
<head>
  <meta charset="utf-8" />
  <title>${esc(opts.title)} — ${esc(opts.clientName)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Tahoma, "Segoe UI", sans-serif;
      margin: 0;
      padding: ${withToolbar ? '76px 28px 28px' : '28px'};
      color: #111827;
      line-height: 1.55;
      background: #fff;
      font-size: 13px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
      border-bottom: 3px solid #111827; padding-bottom: 12px; margin-bottom: 18px;
    }
    .brand { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; }
    h1 { font-size: 20px; margin: 4px 0 0; color: #111827; }
    .meta { text-align: end; font-size: 13px; color: #374151; }
    .meta strong { display: block; font-size: 15px; color: #111827; margin-bottom: 2px; }
    h2 {
      font-size: 14px; margin: 22px 0 10px; padding: 6px 10px;
      background: #f3f4f6; border: 1px solid #d1d5db; border-right: 4px solid #111827;
      color: #111827; page-break-after: avoid;
    }
    h3.chart-title { font-size: 13px; margin: 0 0 8px; color: #374151; }
    .section { page-break-inside: avoid; margin-bottom: 4px; }
    .muted { color: #6b7280; }

    .mrow { margin: 0 0 10px; }
    .mrow-top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .mlabel { font-weight: 600; color: #111827; }
    .mval { font-weight: 700; font-variant-numeric: tabular-nums; color: #111827; }
    .mtrack {
      height: 12px; background: #f3f4f6; border: 1px solid #9ca3af; border-radius: 3px;
      overflow: hidden; position: relative;
    }
    .mfill {
      height: 100%; min-width: 0; border-right: 1px solid #111827;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .mbars { margin: 4px 0 8px; }

    .score-card {
      display: flex; align-items: center; gap: 20px; flex-wrap: wrap;
      border: 1px solid #d1d5db; border-radius: 10px; padding: 14px 16px;
      background: #fafafa; page-break-inside: avoid;
    }
    .score-ring {
      width: 110px; height: 110px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #9ca3af;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .score-inner {
      width: 78px; height: 78px; border-radius: 50%; background: #fff;
      border: 1px solid #d1d5db; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
    }
    .score-num { font-size: 28px; font-weight: 800; line-height: 1; }
    .score-tier { font-size: 11px; color: #4b5563; margin-top: 2px; }
    .score-side { flex: 1; min-width: 200px; }
    .score-title { font-weight: 700; margin-bottom: 8px; }

    .hairloss {
      border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; background: #fff;
    }
    .hairloss strong { font-size: 16px; }

    .badge {
      display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 8px;
      border-radius: 999px; border: 1px solid #111827; margin-inline-end: 6px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .badge.urgent { background: #fee2e2; color: #7f1d1d; }
    .badge.care { background: #fef3c7; color: #78350f; }
    .badge.followup { background: #e5e7eb; color: #111827; }

    ol.recs { list-style: none; padding: 0; margin: 0; }
    .rec {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px 0; border-bottom: 1px solid #e5e7eb;
    }
    .rec-idx {
      width: 22px; height: 22px; border-radius: 50%; border: 1px solid #111827;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 700; flex-shrink: 0; background: #fff;
    }
    .rec-text { flex: 1; }

    .disclaimer {
      margin-top: 20px; padding: 10px 12px; border: 1px dashed #6b7280;
      border-radius: 8px; font-size: 11px; color: #374151; background: #f9fafb;
    }
    .chart-block {
      margin: 10px 0 18px; padding: 10px; border: 1px solid #d1d5db;
      border-radius: 10px; background: #fff; page-break-inside: avoid;
    }
    .chart-img {
      display: block; width: 100%; max-width: 720px; height: auto;
      background: #fff !important; border: 1px solid #e5e7eb; border-radius: 6px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .trend-section { page-break-inside: auto; }
    .trend-chart { page-break-inside: avoid; }
    .delta-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
    .delta-chip {
      display: inline-block; padding: 4px 10px; border-radius: 999px;
      border: 1px solid #111827; font-size: 12px;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .delta-chip.good { background: #d1fae5; color: #065f46; }
    .delta-chip.bad { background: #fee2e2; color: #7f1d1d; }
    .delta-chip.unchanged { background: #f3f4f6; color: #374151; }
    .trend-table {
      width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 12px;
      page-break-inside: avoid;
    }
    .trend-table th, .trend-table td {
      border: 1px solid #9ca3af; padding: 6px 8px; text-align: center;
    }
    .trend-table th { background: #f3f4f6; font-weight: 700; }
    .trend-table td:first-child, .trend-table th:first-child { text-align: start; }

    .toolbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
      background: #111827; color: #fff; border-bottom: 1px solid #374151;
    }
    .toolbar-inner {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 16px; flex-wrap: wrap;
    }
    .toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      border: 0; border-radius: 8px; padding: 8px 14px; cursor: pointer;
      background: #374151; color: #fff; font-family: inherit; font-size: 13px;
    }
    .btn.primary { background: #059669; }
    .btn.ghost { background: transparent; border: 1px solid #6b7280; }

    @media print {
      body { margin: 0; padding: 14mm; }
      .no-print { display: none !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .chart-img, .chart-block, .score-card, .mtrack { background: #fff !important; }
      h2 { background: #f3f4f6 !important; }
    }
  </style>
</head>
<body>
  ${toolbar}

  <header class="header">
    <div>
      <div class="brand">ScalpAI</div>
      <h1>${esc(opts.title)}</h1>
    </div>
    <div class="meta">
      <strong>${esc(opts.clientName)}</strong>
      <div>${esc(opts.dateLabel)}</div>
    </div>
  </header>

  <section class="section">
    ${scoreMeterHtml(opts.score, labels.health, opts.scoreLabel, opts.scoreColor)}
  </section>

  <section class="section">
    <h2>${esc(labels.keyFindings)}</h2>
    ${findingsBars}
  </section>

  <section class="section">
    <h2>${esc(labels.density)}</h2>
    ${densityBars}
  </section>

  <section class="section">
    <h2>${esc(labels.scalp)}</h2>
    ${metricBarsBlock(scalpItems)}
  </section>

  ${
    specializedItems.length
      ? `<section class="section">
          <h2>${esc(labels.specialized || labels.scalp)}</h2>
          ${metricBarsBlock(specializedItems)}
        </section>`
      : ''
  }

  <section class="section">
    <h2>${esc(labels.hairLoss)}</h2>
    <div class="hairloss">
      <strong>${esc(result.hairLoss.level)}</strong>
      <div class="muted">${esc(result.hairLoss.pattern)}</div>
    </div>
  </section>

  <section class="section">
    <h2>${esc(labels.lesions)}</h2>
    ${lesionsBars}
  </section>

  ${trendSection}

  ${chartsSection}

  <section class="section">
    <h2>${esc(labels.recommendations)}</h2>
    <ol class="recs">${recsHtml}</ol>
  </section>

  <div class="disclaimer">${esc(opts.disclaimer)}</div>
</body>
</html>`;
}

async function withCharts(opts: PrintReportOpts): Promise<PrintReportOpts> {
  if (opts.charts?.length) return opts;
  const charts = await capturePrintCharts();
  return { ...opts, charts };
}

export async function openPrintableReport(opts: PrintReportOpts): Promise<boolean> {
  const full = await withCharts(opts);
  const html = buildReportHtml(full, true);
  const api = window.electronAPI?.print;

  if (api?.preview) {
    const result = await api.preview(html);
    return Boolean(result.success);
  }

  return printViaIframe(buildReportHtml(full, false));
}

export async function saveReportPdf(
  opts: PrintReportOpts,
  defaultFileName?: string,
): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
  const full = await withCharts(opts);
  const html = buildReportHtml(full, false);
  const api = window.electronAPI?.print;
  const fileName = defaultFileName || buildClientPdfFileName(opts.clientName);

  if (api?.toPdf) {
    return api.toPdf(html, fileName);
  }

  const ok = printViaIframe(html);
  return { success: ok };
}

function printViaIframe(html: string): boolean {
  const FRAME_ID = 'scalpai-print-frame';
  document.getElementById(FRAME_ID)?.remove();

  const frame = document.createElement('iframe');
  frame.id = FRAME_ID;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
  document.body.appendChild(frame);

  const doc = frame.contentDocument ?? frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    return false;
  }

  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => document.getElementById(FRAME_ID)?.remove(), 1000);
    }
  }, 400);

  return true;
}
