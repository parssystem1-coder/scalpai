import {
  CheckCircle, BarChart3, User, Calendar, Eye, Printer, Share2, AlertTriangle, FileDown, Gauge,
} from 'lucide-react';
import {
  RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';
import type { AIAnalysisResult, Analysis, Client, ClinicalAnalysisResult, OfflineAnalysisResult } from '../../db';
import DiagnosisResultGrid from '../../components/DiagnosisResultGrid';
import MetricPercentBar from '../../components/MetricPercentBar';
import ImageQualityWarning from '../../components/ImageQualityWarning';
import { resolveObservations, lesionDisplayLabel } from '../../lib/diagnosisCatalog';
import { formatDateForDisplay } from '../../lib/jalaliDate';
import { useLang, useT } from '../../i18n';
import { offlineDict } from './strings';
import { computeHealthScore, healthScoreColor, healthScoreLabel } from './healthScore';
import ResultsCharts from './ResultsCharts';
import AIInsightCharts from '../../components/AIInsightCharts';
import CompareTrendSection from './CompareTrendSection';
import {
  buildReportText,
  extractKeyFindings,
  prioritizeRecommendations,
  buildMetricDeltas,
  findPreviousClinicalResult,
  type ResultSource,
} from './resultInsights';
import { openPrintableReport, saveReportPdf, type PrintReportOpts } from './printReport';
import { buildClientPdfFileName } from './capturePrintCharts';
import { buildClinicalTrendPoints } from './printTrend';

interface Props {
  result: ClinicalAnalysisResult | null;
  client: Client | null;
  analysisDate?: string | null;
  viewingAnalysisId?: string | null;
  clientHistory: Analysis[];
  onGoToVisualization: () => void;
  onViewAnalysis?: (analysis: Analysis) => void;
  /** منبع نتایج برای مقایسه/روند — پیش‌فرض آفلاین */
  resultSource?: ResultSource;
}

export default function ResultsTab({
  result,
  client,
  analysisDate,
  viewingAnalysisId,
  clientHistory,
  onGoToVisualization,
  onViewAnalysis,
  resultSource = 'offline',
}: Props) {
  const t = useT(offlineDict);
  const { lang } = useLang();

  if (!result) {
    return (
      <div className="text-center py-16 opacity-50">
        <BarChart3 size={64} className="mx-auto mb-4 opacity-30" />
        <p>{t('performAnalysisFirst')}</p>
      </div>
    );
  }

  const scoreLike = {
    oiliness: result.scalpCondition.oiliness,
    dryness: result.scalpCondition.dryness,
    dandruff: result.scalpCondition.dandruff ?? 0,
    redness: result.scalpCondition.redness ?? 0,
    densityScore: result.hairDensity.score,
    shine: result.scalpCondition.shine,
    patchiness: result.scalpCondition.patchiness,
    pigmentation: result.scalpCondition.pigmentation,
    hairThickness: result.scalpCondition.hairThickness,
  };
  const resolvedObs = resolveObservations(result.observations, scoreLike);
  const observations = resolvedObs.ids;
  const filledFromHeuristic =
    result.observationsFilledFromHeuristic === true ||
    (result.observationsFilledFromHeuristic !== false && resolvedObs.filledFromHeuristic);
  const isOfflineSource = resultSource !== 'ai';

  const hasSpecialized =
    result.scalpCondition.shine != null ||
    result.scalpCondition.patchiness != null ||
    result.scalpCondition.pigmentation != null ||
    result.scalpCondition.hairThickness != null;

  const score = computeHealthScore(result);
  const scoreColor = healthScoreColor(score);
  const scoreLabel = healthScoreLabel(score, lang);
  const findings = extractKeyFindings(result, lang, 3);
  const prioritized = prioritizeRecommendations(result);
  const displayLesions = result.lesionSummary?.global ?? [...result.lesions.reduce((map, lesion) => {
    const current = map.get(lesion.type);
    if (current) {
      current.maxConfidence = Math.max(current.maxConfidence, lesion.confidence);
      current.occurrenceCount += 1;
    } else {
      map.set(lesion.type, {
        type: lesion.type,
        maxConfidence: lesion.confidence,
        affectedPhotoRegionCount: 1,
        occurrenceCount: 1,
      });
    }
    return map;
  }, new Map<string, { type: string; maxConfidence: number; affectedPhotoRegionCount: number; occurrenceCount: number }>()).values()];

  const clientName = client
    ? `${client.firstName} ${client.lastName}`.trim()
    : t('unknownClient');
  const dateLabel = analysisDate
    ? formatDateForDisplay(analysisDate.split('T')[0])
    : formatDateForDisplay(new Date().toISOString().split('T')[0]);

  const reportTitle = resultSource === 'ai' ? t('reportTitleAi') : t('reportTitle');

  const reportOpts = (): PrintReportOpts => {
    const trendPoints = buildClinicalTrendPoints(clientHistory, resultSource);
    const previous = findPreviousClinicalResult(clientHistory, resultSource, viewingAnalysisId);
    const trendDeltas = previous ? buildMetricDeltas(result, previous, lang) : [];

    return {
      title: reportTitle,
      clientName,
      dateLabel,
      score,
      scoreLabel,
      scoreColor,
      findings,
      result,
      recommendations: prioritized,
      disclaimer: t('specializedHint'),
      trendPoints,
      trendDeltas,
      lesionLabels: Object.fromEntries(
        (result.lesionSummary?.global ?? []).map(item => [item.type, lesionDisplayLabel(item.type, lang)]),
      ),
      labels: {
        health: t('overallHealthScore'),
        keyFindings: t('keyFindings'),
        density: t('hairDensity'),
        scalp: t('scalpCondition'),
        oiliness: t('oiliness'),
        dryness: t('dryness'),
        dandruff: t('dandruff'),
        redness: t('redness'),
        hairLoss: t('hairLoss'),
        lesions: t('lesions'),
        noLesions: t('noLesions'),
        recommendations: t('recommendations'),
        urgent: t('recUrgent'),
        care: t('recCare'),
        followup: t('recFollowup'),
        shine: t('shine'),
        patchiness: t('patchiness'),
        pigmentation: t('pigmentation'),
        hairThickness: t('hairThickness'),
        chartsSection: t('chartsSection'),
        specialized: t('specializedIndicators'),
        previewPrint: t('printReport'),
        previewSavePdf: t('savePdf'),
        previewClose: t('close'),
        trendOverTime: t('trendOverTime'),
        comparePrevious: t('comparePrevious'),
        noPreviousSession: t('noPreviousSession'),
        improved: t('improved'),
        worsened: t('worsened'),
        unchanged: t('unchanged'),
        sessionDetails: t('sessionDetails'),
        latestSession: t('latestSession'),
        reportDate: t('reportDate'),
        metricDensity: t('metricDensity'),
        metricOiliness: t('metricOiliness'),
        metricDryness: t('metricDryness'),
        metricDandruff: t('metricDandruff'),
        metricRedness: t('metricRedness'),
      },
    };
  };

  const handlePrint = async () => {
    toast.message(t('preparingReport'));
    const ok = await openPrintableReport(reportOpts());
    if (!ok) toast.error(t('printBlocked'));
  };

  const handleSavePdf = async () => {
    toast.message(t('preparingReport'));
    const res = await saveReportPdf(
      reportOpts(),
      buildClientPdfFileName(clientName),
    );
    if (res.canceled) return;
    if (res.success) {
      toast.success(res.filePath ? `${t('pdfSaved')}: ${res.filePath}` : t('pdfSaved'));
    } else {
      toast.error(res.error || t('pdfSaveFailed'));
    }
  };

  const handleShare = async () => {
    const text = buildReportText({
      clientName,
      dateLabel,
      score,
      scoreLabel,
      findings,
      result,
      recommendations: prioritized,
      lang,
      reportHeading: `ScalpAI — ${reportTitle}`,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: reportTitle, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast.success(t('shareCopied'));
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(t('shareCopied'));
      } catch {
        toast.error(t('shareFailed'));
      }
    }
  };

  const urgentRecs = prioritized.filter(r => r.priority === 'urgent');
  const careRecs = prioritized.filter(r => r.priority === 'care');
  const followRecs = prioritized.filter(r => r.priority === 'followup');

  return (
    <div className="space-y-6">
      {/* منبع نتیجه + صداقت محصول */}
      <div className="flex flex-wrap gap-2 items-stretch">
        <div
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border ${
            isOfflineSource
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-100'
              : 'bg-violet-500/15 border-violet-500/35 text-violet-100'
          }`}
        >
          {isOfflineSource ? t('sourceBadgeOffline') : t('sourceBadgeAi')}
        </div>
        {isOfflineSource && (
          <div className="flex-1 min-w-[16rem] flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-400" />
            <span>{t('screeningDisclaimer')}</span>
          </div>
        )}
      </div>
      {filledFromHeuristic && (
        <div className="flex items-start gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-100/90">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-orange-400" />
          <span>{t('heuristicFilledHint')}</span>
        </div>
      )}
      {isOfflineSource && (
        <ImageQualityWarning quality={(result as OfflineAnalysisResult).imageQuality} />
      )}
      {/* فاز ۴٫۳ — ورودی خارج از توزیع دادهٔ آموزشی مدل محلی */}
      {isOfflineSource
        && (result as OfflineAnalysisResult).ood?.evaluated
        && (result as OfflineAnalysisResult).ood!.level !== 'inRange' && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-400" />
          <span>
            {(result as OfflineAnalysisResult).ood!.level === 'outOfRange'
              ? t('oodOutOfRange')
              : t('oodBorderline')}
            {/* موج ۱ (W1-1) — عدد فاصلهٔ ماهالانوبیس برای عیب‌یابی متخصص */}
            {typeof (result as OfflineAnalysisResult).ood!.mahalanobisDistance === 'number'
              && Number.isFinite((result as OfflineAnalysisResult).ood!.mahalanobisDistance) && (
              <span className="opacity-70 text-xs block mt-0.5">
                {t('oodDistanceLabel')}: {(result as OfflineAnalysisResult).ood!.mahalanobisDistance!.toFixed(2)}
              </span>
            )}
          </span>
        </div>
      )}
      {/* موج ۱ (W1-1) — نمایش نمرهٔ عدم‌قطعیت MC-Dropout به پزشک */}
      {isOfflineSource
        && (result as OfflineAnalysisResult).engine === 'model'
        && typeof (result as OfflineAnalysisResult).modelUncertainty === 'number'
        && Number.isFinite((result as OfflineAnalysisResult).modelUncertainty) && (() => {
          // آستانه‌های نمایش برآورد مهندسی‌اند و طبق قرارداد پروژه با دادهٔ
          // میدانی آینده بازکالیبره می‌شوند (مانند آستانه‌های OOD).
          const u = (result as OfflineAnalysisResult).modelUncertainty!;
          const level: 'high' | 'medium' | 'low' = u < 0.05 ? 'high' : u < 0.12 ? 'medium' : 'low';
          const styles = {
            high: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100/90',
            medium: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100/90',
            low: 'border-orange-500/30 bg-orange-500/10 text-orange-100/90',
          } as const;
          const iconColor = { high: 'text-emerald-400', medium: 'text-yellow-400', low: 'text-orange-400' } as const;
          const label = level === 'high'
            ? t('uncertaintyHighConfidence')
            : level === 'medium'
              ? t('uncertaintyMediumConfidence')
              : t('uncertaintyHighLevel');
          return (
            <div
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${styles[level]}`}
              title={t('modelUncertaintyHint')}
            >
              <Gauge size={16} className={`flex-shrink-0 mt-0.5 ${iconColor[level]}`} />
              <span>
                {t('modelConfidenceTitle')}: <b>{label}</b>
                <span className="opacity-60 text-xs" dir="ltr"> ({u.toFixed(3)})</span>
              </span>
            </div>
          );
        })()}
      {isOfflineSource && (result as OfflineAnalysisResult).engine !== 'model' && (
        <div className="flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-sm text-sky-100/85">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-sky-400" />
          <span>{t('heuristicExperimentalNote')}</span>
        </div>
      )}
      {/* فاز ۳٫۵ — پاسخ مشکوک به «ندیدن تصویر» */}
      {!isOfflineSource && !!(result as AIAnalysisResult).genericResponseWarning?.length && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100/90">
          <div className="flex items-start gap-2 mb-1">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
            <span className="font-medium">
              {lang === 'fa'
                ? 'این پاسخ ممکن است بدون تحلیل واقعی تصویر تولید شده باشد (مثلاً مدل پشت سرویس قابلیت بینایی نداشته باشد):'
                : 'This response may have been produced without actually analyzing the image (e.g. the backing model may lack vision):'}
            </span>
          </div>
          <ul className="list-disc ps-6 space-y-0.5 text-xs opacity-90">
            {(result as AIAnalysisResult).genericResponseWarning!.map(r => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {/* فاز ۰٫۲ — تناقض داخلی پاسخ AI (امتیاز عددی در برابر تشخیص گزارش‌شده) */}
      {!isOfflineSource && !!(result as AIAnalysisResult).consistencyConflicts?.length && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/90">
          <div className="flex items-start gap-2 mb-1">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-400" />
            <span className="font-medium">{t('aiConsistencyWarningTitle')}</span>
          </div>
          <ul className="list-disc ps-6 space-y-0.5 text-xs opacity-90">
            {(result as AIAnalysisResult).consistencyConflicts!.map(c => (
              <li key={`${c.observation}-${c.scoreKey}`}>
                {lang === 'fa' ? c.messageFa : c.messageEn}
              </li>
            ))}
          </ul>
        </div>
      )}



      {/* ۲. هدر نتیجه */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center flex-shrink-0">
              <User size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs opacity-50">{t('reportClient')}</p>
              <p className="font-semibold truncate">{clientName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <Calendar size={18} className="opacity-70" />
            </span>
            <div>
              <p className="text-xs opacity-50">{t('reportDate')}</p>
              <p className="font-semibold">{dateLabel}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onGoToVisualization}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition text-sm"
          >
            <Eye size={16} />
            {t('viewImage')}
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 transition text-sm"
          >
            <Printer size={16} />
            {t('printReport')}
          </button>
          <button
            type="button"
            onClick={handleSavePdf}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 transition text-sm"
          >
            <FileDown size={16} />
            {t('savePdf')}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 transition text-sm"
          >
            <Share2 size={16} />
            {t('shareReport')}
          </button>
        </div>
      </div>

      {/* ۵. امتیاز سلامت بالا */}
      <div
        className="rounded-2xl bg-white/5 border border-white/10 p-6 flex flex-col sm:flex-row items-center gap-6"
        data-print-chart="score"
        data-print-title={t('overallHealthScore')}
      >
        <div className="relative w-40 h-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              innerRadius="70%"
              outerRadius="100%"
              data={[{ value: score, fill: scoreColor }]}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={12} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold" style={{ color: scoreColor }}>{score}</span>
            <span className="text-xs opacity-70">{scoreLabel}</span>
          </div>
        </div>
        <div className="text-center sm:text-start">
          <h3 className="font-semibold text-lg mb-1">{t('overallHealthScore')}</h3>
          <p className="text-sm opacity-60">{t('overallHealthScoreHint')}</p>
        </div>
      </div>

      <AIInsightCharts
        findings={findings}
        lesionSummary={result.lesionSummary}
        mode="findings"
        lang={lang}
        labels={{
          keyFindingsChart: t('keyFindingsChart'),
          keyFindingsChartHint: t('keyFindingsChartHint'),
          lesionsByRegion: t('lesionsByRegion'),
          lesionsByRegionChartHint: t('lesionsByRegionChartHint'),
          unknownRegion: t('unknownRegion'),
          affectedAreas: t('affectedAreas'),
          high: t('severityHigh'),
          medium: t('severityMedium'),
          low: t('severityLow'),
          noRegionData: t('noRegionData'),
          confidence: t('confidence'),
          conditions: t('clinicalConditions'),
          trichoscopyFindings: t('trichoscopyFindings'),
          observed: t('observedFinding'),
          possible: t('possibleCondition'),
          requiresConfirmation: t('requiresConfirmation'),
          finalResult: t('finalResult'),
          allLenses: t('allLenses'),
          lensFilter: t('lensFilter'),
        }}
      />

      {/* ۳. مقایسه با جلسه قبل + نمودار روند */}
      <CompareTrendSection
        result={result}
        clientHistory={clientHistory}
        viewingAnalysisId={viewingAnalysisId}
        onViewAnalysis={onViewAnalysis}
        resultSource={resultSource}
      />

      {/* ۷. دیسکلیمر */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
        <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-amber-400" />
        <p>{t('specializedHint')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
          <h3 className="font-semibold mb-4">{t('hairDensity')}</h3>
          <div className="text-3xl font-bold text-emerald-400">{result.hairDensity.score}%</div>
          <p className="text-sm opacity-70 mt-1">{result.hairDensity.level}</p>
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all" style={{ width: `${result.hairDensity.score}%` }} />
          </div>
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
          <h3 className="font-semibold mb-4">{t('scalpCondition')}</h3>
          <div className="space-y-3">
            <MetricPercentBar label={t('oiliness')} value={result.scalpCondition.oiliness} barClassName="bg-orange-500" />
            <MetricPercentBar label={t('dryness')} value={result.scalpCondition.dryness} barClassName="bg-yellow-500" />
            {result.scalpCondition.dandruff != null && (
              <MetricPercentBar label={t('dandruff')} value={result.scalpCondition.dandruff} barClassName="bg-purple-500" />
            )}
            {result.scalpCondition.redness != null && (
              <MetricPercentBar label={t('redness')} value={result.scalpCondition.redness} barClassName="bg-red-500" />
            )}
          </div>
        </div>

        {hasSpecialized && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
            <h3 className="font-semibold mb-4">{t('specializedIndicators')}</h3>
            <div className="space-y-3">
              {result.scalpCondition.shine != null && (
                <MetricPercentBar label={t('shine')} value={result.scalpCondition.shine} barClassName="bg-cyan-400" />
              )}
              {result.scalpCondition.patchiness != null && (
                <MetricPercentBar label={t('patchiness')} value={result.scalpCondition.patchiness} barClassName="bg-pink-500" />
              )}
              {result.scalpCondition.pigmentation != null && (
                <MetricPercentBar label={t('pigmentation')} value={result.scalpCondition.pigmentation} barClassName="bg-indigo-400" />
              )}
              {result.scalpCondition.hairThickness != null && (
                <MetricPercentBar label={t('hairThickness')} value={result.scalpCondition.hairThickness} barClassName="bg-teal-400" />
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
          <h3 className="font-semibold mb-4">{t('hairLoss')}</h3>
          <div className="text-2xl font-bold text-teal-400">{result.hairLoss.level}</div>
          <p className="text-sm opacity-70 mt-1">{result.hairLoss.pattern}</p>
          {'engine' in result && result.engine && (
            <p className="text-xs opacity-50 mt-2">{t('engine')} {result.engine}</p>
          )}
        </div>

        <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
          <h3 className="font-semibold mb-4">{t('lesions')}</h3>
          {result.lesions.length === 0 ? (
            <p className="text-green-400">{t('noLesions')}</p>
          ) : (
            <div className="space-y-3">
              {displayLesions.map((item, i) => {
                const barColors = ['bg-emerald-500', 'bg-teal-400', 'bg-cyan-500', 'bg-green-400', 'bg-lime-500'];
                return (
                  <MetricPercentBar
                    key={item.type}
                    label={`${lesionDisplayLabel(item.type, lang)} — ${item.affectedPhotoRegionCount} ${t('affectedAreas')}`}
                    value={Math.round(item.maxConfidence * 100)}
                    barClassName={barColors[i % barColors.length]}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AIInsightCharts
        findings={findings}
        lesionSummary={result.lesionSummary}
        mode="regions"
        lang={lang}
        labels={{
          keyFindingsChart: t('keyFindingsChart'),
          keyFindingsChartHint: t('keyFindingsChartHint'),
          lesionsByRegion: t('lesionsByRegion'),
          lesionsByRegionChartHint: t('lesionsByRegionChartHint'),
          unknownRegion: t('unknownRegion'),
          affectedAreas: t('affectedAreas'),
          high: t('severityHigh'),
          medium: t('severityMedium'),
          low: t('severityLow'),
          noRegionData: t('noRegionData'),
          confidence: t('confidence'),
          conditions: t('clinicalConditions'),
          trichoscopyFindings: t('trichoscopyFindings'),
          observed: t('observedFinding'),
          possible: t('possibleCondition'),
          requiresConfirmation: t('requiresConfirmation'),
          finalResult: t('finalResult'),
          allLenses: t('allLenses'),
          lensFilter: t('lensFilter'),
        }}
      />

      <DiagnosisResultGrid
        selectedIds={observations}
        title={t('clinicalObservations')}
        emptyHint={t('observationsAutoHint')}
        accent="emerald"
      />

      <ResultsCharts result={result} />

      {result.questionnaireInterpretation && (
        (result.questionnaireInterpretation.flags.length > 0 ||
          result.questionnaireInterpretation.confidenceLabelFa) && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="text-amber-400" size={20} />
                {t('clinicalFlags')}
              </h3>
              <span className="text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 opacity-80">
                {t('interpretationConfidence')}:{' '}
                {lang === 'fa'
                  ? result.questionnaireInterpretation.confidenceLabelFa
                  : result.questionnaireInterpretation.confidenceLabelEn}
              </span>
            </div>
            <p className="text-sm opacity-50">{t('clinicalFlagsHint')}</p>
            {result.questionnaireInterpretation.flags.length > 0 ? (
              <ul className="space-y-2">
                {result.questionnaireInterpretation.flags.map(flag => {
                  const cls =
                    flag.severity === 'alert'
                      ? 'border-red-400/40 bg-red-500/15 text-red-200'
                      : flag.severity === 'caution'
                        ? 'border-amber-400/40 bg-amber-500/15 text-amber-100'
                        : 'border-sky-400/30 bg-sky-500/10 text-sky-100';
                  return (
                    <li
                      key={flag.id}
                      className={`px-3 py-2 rounded-xl border text-sm ${cls}`}
                    >
                      {lang === 'fa' ? flag.labelFa : flag.labelEn}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm opacity-50">
                {lang === 'fa'
                  ? result.questionnaireInterpretation.confidenceLabelFa
                  : result.questionnaireInterpretation.confidenceLabelEn}
              </p>
            )}
          </div>
        )
      )}

      {/* ۶. پیشنهادات اولویت‌بندی‌شده */}
      <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
        <h3 className="font-semibold mb-1 flex items-center gap-2">
          <CheckCircle className="text-green-400" size={20} />
          {t('recommendations')}
        </h3>
        <p className="text-sm opacity-50 mb-4">{t('recommendationsHint')}</p>

        {([
          { key: 'urgent' as const, items: urgentRecs, label: t('recUrgent'), cls: 'bg-red-500/20 text-red-300' },
          { key: 'care' as const, items: careRecs, label: t('recCare'), cls: 'bg-amber-500/20 text-amber-300' },
          { key: 'followup' as const, items: followRecs, label: t('recFollowup'), cls: 'bg-indigo-500/20 text-indigo-300' },
        ]).map(group =>
          group.items.length === 0 ? null : (
            <div key={group.key} className="mb-4 last:mb-0">
              <p className={`inline-flex text-xs font-semibold px-2.5 py-1 rounded-full mb-2 ${group.cls}`}>
                {group.label}
              </p>
              <ul className="space-y-2">
                {group.items.map((rec, idx) => (
                  <li key={`${group.key}-${idx}`} className="flex items-start gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-sm flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span>{rec.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
