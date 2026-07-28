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

      {result.chartData && result.chartData.length > 0 && (
        <MetricsBar3D
          data={result.chartData}
          title={t('metricsChart')}
        />
      )}
    </>
  );
}
