/**
 * OfflineAnalysis — پوستهٔ صفحهٔ تحلیل آفلاین
 * منطق در useOfflineSession؛ هر تب در src/pages/offline-analysis/
 */
import { Eye, Trash2, WifiOff } from 'lucide-react';
import { useLang, useT } from '../i18n';
import { useOfflineSession } from './offline-analysis/useOfflineSession';
import { tabs } from './offline-analysis/constants';
import { offlineDict } from './offline-analysis/strings';
import ClientVisitHistoryTab from '../components/ClientVisitHistoryTab';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import AnalysisTab from './offline-analysis/AnalysisTab';
import ResultsTab from './offline-analysis/ResultsTab';
import VisualizationTab from './offline-analysis/VisualizationTab';
import AllAnalysesTab from './offline-analysis/AllAnalysesTab';

export default function OfflineAnalysis() {
  const t = useT(offlineDict);
  const { isRtl } = useLang();
  const s = useOfflineSession();

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

      {s.engineInfo && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
          <WifiOff size={16} />
          <span>{s.engineInfo}</span>
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
                isActive ? 'bg-emerald-500 text-white' : 'hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {s.activeTab === 'analysis' && (
        <AnalysisTab
          searchQuery={s.searchQuery}
          onSearchChange={s.setSearchQuery}
          filteredClients={s.filteredClients}
          selectedClient={s.selectedClient}
          onSelectClient={s.setSelectedClient}
          clientGallery={s.clientGallery}
          analysesForSelectedClient={s.analysesForSelectedClient}
          selectedImage={s.selectedImage}
          onSelectImage={s.selectImage}
          analyzing={s.analyzing}
          onAnalyze={s.runOfflineAnalysis}
          error={s.error}
          zoom={s.zoom}
          onZoom={s.setZoom}
          resultAnnotatedUrl={s.result?.annotatedImageBase64}
          imageQuality={s.result?.imageQuality}
          showEndVisit={Boolean(s.selectedClient && s.activeVisitSession && !s.isReadOnly)}

          endingVisit={s.endingVisit}
          onEndVisit={s.endVisit}
        />
      )}
      {s.activeTab === 'results' && (
        <ResultsTab
          result={s.result}
          client={s.clients.find(c => c.id === s.selectedClient) ?? null}
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
          onZoom={s.setZoom}
          onDownload={s.downloadResult}
        />
      )}
      {s.activeTab === 'history' && (
        <ClientVisitHistoryTab
          selectedClientId={s.selectedClient}
          client={s.clients.find(c => c.id === s.selectedClient)}
          analyses={s.offlineAnalyses.filter(a => a.clientId === s.selectedClient)}
          type="offline"
          accent="emerald"
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
          searchQuery={s.allAnalysesSearchQuery}
          onSearchChange={s.setAllAnalysesSearchQuery}
          analysesGroupedByClient={s.analysesGroupedByClient}
          clients={s.clients}
          onView={s.loadAnalysisForView}
        />
      )}
    </div>
  );
}
