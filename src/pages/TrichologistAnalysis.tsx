/**
 * TrichologistAnalysis — پوستهٔ صفحهٔ تحلیل تریکولوژیست
 * منطق در useTrichoSession، هر تب یک کامپوننت مستقل در src/pages/trichologist-analysis/
 */
import { ChevronLeft, ChevronRight, Edit2, Eye, Save, Trash2 } from 'lucide-react';
import MedicalDisclaimer from '../components/MedicalDisclaimer';
import { useLang, useT } from '../i18n';
import { tabs, type TabId } from './trichologist-analysis/constants';
import { trichoDict } from './trichologist-analysis/strings';
import { useTrichoSession } from './trichologist-analysis/useTrichoSession';
import BasicInfoTab from './trichologist-analysis/BasicInfoTab';
import QuestionnaireTab from './trichologist-analysis/QuestionnaireTab';
import ObservationsTab from './trichologist-analysis/ObservationsTab';
import RecommendationsTab from './trichologist-analysis/RecommendationsTab';
import TreatmentTab from './trichologist-analysis/TreatmentTab';
import HistoryTab from './trichologist-analysis/HistoryTab';
import ClinicalTrendTab from './trichologist-analysis/ClinicalTrendTab';
import AllAnalysesTab from './trichologist-analysis/AllAnalysesTab';

export default function TrichologistAnalysis({
  initialTab = 'basic',
}: {
  initialTab?: TabId;
}) {
  const t = useT(trichoDict);
  const { isRtl } = useLang();
  const s = useTrichoSession(initialTab);

  return (
    <div className="space-y-6">
      <MedicalDisclaimer isRtl={isRtl} compact />

      {s.isReadOnly && s.viewingAnalysis && (
        <div className="flex items-center justify-between p-4 rounded-xl bg-yellow-500/20 border border-yellow-500/50">
          <div className="flex items-center gap-2 text-yellow-400">
            <Eye size={20} />
            <span>{t('viewModeBanner')}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={s.handleEdit}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition"
            >
              <Edit2 size={16} />
              <span>{t('edit')}</span>
            </button>
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
              className={`flex items-center gap-2 px-4 py-2 rounded-xl whitespace-nowrap transition ${
                isActive ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white' : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              <Icon size={18} />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-6 min-h-[500px]">
        {s.activeTab === 'basic' && (
          <BasicInfoTab
            selectedClient={s.selectedClient}
            onSelectClient={s.setSelectedClient}
            selectedImage={s.selectedImage}
            onSelectImage={s.setSelectedImage}
            isReadOnly={s.isReadOnly}
            showEndVisit={Boolean(s.selectedClient && s.activeVisitSession && !s.isReadOnly)}
            endingVisit={s.endingVisit}
            onEndVisit={s.endVisit}
          />
        )}
        {s.activeTab === 'questionnaire' && (
          <QuestionnaireTab
            currentAnalysis={s.currentAnalysis}
            isReadOnly={s.isReadOnly}
            updateQuestionnaire={s.updateQuestionnaire}
            changedFields={s.questionnaireChangedFields}
          />
        )}
        {s.activeTab === 'observations' && (
          <ObservationsTab
            currentAnalysis={s.currentAnalysis}
            isReadOnly={s.isReadOnly}
            updateQuestionnaire={s.updateQuestionnaire}
            toggleObservation={s.toggleObservation}
          />
        )}
        {s.activeTab === 'recommendations' && (
          <RecommendationsTab
            recommendations={s.currentAnalysis.recommendations || ''}
            isReadOnly={s.isReadOnly}
            onChange={s.setRecommendations}
          />
        )}
        {s.activeTab === 'treatment' && (
          <TreatmentTab
            treatmentSteps={s.treatmentSteps}
            isReadOnly={s.isReadOnly}
            addTreatmentStep={s.addTreatmentStep}
            updateTreatmentStep={s.updateTreatmentStep}
            removeTreatmentStep={s.removeTreatmentStep}
          />
        )}
        {s.activeTab === 'clinicalTrend' && (
          <ClinicalTrendTab
            selectedClient={s.selectedClient}
            clientName={
              s.getSelectedClient()
                ? `${s.getSelectedClient()!.firstName} ${s.getSelectedClient()!.lastName}`
                : undefined
            }
          />
        )}
        {s.activeTab === 'history' && (
          <HistoryTab
            selectedClient={s.selectedClient}
            client={s.getSelectedClient()}
            history={s.clientHistory}
            onView={analysis => s.loadAnalysisForView(analysis, true)}
          />
        )}
        {s.activeTab === 'allAnalyses' && (
          <AllAnalysesTab
            analyses={s.trichologistAnalyses}
            clients={s.clients}
            onView={analysis => s.loadAnalysisForView(analysis, true)}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={s.goPrev}
            disabled={!s.canPrev}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30"
          >
            {isRtl ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            <span>{t('previous')}</span>
          </button>
          <button
            onClick={s.goNext}
            disabled={!s.canNext}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30"
          >
            <span>{t('next')}</span>
            {isRtl ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>
        <div className="flex items-center gap-4">
          {s.lastSaved && (
            <span className="text-sm opacity-50">
              {t('autoSaved')} {s.lastSaved.toLocaleTimeString()}
            </span>
          )}
          {!s.isReadOnly && (
            <button
              onClick={() => s.handleSave()}
              disabled={s.saving || !s.selectedClient}
              className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 hover:opacity-90 transition disabled:opacity-50"
            >
              <Save size={20} />
              <span>
                {s.saving ? t('saving') : s.editingAnalysisId ? t('update') : t('save')}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
