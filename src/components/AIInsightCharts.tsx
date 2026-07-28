import { useEffect, useMemo, useState } from 'react';
import type { LesionSummary, LesionSummaryItem } from '../db';
import LesionDistribution3D from './LesionDistribution3D';
import { getScalpRegion } from '../lib/scalpRegions';
import { getTrichoscopeMode } from '../lib/trichoscopeModes';
import { lesionDisplayLabel } from '../lib/diagnosisCatalog';
import type { KeyFinding } from '../pages/offline-analysis/resultInsights';
import type { Lang } from '../i18n';

type Props = {
  findings: KeyFinding[];
  lesionSummary?: LesionSummary;
  lang: Lang;
  mode?: 'findings' | 'regions' | 'both';
  labels: {
    keyFindingsChart: string;
    keyFindingsChartHint: string;
    lesionsByRegion: string;
    lesionsByRegionChartHint: string;
    unknownRegion: string;
    affectedAreas: string;
    high: string;
    medium: string;
    low: string;
    noRegionData: string;
    confidence: string;
    conditions: string;
    trichoscopyFindings: string;
    observed: string;
    possible: string;
    requiresConfirmation: string;
    finalResult: string;
    allLenses: string;
    lensFilter: string;
  };
};

function severityColor(severity: KeyFinding['severity']) {
  if (severity === 'high') return { stroke: '#fb7185', glow: '#f43f5e', text: '#fecdd3' };
  if (severity === 'medium') return { stroke: '#fbbf24', glow: '#f59e0b', text: '#fde68a' };
  return { stroke: '#34d399', glow: '#10b981', text: '#a7f3d0' };
}

function severityLabel(severity: KeyFinding['severity'], labels: Props['labels']) {
  return severity === 'high' ? labels.high : severity === 'medium' ? labels.medium : labels.low;
}

function chartSeverity(finding: KeyFinding): KeyFinding['severity'] {
  // Issue scores use 0–30 normal, 31–60 caution, >60 critical.
  // Density is the inverse: a low density score is the risky state.
  if (finding.inverted) {
    return finding.value <= 30 ? 'high' : finding.value <= 60 ? 'medium' : 'low';
  }
  return finding.value <= 30 ? 'low' : finding.value <= 60 ? 'medium' : 'high';
}

function FindingCard({ finding, index, labels }: { finding: KeyFinding; index: number; labels: Props['labels'] }) {
  const severity = chartSeverity(finding);
  const colors = severityColor(severity);
  const circumference = 2 * Math.PI * 42;
  const dash = (Math.max(0, Math.min(100, finding.value)) / 100) * circumference;
  const gradientId = `finding-gradient-${index}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.10] via-white/[.04] to-cyan-500/[.04] p-4 shadow-[0_0_25px_rgba(34,211,238,0.06)]">
      <div className="pointer-events-none absolute -end-8 -top-8 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <svg viewBox="0 0 104 104" className="h-24 w-24 shrink-0" role="img" aria-label={`${finding.label}: ${Math.round(finding.value)}%`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor={colors.glow} />
              <stop offset="1" stopColor={colors.stroke} />
            </linearGradient>
            <filter id={`${gradientId}-glow`}><feGaussianBlur stdDeviation="2.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <circle cx="52" cy="52" r="42" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="8" />
          <circle cx="52" cy="52" r="42" fill="none" stroke={`url(#${gradientId})`} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`} transform="rotate(-90 52 52)" filter={`url(#${gradientId}-glow)`} />
          <circle cx="52" cy="52" r="31" fill="rgba(2,6,23,.55)" stroke="rgba(255,255,255,.08)" />
          <text x="52" y="49" textAnchor="middle" fill="white" fontSize="18" fontWeight="700">{Math.round(finding.value)}</text>
          <text x="52" y="65" textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="9">%</text>
        </svg>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.stroke, boxShadow: `0 0 12px ${colors.glow}` }} />
            <h4 className="truncate text-sm font-semibold text-white">{finding.label}</h4>
          </div>
          <p className="text-xs" style={{ color: colors.text }}>{severityLabel(severity, labels)}</p>
          <div className="mt-3 flex gap-1 opacity-60">
            {[0, 1, 2, 3, 4].map(dot => <span key={dot} className="h-1.5 flex-1 rounded-full" style={{ background: dot < Math.ceil(finding.value / 20) ? colors.stroke : 'rgba(255,255,255,.12)' }} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RegionChart({ regionKey, items, lang, labels }: { regionKey: string; items: LesionSummaryItem[]; lang: Lang; labels: Props['labels'] }) {
  const region = regionKey === 'unknown' ? undefined : getScalpRegion(regionKey);
  const totalAreas = Math.max(1, items.reduce((sum, item) => sum + item.affectedPhotoRegionCount, 0));
  const regionName = region ? (lang === 'fa' ? region.fa : region.en) : labels.unknownRegion;
  const gradientId = `region-gradient-${regionKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.09] to-violet-500/[.04] p-4">
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-20" viewBox="0 0 400 180" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
        <path d="M0 155 C80 80 120 180 210 80 S330 60 400 10" fill="none" stroke={`url(#${gradientId})`} strokeWidth="2" />
        <path d="M0 170 C80 95 120 195 210 95 S330 75 400 25" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1" />
      </svg>
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <h4 className="font-semibold text-white">{regionName}</h4>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] text-cyan-100">{items.length} types</span>
      </div>
      <div className="relative space-y-3">
        {(['condition', 'trichoscopy'] as const).map(category => {
          const categoryItems = items.filter(item => (item.category ?? 'condition') === category);
          if (!categoryItems.length) return null;
          return (
            <div key={category} className="space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-cyan-200/80">{category === 'condition' ? labels.conditions : labels.trichoscopyFindings}</h5>
              {categoryItems.map(item => {
                const percentage = Math.round((item.affectedPhotoRegionCount / totalAreas) * 100);
                const severity = percentage <= 30 ? 'low' : percentage <= 60 ? 'medium' : 'high';
                const palette = severityColor(severity);
                const evidence = item.evidenceLevel === 'requires_confirmation'
                  ? labels.requiresConfirmation
                  : item.evidenceLevel === 'possible' ? labels.possible : labels.observed;
                return (
                  <div key={`${category}-${item.type}`}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-white/85">{lesionDisplayLabel(item.type, lang)}</span>
                      <span className="shrink-0 font-semibold" style={{ color: palette.text }}>{percentage}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(5, percentage)}%`, background: `linear-gradient(90deg, ${palette.glow}, ${palette.stroke})`, boxShadow: `0 0 12px ${palette.glow}` }} />
                    </div>
                    <p className="mt-1 text-[10px] opacity-50">{item.affectedPhotoRegionCount} {labels.affectedAreas} · {Math.round(item.maxConfidence * 100)}% {labels.confidence} · {evidence}</p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function mergeSummaryItems(lists: LesionSummaryItem[][]): LesionSummaryItem[] {
  const byType = new Map<string, LesionSummaryItem>();
  for (const list of lists) {
    for (const item of list) {
      const current = byType.get(item.type);
      if (!current) {
        byType.set(item.type, { ...item, regions: [...item.regions] });
      } else {
        current.affectedPhotoCount += item.affectedPhotoCount;
        current.affectedPhotoRegionCount += item.affectedPhotoRegionCount;
        current.occurrenceCount += item.occurrenceCount;
        current.averageConfidence = (current.averageConfidence + item.averageConfidence) / 2;
        current.maxConfidence = Math.max(current.maxConfidence, item.maxConfidence);
        current.regions.push(...item.regions);
      }
    }
  }
  return [...byType.values()].sort((a, b) => b.affectedPhotoRegionCount - a.affectedPhotoRegionCount);
}

export default function AIInsightCharts({ findings, lesionSummary, lang, labels, mode = 'both' }: Props) {
  const [regionFilter, setRegionFilter] = useState('all');
  const [lensFilter, setLensFilter] = useState('all');
  const availableRegions = useMemo(() => lesionSummary?.availableRegionIds ?? [], [lesionSummary]);
  const availableLenses = useMemo(() => lesionSummary?.availableLensModes ?? [], [lesionSummary]);

  useEffect(() => {
    if (regionFilter !== 'all' && !availableRegions.includes(regionFilter)) setRegionFilter('all');
    if (lensFilter !== 'all' && !availableLenses.includes(lensFilter)) setLensFilter('all');
  }, [availableRegions, availableLenses, regionFilter, lensFilter]);

  const filteredRegionEntries = useMemo(() => {
    if (!lesionSummary) return [] as Array<[string, LesionSummaryItem[]]>;
    const regions = regionFilter === 'all' ? availableRegions : [regionFilter];
    return regions.map(regionId => {
      const byLens = lesionSummary.itemsByRegionAndLens[regionId] || {};
      const items = lensFilter === 'all'
        ? lesionSummary.itemsByRegion[regionId] || []
        : byLens[lensFilter] || [];
      return [regionId, items] as [string, LesionSummaryItem[]];
    }).filter(([, items]) => items.length > 0);
  }, [availableRegions, lesionSummary, lensFilter, regionFilter]);

  const filteredGlobalItems = useMemo(() => {
    if (!lesionSummary) return [];
    if (regionFilter === 'all' && lensFilter === 'all') return lesionSummary.global;
    if (regionFilter !== 'all') {
      const byLens = lesionSummary.itemsByRegionAndLens[regionFilter] || {};
      return lensFilter === 'all'
        ? lesionSummary.itemsByRegion[regionFilter] || []
        : byLens[lensFilter] || [];
    }
    const lists = availableRegions.map(regionId => lesionSummary.itemsByRegionAndLens[regionId]?.[lensFilter] || []);
    return mergeSummaryItems(lists);
  }, [availableRegions, lensFilter, lesionSummary, regionFilter]);

  const regionEntries = filteredRegionEntries;
  return (
    <div className="space-y-5">
      {(mode === 'findings' || mode === 'both') && findings.length > 0 && (
        <section className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950/40 p-5 shadow-[0_0_35px_rgba(34,211,238,.08)]">
          <div className="pointer-events-none absolute -end-20 -top-20 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">✦</div>
            <div><h3 className="font-semibold text-white">{labels.keyFindingsChart}</h3><p className="mt-1 text-xs text-white/55">{labels.keyFindingsChartHint}</p></div>
          </div>
          <div className="relative grid grid-cols-1 gap-3 md:grid-cols-3">{findings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index} labels={labels} />)}</div>
        </section>
      )}

      {(mode === 'regions' || mode === 'both') && regionEntries.length > 0 && (
        <section className="relative overflow-hidden rounded-3xl border border-violet-300/15 bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/30 p-5 shadow-[0_0_35px_rgba(139,92,246,.08)]">
          <div className="relative mb-4 space-y-3 rounded-2xl border border-white/10 bg-black/15 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-100"><span className="h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_10px_rgba(196,181,253,.8)]" />{labels.finalResult}</div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setRegionFilter('all')} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${regionFilter === 'all' ? 'border-violet-300 bg-violet-400/25 text-white shadow-[0_0_14px_rgba(167,139,250,.3)]' : 'border-white/10 bg-white/5 text-white/65 hover:border-violet-300/50'}`}>{labels.finalResult} ({filteredGlobalItems.length})</button>
              {availableRegions.map(regionKey => {
                const region = regionKey === 'unknown' ? undefined : getScalpRegion(regionKey);
                const label = region ? (lang === 'fa' ? region.fa : region.en) : labels.unknownRegion;
                return <button key={regionKey} type="button" onClick={() => setRegionFilter(regionKey)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${regionFilter === regionKey ? 'border-violet-300 bg-violet-400/25 text-white shadow-[0_0_14px_rgba(167,139,250,.3)]' : 'border-white/10 bg-white/5 text-white/65 hover:border-violet-300/50'}`}>{label}</button>;
              })}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="shrink-0 text-[11px] text-white/55">{labels.lensFilter}</span>
              <button type="button" onClick={() => setLensFilter('all')} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${lensFilter === 'all' ? 'border-cyan-300 bg-cyan-400/20 text-white' : 'border-white/10 bg-white/5 text-white/65 hover:border-cyan-300/50'}`}>{labels.allLenses}</button>
              {availableLenses.map(lensId => {
                const lens = getTrichoscopeMode(lensId);
                return <button key={lensId} type="button" onClick={() => setLensFilter(lensId)} className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${lensFilter === lensId ? 'border-cyan-300 bg-cyan-400/20 text-white' : 'border-white/10 bg-white/5 text-white/65 hover:border-cyan-300/50'}`}>{lens ? (lang === 'fa' ? lens.fa : lens.en) : lensId}</button>;
              })}
            </div>
          </div>
          <div className="relative mb-4 flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-300/20 bg-violet-300/10 text-violet-200">◎</div>
            <div><h3 className="font-semibold text-white">{labels.lesionsByRegion}</h3><p className="mt-1 text-xs text-white/55">{labels.lesionsByRegionChartHint}</p></div>
          </div>
          <div className="relative grid grid-cols-1 gap-4 lg:grid-cols-2">{regionEntries.map(([regionKey, items]) => <RegionChart key={regionKey} regionKey={regionKey} items={items} lang={lang} labels={labels} />)}</div>
          {filteredGlobalItems.length > 0 && <div className="mt-5"><LesionDistribution3D lesions={[]} summary={filteredGlobalItems} lang={lang} title={labels.finalResult} /></div>}
        </section>
      )}

      {mode === 'both' && !findings.length && !regionEntries.length && <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm opacity-60">{labels.noRegionData}</p>}
    </div>
  );
}
