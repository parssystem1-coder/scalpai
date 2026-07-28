/**
 * DataMaturityPanel — فاز ۴
 *
 * هشدار دائمی: «تصمیم‌های این سیستم هنوز بر پایهٔ تخمین مهندسی‌اند و باید بعداً
 * با داده واقعی بازکالیبره شوند.»
 *
 * این پنل عمداً قابل بستن/نادیده‌گرفتن دائمی نیست و تا رسیدن داده به حد نصاب
 * سرجایش می‌ماند، تا با گذشت زمان فراموش نشود که این اعداد موقتی‌اند.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import type { LocalModelMetadata, TrainingSample } from '../../db';
import { buildDataMaturityReport, type MaturityStatus } from '../../lib/dataMaturity';
import { selectAgreementSamples } from '../../lib/aiAgreement';
import { OBSERVATION_IDS } from '../../lib/diagnosisCatalog';
import { useLang, usePick } from '../../i18n';

const STATUS_STYLE: Record<MaturityStatus, string> = {
  insufficient: 'bg-red-400',
  emerging: 'bg-amber-400',
  ready: 'bg-emerald-400',
};

export default function DataMaturityPanel({
  samples,
  eligibleCount,
  modelMetadata,
}: {
  samples: TrainingSample[];
  eligibleCount: number;
  modelMetadata: LocalModelMetadata | null;
}) {
  const pick = usePick();
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  const report = useMemo(() => {
    const distinctClients = new Set(
      samples.filter(s => !!s.clientId).map(s => s.clientId),
    ).size;
    return buildDataMaturityReport({
      eligibleSampleCount: eligibleCount,
      aiAgreementSampleCount: selectAgreementSamples(samples).length,
      distinctClientCount: distinctClients,
      suppressedLabelCount: modelMetadata?.suppressedLabels?.length ?? OBSERVATION_IDS.length,
      totalLabelCount: OBSERVATION_IDS.length,
    });
  }, [samples, eligibleCount, modelMetadata]);

  const isFa = lang === 'fa';

  return (
    <div
      className={`rounded-2xl border p-6 ${
        report.requiresRecalibration
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-emerald-500/40 bg-emerald-500/10'
      }`}
    >
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 font-semibold">
          {report.requiresRecalibration
            ? <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            : <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />}
          {report.requiresRecalibration
            ? pick('نیازمند کالیبراسیون مجدد با داده واقعی', 'Requires recalibration with real data')
            : pick('داده به حد نصاب رسیده — زمان بازبینی است', 'Data thresholds met — time to recalibrate')}
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      <p className="mt-2 text-xs leading-relaxed opacity-85">
        {report.requiresRecalibration
          ? pick(
            'بخش مهمی از اعداد این سامانه (آستانه‌های تحلیل آفلاین، ضرایب کالیبراسیون لنز، حاشیهٔ گیت بازآموزی و آستانه‌های هشدار) با قضاوت مهندسی انتخاب شده‌اند، نه از روی داده واقعی. تا رسیدن داده به حد نصاب، این خروجی‌ها را «غربالگری اولیه» بدانید و بعد از جمع‌آوری داده حتماً بازکالیبره کنید.',
            'A significant share of this system’s numbers (offline thresholds, lens calibration factors, retrain-gate margins and warning thresholds) were chosen by engineering judgement, not derived from real data. Until the data thresholds are met, treat these outputs as preliminary screening and recalibrate once data is collected.',
          )
          : pick(
            'حجم داده برای بازتنظیم مبتنی بر شواهد کافی است. اکنون باید آستانه‌ها و ضرایب حدسی با مقادیر به‌دست‌آمده از داده جایگزین شوند.',
            'There is now enough data for evidence-based refitting. The provisional thresholds and factors should be replaced with values derived from the data.',
          )}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all"
            style={{ width: `${report.overallProgress}%` }}
          />
        </div>
        <span className="text-xs font-medium opacity-80">{report.overallProgress}%</span>
      </div>

      {expanded && (
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-xs font-semibold opacity-75 mb-2">
              {pick('پیشرفت جمع‌آوری داده', 'Data collection progress')}
            </p>
            <div className="space-y-2">
              {report.gauges.map(g => (
                <div key={g.id} className="rounded-xl bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs mb-1">
                    <span className="font-medium">{isFa ? g.titleFa : g.titleEn}</span>
                    <span className="opacity-70 flex-shrink-0">
                      {g.current} / {g.target}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_STYLE[g.status]}`}
                      style={{ width: `${Math.min(100, g.target ? (g.current / g.target) * 100 : 0)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs opacity-60 leading-relaxed">
                    {isFa ? g.actionFa : g.actionEn}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold opacity-75 mb-2">
              {pick(
                'تصمیم‌هایی که فعلاً حدسی‌اند و باید با داده جایگزین شوند',
                'Decisions that are currently provisional and must be replaced by data',
              )}
            </p>
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-white/5">
                  <tr>
                    <th className="p-2 text-start font-medium">{pick('حوزه', 'Area')}</th>
                    <th className="p-2 text-start font-medium">{pick('مبنای فعلی', 'Current basis')}</th>
                    <th className="p-2 text-start font-medium">{pick('نیازمند', 'Needs')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.provisionalDecisions.map(d => (
                    <tr key={d.id} className="border-t border-white/5 align-top">
                      <td className="p-2 font-medium">{isFa ? d.areaFa : d.areaEn}</td>
                      <td className="p-2 opacity-70">{isFa ? d.currentBasisFa : d.currentBasisEn}</td>
                      <td className="p-2 opacity-70">{isFa ? d.needsFa : d.needsEn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs opacity-55 leading-relaxed">
            {pick(
              'یادآوری: ارتقای فیچر تصویری به embedding یادگرفته‌شده و segmentation واقعی مو/پوست عمداً به بعد از رسیدن داده به حد نصاب موکول شده‌اند، چون هر دو نسخهٔ فیچر را باطل می‌کنند و استخر آموزشی را از صفر شروع می‌کنند.',
              'Reminder: upgrading to a learned image embedding and true hair/scalp segmentation were deliberately deferred until data thresholds are met, since both invalidate the feature version and reset the training pool.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
