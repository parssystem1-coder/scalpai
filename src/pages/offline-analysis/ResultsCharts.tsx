import type { ClinicalAnalysisResult } from '../../db';
import MetricsBar3D from '../../components/MetricsBar3D';
import MetricsRadar3D from '../../components/MetricsRadar3D';
import { useT } from '../../i18n';
import { offlineDict } from './strings';

interface Props {
  result: ClinicalAnalysisResult;
}

export default function ResultsCharts({ result }: Props) {
  const t = useT(offlineDict);

  const getTranslatedLabel = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('تراکم') || l.includes('density')) return t('metricDensity');
    if (l.includes('چربی') || l.includes('oiliness')) return t('metricOiliness');
    if (l.includes('خشکی') || l.includes('dryness')) return t('metricDryness');
    if (l.includes('شوره') || l.includes('dandruff')) return t('metricDandruff');
    if (l.includes('قرمزی') || l.includes('redness')) return t('metricRedness');
    if (l.includes('براقی') || l.includes('shine')) return t('metricShine');
    if (l.includes('لکه‌ای') || l.includes('patchiness')) return t('metricPatchiness');
    if (l.includes('رنگدانه') || l.includes('pigmentation')) return t('metricPigmentation');
    if (l.includes('ضخامت') || l.includes('thickness')) return t('hairThickness');
    return label;
  };

  const translatedChartData = result.chartData?.map(item => ({
    ...item,
    label: getTranslatedLabel(item.label)
  }));

  const radarData = [
    { metric: t('metricDensity'), value: result.hairDensity.score },
    { metric: t('metricOiliness'), value: result.scalpCondition.oiliness },
    { metric: t('metricDryness'), value: result.scalpCondition.dryness },
    { metric: t('metricDandruff'), value: result.scalpCondition.dandruff ?? 0 },
    { metric: t('metricRedness'), value: result.scalpCondition.redness ?? 0 },
    { metric: t('metricShine'), value: result.scalpCondition.shine ?? 0 },
    { metric: t('metricPatchiness'), value: result.scalpCondition.patchiness ?? 0 },
    { metric: t('metricPigmentation'), value: result.scalpCondition.pigmentation ?? 0 },
  ];

  return (
    <>
      <MetricsRadar3D
        data={radarData}
        title={t('metricsRadar')}
      />

      {translatedChartData && translatedChartData.length > 0 && (
        <MetricsBar3D
          data={translatedChartData}
          title={t('metricsChart')}
        />
      )}
    </>
  );
}
