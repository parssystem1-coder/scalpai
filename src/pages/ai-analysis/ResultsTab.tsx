/**
 * نتایج AI — همان UI کامل نتایج آفلاین (هدر، یافته‌ها، روند، نمودارها، چاپ/PDF)
 */
import type { Analysis, Client, AIAnalysisResult } from '../../db';
import OfflineResultsTab from '../offline-analysis/ResultsTab';

interface Props {
  result: AIAnalysisResult | null;
  client: Client | null;
  analysisDate?: string | null;
  viewingAnalysisId?: string | null;
  clientHistory: Analysis[];
  onGoToVisualization: () => void;
  onViewAnalysis?: (analysis: Analysis) => void;
}

export default function ResultsTab(props: Props) {
  return <OfflineResultsTab {...props} resultSource="ai" />;
}
