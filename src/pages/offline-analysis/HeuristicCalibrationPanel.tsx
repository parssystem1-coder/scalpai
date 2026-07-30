/**
 * HeuristicCalibrationPanel — موج ۴ (D2): گزارش شواهد کالیبراسیون آستانه‌های heuristic
 * -----------------------------------------------------------------------
 * نقشه‌راه (D2): وقتی گیج «۱۵۰ نمونه برای کالیبراسیون heuristic» سبز شد، نگاشت
 * یادگیری‌شده بین خروجی heuristic و برچسب متخصص یافته و گزارش قبل/بعد داده شود.
 *
 * این پنل آگاهانه «فقط شواهد» است، نه اعمال خودکار:
 *  - تا قبل از سبز شدن گیج، دکمه غیرفعال است و شمارندهٔ پیشرفت نشان داده می‌شود.
 *  - بعد از گیج سبز، کاربر می‌تواند گزارش K-Fold تکرارشونده (۳×۵) را ببیند.
 *  - ضرایب مشترک سه موتور (scalp-constants.json ← heuristicConstants.ts ←
 *    python/analyze.py) این‌جا بازنویسی نمی‌شوند؛ اعمال نهایی به تصمیم بعدی با
 *    حلقهٔ parity عددی TS/Python و رضایت مالک موکول شده است. note خود گزارش
 *    همین را شفاف به کاربر می‌گوید.
 */
import { useMemo, useState } from 'react';
import { Gauge, Play } from 'lucide-react';
import type { TrainingSample } from '../../db';
import {
  buildHeuristicCalibrationReport,
  samplesToCalibrationInput,
  type HeuristicCalibrationReport,
} from '../../lib/heuristicCalibration';
import { MATURITY_TARGETS } from '../../lib/dataMaturity';
import { useLang, usePick } from '../../i18n';
import type { ScalpHeuristicScores } from '../../lib/scalpFeatures';

const SCORE_LABELS: Record<keyof ScalpHeuristicScores, { fa: string; en: string }> = {
  densityScore: { fa: 'تراکم', en: 'Density' },
  oiliness: { fa: 'چربی', en: 'Oiliness' },
  dryness: { fa: 'خشکی', en: 'Dryness' },
  dandruff: { fa: 'شوره', en: 'Dandruff' },
  redness: { fa: 'قرمزی', en: 'Redness' },
  shine: { fa: 'براقی/سبوره', en: 'Shine' },
  patchiness: { fa: 'لکه‌ای بودن', en: 'Patchiness' },
  pigmentation: { fa: 'ناهمگونی رنگدانه', en: 'Pigmentation' },
  hairThickness: { fa: 'ضخامت تار مو', en: 'Hair thickness' },
};

export default function HeuristicCalibrationPanel({
  samples,
}: {
  samples: TrainingSample[];
}) {
  const pick = usePick();
  const { lang } = useLang();
  const isRtl = lang === 'fa';
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<HeuristicCalibrationReport | null>(null);

  const target = MATURITY_TARGETS.heuristicCalibrationSamples;
  // فقط نمونه‌های متخصصِ دارای فیچر و برچسب — همان معیار گیج بلوغ
  const usable = useMemo(() => samplesToCalibrationInput(samples), [samples]);
  const ready = usable.length >= target;

  const handleRun = () => {
    setBusy(true);
    /**
     * محاسبه روی رشتهٔ اصلی است اما سبک (حداکثر چند صد نمونه × ۹ امتیاز ×
     * ۱۵ برازش سادهٔ PAVA/خطی). await کوتاه فقط برای اینکه React فرصت
     * رندر «در حال محاسبه» را داشته باشد — همان الگوی tf.nextFrame ولی بدون TF.
     */
    window.setTimeout(() => {
      try {
        setReport(buildHeuristicCalibrationReport({ samples: usable }));
      } finally {
        setBusy(false);
      }
    }, 16);
  };

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="flex items-center gap-2 font-semibold text-sm">
          <Gauge size={18} className="text-emerald-400" />
          {pick('گزارش کالیبراسیون آستانه‌های heuristic', 'Heuristic-threshold calibration report')}
        </span>
        <span className="text-xs opacity-60">
          {pick(
            `${usable.length} از ${target} نمونهٔ متخصص`,
            `${usable.length} of ${target} expert samples`,
          )}
        </span>
      </div>

      <p className="mt-2 text-xs opacity-65 leading-relaxed">
        {pick(
          'این گزارش با K-Fold تکرارشونده (۳×۵) نشان می‌دهد یک نگاشت یادگیری‌شده (isotonic یا خطی) بین خروجی heuristic و برچسب متخصص چقدر بهتر از عدد خام است — صرفاً «شواهد»؛ اعمال نهایی به ضرایب مشترک فقط با parity عددی سه موتور و رضایت مالک انجام می‌شود.',
          'This report uses repeated K-Fold (3×5) to show how much a learned mapping (isotonic or linear) between heuristic output and expert labels beats the raw heuristic — evidence only; final application to shared constants requires numeric parity across all three engines and owner consent.',
        )}
      </p>

      <button
        type="button"
        disabled={!ready || busy}
        onClick={handleRun}
        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600/80 hover:bg-emerald-500/80 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2 text-sm font-medium transition-colors"
      >
        <Play size={15} />
        {busy
          ? pick('در حال محاسبه…', 'Computing…')
          : ready
            ? pick('محاسبهٔ گزارش (۳×۵ K-Fold)', 'Compute report (3×5 K-Fold)')
            : pick(
              `در انتظار دادهٔ متخصص — ${usable.length}/${target}`,
              `Waiting for expert data — ${usable.length}/${target}`,
            )}
      </button>

      {report && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="opacity-60">{pick('MAE قبل (خروجی خام)', 'MAE before (raw)')}</div>
              <div className="text-lg font-semibold">{report.overallMaeBefore.toFixed(2)}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="opacity-60">{pick('MAE بعد (کالیبره)', 'MAE after (calibrated)')}</div>
              <div className="text-lg font-semibold">{report.overallMaeAfter.toFixed(2)}</div>
            </div>
            <div className={`rounded-xl p-3 ${report.overallDeltaMae > 0 ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-white/5'}`}>
              <div className="opacity-60">{pick('بهبود', 'Improvement')}</div>
              <div className="text-lg font-semibold">
                {report.overallDeltaMae > 0 ? '−' : '+'}{Math.abs(report.overallDeltaMae).toFixed(2)}
              </div>
            </div>
          </div>

          {report.perScore.length > 0 && (
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead className="bg-white/5 sticky top-0">
                  <tr>
                    <th className="p-2 text-start font-medium">{pick('امتیاز', 'Score')}</th>
                    <th className="p-2 text-start font-medium">{pick('جفت', 'Pairs')}</th>
                    <th className="p-2 text-start font-medium">{pick('قبل', 'Before')}</th>
                    <th className="p-2 text-start font-medium">{pick('بعد', 'After')}</th>
                    <th className="p-2 text-start font-medium">{pick('روش منتخب', 'Chosen method')}</th>
                    <th className="p-2 text-start font-medium">{pick('بهبود', 'Δ')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.perScore.map(row => (
                    <tr key={row.key} className="border-t border-white/5">
                      <td className="p-2">{isRtl ? SCORE_LABELS[row.key].fa : SCORE_LABELS[row.key].en}</td>
                      <td className="p-2 opacity-70">{row.pairs}</td>
                      <td className="p-2 opacity-80">{row.maeBefore.toFixed(2)}</td>
                      <td className="p-2 opacity-80">{row.maeAfterChosen.toFixed(2)}</td>
                      <td className="p-2 opacity-70">
                        {row.chosen === 'isotonic' ? 'isotonic' : pick('خطی', 'linear')}
                      </td>
                      <td className={`p-2 font-medium ${row.deltaMae > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {(row.deltaMae > 0 ? '−' : '+') + Math.abs(row.deltaMae).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs opacity-60 leading-relaxed border-t border-white/10 pt-3">
            {report.note}
          </p>
        </div>
      )}
    </div>
  );
}
