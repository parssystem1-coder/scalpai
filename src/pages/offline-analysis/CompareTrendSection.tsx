import { useMemo, useState } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { Analysis, ClinicalAnalysisResult } from '../../db';
import MetricPercentBar from '../../components/MetricPercentBar';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import { useLang, useT } from '../../i18n';
import { offlineDict } from './strings';
import {
  buildMetricDeltas,
  findPreviousClinicalResult,
  getAnalysisClinicalResult,
  type ResultSource,
} from './resultInsights';

interface TrendPoint {
  id: string;
  date: string;
  density: number;
  oiliness: number;
  dryness: number;
  dandruff: number;
  redness: number;
}

interface Props {
  result: ClinicalAnalysisResult;
  clientHistory: Analysis[];
  viewingAnalysisId?: string | null;
  onViewAnalysis?: (analysis: Analysis) => void;
  resultSource?: ResultSource;
}

function deltaTone(delta: number, higherIsBetter: boolean) {
  if (delta === 0) return 'neutral';
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  return improved ? 'good' : 'bad';
}

export default function CompareTrendSection({
  result,
  clientHistory,
  viewingAnalysisId,
  onViewAnalysis,
  resultSource = 'offline',
}: Props) {
  const t = useT(offlineDict);
  const { lang } = useLang();

  const trendData = useMemo<TrendPoint[]>(
    () =>
      [...clientHistory]
        .filter(a => !!getAnalysisClinicalResult(a, resultSource))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(a => {
          const r = getAnalysisClinicalResult(a, resultSource)!;
          return {
            id: a.id,
            date: formatDateForDisplay(a.createdAt.split('T')[0]),
            density: r.hairDensity.score,
            oiliness: r.scalpCondition.oiliness,
            dryness: r.scalpCondition.dryness,
            dandruff: r.scalpCondition.dandruff ?? 0,
            redness: r.scalpCondition.redness ?? 0,
          };
        }),
    [clientHistory, resultSource],
  );

  const currentPoint: TrendPoint = useMemo(
    () => ({
      id: viewingAnalysisId ?? 'current',
      date: t('reportDate'),
      density: result.hairDensity.score,
      oiliness: result.scalpCondition.oiliness,
      dryness: result.scalpCondition.dryness,
      dandruff: result.scalpCondition.dandruff ?? 0,
      redness: result.scalpCondition.redness ?? 0,
    }),
    [result, viewingAnalysisId, t],
  );

  const [hoverPoint, setHoverPoint] = useState<TrendPoint | null>(null);
  const display = hoverPoint ?? currentPoint;

  const previous = findPreviousClinicalResult(clientHistory, resultSource, viewingAnalysisId);
  const deltas = previous ? buildMetricDeltas(result, previous, lang) : [];

  const recentSessions = useMemo(
    () =>
      [...clientHistory]
        .filter(a => !!getAnalysisClinicalResult(a, resultSource))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 8),
    [clientHistory, resultSource],
  );

  return (
    <div
      className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-5"
      data-print-chart="trend"
      data-print-title={t('trendOverTime')}
    >
      <h3 className="font-semibold">{t('comparePrevious')}</h3>

      {deltas.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {deltas.map(d => {
            const tone = deltaTone(d.delta, d.higherIsBetter);
            const Icon =
              d.delta === 0 ? Minus : d.delta > 0 ? ArrowUpRight : ArrowDownRight;
            const color =
              tone === 'good'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : tone === 'bad'
                  ? 'bg-red-500/15 text-red-300 border-red-500/30'
                  : 'bg-white/5 text-white/70 border-white/10';
            const sign = d.delta > 0 ? '+' : '';
            return (
              <span
                key={d.id}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm ${color}`}
              >
                <Icon size={14} />
                <span>{d.label}</span>
                <span className="font-bold tabular-nums">{sign}{d.delta}</span>
                <span className="opacity-60 text-xs">
                  {tone === 'good' ? t('improved') : tone === 'bad' ? t('worsened') : t('unchanged')}
                </span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-sm opacity-50">{t('noPreviousSession')}</p>
      )}

      {trendData.length > 1 && (
        <>
          <div>
            <h4 className="text-sm font-medium opacity-80 mb-3">{t('trendOverTime')}</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  onMouseMove={state => {
                    const payload = state?.activePayload?.[0]?.payload as TrendPoint | undefined;
                    if (payload) setHoverPoint(payload);
                  }}
                  onMouseLeave={() => setHoverPoint(null)}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#888" fontSize={12} />
                  <YAxis domain={[0, 100]} stroke="#888" fontSize={12} />
                  <Tooltip contentStyle={{ background: '#1a1a2e', border: '1px solid #333' }} />
                  <Legend />
                  <Line type="monotone" dataKey="density" name={t('metricDensity')} stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="oiliness" name={t('metricOiliness')} stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="dryness" name={t('metricDryness')} stroke="#eab308" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="dandruff" name={t('metricDandruff')} stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="redness" name={t('metricRedness')} stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl bg-black/20 border border-white/5 p-4">
            <p className="text-xs opacity-50 mb-3">
              {hoverPoint ? hoverPoint.date : t('hoverTrendHint')}
            </p>
            <div className="space-y-3">
              <MetricPercentBar label={t('metricDensity')} value={display.density} barClassName="bg-emerald-500" />
              <MetricPercentBar label={t('metricOiliness')} value={display.oiliness} barClassName="bg-blue-500" />
              <MetricPercentBar label={t('metricDryness')} value={display.dryness} barClassName="bg-yellow-500" />
              <MetricPercentBar label={t('metricDandruff')} value={display.dandruff} barClassName="bg-purple-500" />
              <MetricPercentBar label={t('metricRedness')} value={display.redness} barClassName="bg-red-500" />
            </div>
          </div>
        </>
      )}

      {onViewAnalysis && recentSessions.length > 0 && (
        <div>
          <p className="text-xs opacity-50 mb-2">{t('pastSessions')}</p>
          <div className="flex flex-wrap gap-2">
            {recentSessions.map(a => {
              const active = viewingAnalysisId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onViewAnalysis(a)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition border ${
                    active
                      ? 'bg-emerald-500/25 border-emerald-500/40 text-emerald-200'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  {formatDateForDisplay(a.createdAt.split('T')[0])}
                  {(() => {
                    const r = getAnalysisClinicalResult(a, resultSource);
                    return r ? (
                      <span className="opacity-60 ms-2 tabular-nums">
                        {r.hairDensity.score}%
                      </span>
                    ) : null;
                  })()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
