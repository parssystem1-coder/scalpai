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
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2, ListChecks } from 'lucide-react';
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
            ? pick('نمره‌ها هنوز تخمینی‌اند — در حال جمع‌آوری داده', 'Scores are still estimates — collecting data')
            : pick('داده کافی جمع شد — آمادهٔ تنظیم دقیق', 'Enough data collected — ready for fine-tuning')}
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      <p className="mt-2 text-xs leading-relaxed opacity-85">
        {report.requiresRecalibration
          ? pick(
            'نمره‌هایی که این برنامه می‌دهد (شوره، قرمزی، تراکم و…) فعلاً بر پایهٔ تخمین کارشناسی تنظیم شده‌اند، نه بر پایهٔ داده‌های واقعی همین کلینیک. یعنی جهت و روند تغییرات قابل اتکاست، ولی عدد دقیق ممکن است کمی بالاتر یا پایین‌تر از واقعیت باشد. تا سبز شدن همهٔ نمودارهای زیر، خروجی را به‌عنوان «غربالگری اولیه» در کنار معاینهٔ خودتان ببینید، نه تشخیص قطعی.',
            'The scores this app produces (dandruff, redness, density, …) are currently set from expert estimation, not from this clinic’s own real data. Trends and direction of change are dependable, but exact numbers may run slightly high or low. Until every gauge below turns green, treat the output as preliminary screening alongside your own examination — not a definitive diagnosis.',
          )
          : pick(
            'داده‌های کافی جمع شده است. حالا می‌توان نمره‌های برنامه را با نظر تخصصی ثبت‌شدهٔ شما مقایسه و دقیق‌تر کرد. فهرست «حالا چه کنیم؟» را در پایین همین کادر باز کنید.',
            'Enough data has been collected. The app’s scores can now be compared against your recorded expert opinion and made more accurate. Open the “what to do now” list at the bottom of this box.',
          )}
      </p>

      {/* راهنمای خواندن رنگ‌ها — بدون این، کاربر نمی‌داند قرمز یعنی خرابی یا فقط «هنوز نه» */}
      <p className="mt-2 text-[11px] leading-relaxed opacity-55">
        {pick(
          'راهنمای رنگ‌ها: قرمز یعنی هنوز داده کم است، زرد یعنی بیش از نیمهٔ راه، سبز یعنی به حد لازم رسیده. رنگ قرمز نشانهٔ خرابی نیست — فقط یعنی هنوز به آن مرحله نرسیده‌ایم.',
          'Colour guide: red means data is still scarce, amber means past halfway, green means the threshold is met. Red is not a fault indicator — it simply means that stage has not been reached yet.',
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
                    <span className="opacity-70 flex-shrink-0 whitespace-nowrap">
                      {g.current} / {g.target} {isFa ? g.unitFa : g.unitEn}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_STYLE[g.status]}`}
                      style={{ width: `${Math.min(100, g.target ? (g.current / g.target) * 100 : 0)}%` }}
                    />
                  </div>

                  {/* «این نمودار چه چیزی را می‌شمارد؟» — به زبان متخصص بالینی */}
                  <p className="mt-2 text-xs opacity-75 leading-relaxed">
                    {isFa ? g.plainFa : g.plainEn}
                  </p>

                  {/* «وقتی سبز شد چه اتفاقی می‌افتد؟» — بدون این، عدد بی‌معناست */}
                  <p className="mt-1.5 text-xs leading-relaxed">
                    <span className={g.status === 'ready' ? 'text-emerald-300' : 'text-amber-300/90'}>
                      {g.status === 'ready'
                        ? pick('✓ رسیده — ', '✓ Reached — ')
                        : pick('پس از رسیدن: ', 'Once reached: ')}
                    </span>
                    <span className="opacity-70">{isFa ? g.whenReadyFa : g.whenReadyEn}</span>
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

          {/*
            بخش «حالا چه کنیم؟» — درخواست صریح مالک محصول.
            همیشه نمایش داده می‌شود (نه فقط بعد از سبز شدن) تا کاربر از قبل
            بداند چه چیزی در انتظارش است؛ ولی وقتی هنوز سبز نشده، صراحتاً
            «هنوز فعال نیست» علامت می‌خورد تا کسی زودتر از موعد شروع نکند.
          */}
          <div>
            <p className="text-xs font-semibold opacity-75 mb-2 flex items-center gap-2">
              <ListChecks size={14} className={report.requiresRecalibration ? 'text-amber-400' : 'text-emerald-400'} />
              {report.requiresRecalibration
                ? pick('وقتی همهٔ نمودارها سبز شدند، چه کنیم؟', 'What to do once every gauge turns green')
                : pick('حالا چه کنیم؟ — این مراحل را به ترتیب انجام دهید', 'What to do now — follow these steps in order')}
            </p>

            {report.requiresRecalibration && (
              <p className="text-xs opacity-60 leading-relaxed mb-2">
                {pick(
                  'این فهرست فقط برای اطلاع شماست و هنوز نوبتش نرسیده. تا سبز شدن همهٔ نمودارهای بالا، هیچ‌کدام از این کارها را انجام ندهید — نتیجه‌اش قابل اتکا نخواهد بود.',
                  'This list is for your awareness only; its time has not come yet. Until every gauge above is green, do none of these — the result would not be dependable.',
                )}
              </p>
            )}

            <ol className="space-y-2">
              {report.nextSteps.map(step => (
                <li
                  key={step.id}
                  className={`rounded-xl p-3 border ${
                    report.requiresRecalibration
                      ? 'bg-black/20 border-white/5 opacity-70'
                      : 'bg-emerald-500/5 border-emerald-500/20'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
                        report.requiresRecalibration
                          ? 'bg-white/10 text-white/60'
                          : 'bg-emerald-500/25 text-emerald-200'
                      }`}
                    >
                      {step.order}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{isFa ? step.titleFa : step.titleEn}</span>
                        <span className="text-[10px] rounded-full px-2 py-0.5 bg-white/10 opacity-70 whitespace-nowrap">
                          {isFa ? step.ownerFa : step.ownerEn}
                        </span>
                      </div>
                      <p className="mt-1 text-xs opacity-65 leading-relaxed">
                        {isFa ? step.detailFa : step.detailEn}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-2 text-xs opacity-55 leading-relaxed">
              {pick(
                'راهنمای کامل‌تر با جزئیات فنی: docs/چه-کنیم-وقتی-داده-رسید.md داخل پوشهٔ برنامه.',
                'Fuller guide with technical detail: docs/چه-کنیم-وقتی-داده-رسید.md inside the app folder.',
              )}
            </p>
          </div>

          <p className="text-xs opacity-55 leading-relaxed">
            {pick(
              'یادآوری: ارتقای بزرگ تشخیص تصویر عمداً به بعد از رسیدن داده به حد نصاب موکول شده است، چون همهٔ عکس‌های برچسب‌خوردهٔ فعلی را از درجهٔ اعتبار ساقط می‌کند و جمع‌آوری داده باید از نو شروع شود.',
              'Reminder: the major image-recognition upgrade is deliberately deferred until data thresholds are met, because it invalidates every currently labelled photo and data collection must restart from scratch.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}
