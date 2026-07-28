/**
 * مقایسهٔ خروجی مدل محلی با موتور heuristic روی فیچرهای یک نمونهٔ ذخیره‌شده
 */
import { useState } from 'react';
import { GitCompare, Loader } from 'lucide-react';
import type { TrainingSample } from '../../db';
import { heuristicScoresFromMetrics, type ScalpRawMetrics } from '../../lib/scalpFeatures';
import { useT } from '../../i18n';
import { offlineDict } from './strings';

async function loadLocalModel() {
  return import('../../lib/localModel');
}

const SCORE_ROWS = [
  { key: 'oiliness' as const, labelKey: 'metricOiliness' as const },
  { key: 'dryness' as const, labelKey: 'metricDryness' as const },
  { key: 'dandruff' as const, labelKey: 'metricDandruff' as const },
  { key: 'redness' as const, labelKey: 'metricRedness' as const },
  { key: 'densityScore' as const, labelKey: 'metricDensity' as const },
  { key: 'shine' as const, labelKey: 'metricShine' as const },
  { key: 'patchiness' as const, labelKey: 'metricPatchiness' as const },
  { key: 'pigmentation' as const, labelKey: 'metricPigmentation' as const },
];

interface Props {
  samples: TrainingSample[];
  modelReady: boolean;
}

export default function EngineComparePanel({ samples, modelReady }: Props) {
  const t = useT(offlineDict);
  const usable = samples.filter(s => s.features);
  const [sampleId, setSampleId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    heuristic: ReturnType<typeof heuristicScoresFromMetrics>;
    model: ReturnType<typeof heuristicScoresFromMetrics> | null;
    mae: number | null;
  } | null>(null);

  const run = async () => {
    setError('');
    setResult(null);
    if (!modelReady) {
      setError(t('noModelForCompare'));
      return;
    }
    const sample = usable.find(s => s.id === sampleId);
    if (!sample?.features) return;

    setRunning(true);
    try {
      const metrics = sample.features as ScalpRawMetrics;
      const heuristic = heuristicScoresFromMetrics(metrics);
      const { compareModelToScores } = await loadLocalModel();
      const cmp = await compareModelToScores(
        metrics,
        heuristic,
        sample.questionnaireFeatures,
      );
      setResult({
        heuristic,
        model: cmp?.model?.scores ?? null,
        mae: cmp?.mae ?? null,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  if (usable.length === 0) return null;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center gap-2 mb-2">
        <GitCompare size={18} className="text-cyan-400" />
        <h3 className="font-semibold">{t('compareEngines')}</h3>
      </div>
      <p className="text-xs opacity-60 mb-4">{t('compareHint')}</p>

      <div className="flex flex-wrap gap-3 items-center mb-4">
        <select
          value={sampleId}
          onChange={e => setSampleId(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-sm min-w-[200px]"
        >
          <option value="">{t('selectImageOption')}</option>
          {usable.slice(0, 40).map(s => (
            <option key={s.id} value={s.id}>
              {s.labelSource} · {s.createdAt.split('T')[0]}
            </option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={!sampleId || running}
          className="px-4 py-2 rounded-xl bg-cyan-600/80 hover:bg-cyan-600 disabled:opacity-40 text-sm flex items-center gap-2"
        >
          {running ? <Loader size={14} className="animate-spin" /> : null}
          {t('runCompare')}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

      {result && (
        <div className="overflow-x-auto">
          {typeof result.mae === 'number' && (
            <p className="text-sm mb-3">
              {t('avgDiff')}: <span className="font-semibold text-cyan-300">{result.mae.toFixed(1)}</span>
            </p>
          )}
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[30%]" />
              <col className="w-[30%]" />
            </colgroup>
            <thead>
              <tr className="opacity-60">
                <th className="py-2 pe-3 font-medium text-start" />
                <th className="py-2 px-2 font-medium text-center">{t('heuristicCol')}</th>
                <th className="py-2 px-2 font-medium text-center">{t('modelCol')}</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_ROWS.map(row => (
                <tr key={row.key} className="border-t border-white/5">
                  <td className="py-1.5 pe-3 opacity-70 text-start">{t(row.labelKey)}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums">{result.heuristic[row.key]}</td>
                  <td className="py-1.5 px-2 text-center tabular-nums">
                    {result.model ? result.model[row.key] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
