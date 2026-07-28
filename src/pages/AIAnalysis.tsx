/**
 * AIAnalysis — پوستهٔ صفحهٔ تحلیل هوش مصنوعی
 * منطق در useAISession، هر تب یک کامپوننت مستقل در src/pages/ai-analysis/
 */
import { Eye, Trash2 } from 'lucide-react';
import { useLang, useT } from '../i18n';
import { useAISession } from './ai-analysis/useAISession';
import { tabs } from './ai-analysis/constants';
import { aiAnalysisDict } from './ai-analysis/strings';
import ClientVisitHistoryTab from '../components/ClientVisitHistoryTab';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import AnalysisTab from './ai-analysis/AnalysisTab';
import ResultsTab from './ai-analysis/ResultsTab';
import VisualizationTab from './ai-analysis/VisualizationTab';
import AllAnalysesTab from './ai-analysis/AllAnalysesTab';

export default function AIAnalysis() {
  const t = useT(aiAnalysisDict);
  const { isRtl } = useLang();
  const s = useAISession();

  return (
    <div className="space-y-6">
      <MedicalDisclaimer isRtl={isRtl} compact />

      {s.isReadOnly && s.viewingAnalysis && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/20 border border-yellow-500/50">
          <div className="flex items-center gap-2 text-yellow-400">
            <Eye size={20} />
            <span>{t('viewMode')}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => s.handleDelete(s.viewingAnalysis!.id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition"
            >
              <Trash2 size={16} />
              <span>{t('delete')}</span>
            </button>
            <button onClick={s.resetForm} className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition">
              {t('close')}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = s.activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => s.setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition whitespace-nowrap ${
                isActive ? 'bg-purple-500 text-white' : 'hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {s.activeTab === 'analysis' && <AnalysisTab session={s} />}
      {s.activeTab === 'results' && (
        <ResultsTab
          result={s.result}
          client={s.getSelectedClient() ?? null}
          analysisDate={s.viewingAnalysis?.createdAt ?? null}
          viewingAnalysisId={s.viewingAnalysis?.id ?? null}
          clientHistory={s.clientHistory}
          onGoToVisualization={() => s.setActiveTab('visualization')}
          onViewAnalysis={s.loadAnalysisForView}
        />
      )}
      {s.activeTab === 'visualization' && (
        <VisualizationTab
          result={s.result}
          selectedImage={s.selectedImage}
          sessionPhotos={s.sessionPhotos}
          zoom={s.zoom}
          setZoom={s.setZoom}
          downloadResult={s.downloadResult}
        />
      )}
      {s.activeTab === 'history' && (
        <ClientVisitHistoryTab
          selectedClientId={s.selectedClient}
          client={s.getSelectedClient()}
          analyses={s.aiAnalyses.filter(a => a.clientId === s.selectedClient)}
          type="ai"
          accent="purple"
          onView={s.loadAnalysisForView}
          labels={{
            selectClientFirst: t('selectClientFirst'),
            selectClientHint: t('selectClientHint'),
            noHistory: t('noHistory'),
            historyFor: t('historyFor'),
            densityShort: t('densityShort'),
          }}
        />
      )}
      {s.activeTab === 'allAnalyses' && (
        <AllAnalysesTab
          analyses={s.aiAnalyses}
          clients={s.clients}
          onView={s.loadAnalysisForView}
        />
      )}
    </div>
  );
}
