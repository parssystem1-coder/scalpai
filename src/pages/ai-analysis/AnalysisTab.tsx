import { Brain, Loader, AlertCircle, Search, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettingsStore } from '../../store';
import { getAiPublicModelLabel } from '../../lib/aiProvider';
import { ANALYSIS_ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../../lib/mediaUiConstants';
import { useLang, useT } from '../../i18n';
import AnalysisGalleryPicker from '../../components/AnalysisGalleryPicker';
import AIAnalysisOverlay from '../../components/AIAnalysisOverlay';
import EndVisitButton from '../../components/EndVisitButton';
import { aiAnalysisDict } from './strings';
import type { useAISession } from './useAISession';

type AISession = ReturnType<typeof useAISession>;

/** فیلدهای لازم برای تب تحلیل — یک session object به‌جای props پراکنده */
export type AnalysisTabSession = Pick<
  AISession,
  | 'searchQuery'
  | 'setSearchQuery'
  | 'filteredClients'
  | 'selectedClient'
  | 'setSelectedClient'
  | 'clientGallery'
  | 'selectedImage'
  | 'selectImage'
  | 'analyzing'
  | 'hasApiKey'
  | 'error'
  | 'result'
  | 'zoom'
  | 'setZoom'
  | 'canvasRef'
  | 'imgRef'
  | 'analyzeWithGemini'
  | 'cancelAnalysis'
  | 'downloadResult'
  | 'analysesForSelectedClient'
  | 'activeVisitSession'
  | 'endingVisit'
  | 'endVisit'
  | 'isReadOnly'
>;

export default function AnalysisTab({ session: s }: { session: AnalysisTabSession }) {
  const t = useT(aiAnalysisDict);
  const { lang, isRtl } = useLang();
  const { settings } = useSettingsStore();
  const publicModel = getAiPublicModelLabel(settings, lang);
  const analyzingLabel = t('analyzingWithModel').replace('{model}', publicModel);
  const canAnalyze = Boolean(s.selectedImage && s.hasApiKey);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <AIAnalysisOverlay analyzing={s.analyzing} mode="online" isRtl={isRtl} />
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={20} />
          <input
            type="text"
            placeholder={t('searchClient')}
            value={s.searchQuery}
            onChange={e => s.setSearchQuery(e.target.value)}
            className="w-full ps-12 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block mb-2 opacity-70">{t('eligibleClients')}</label>
          {s.filteredClients.length === 0 ? (
            <div className="text-center py-8 opacity-50 bg-white/5 rounded-xl">
              <Brain size={32} className="mx-auto mb-2 opacity-30" />
              <p>{t('noEligibleClients')}</p>
              <p className="text-sm mt-1">{t('mustHaveSession')}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {s.filteredClients.map(client => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => s.setSelectedClient(client.id)}
                  className={`w-full text-start px-4 py-3 rounded-xl transition ${
                    s.selectedClient === client.id
                      ? 'bg-purple-500/30 border border-purple-400/50'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <p className="font-medium">{client.firstName} {client.lastName}</p>
                  <p className="text-xs opacity-50">{client.phone}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <EndVisitButton
          visible={Boolean(s.selectedClient && s.activeVisitSession && !s.isReadOnly)}
          busy={s.endingVisit}
          label={t('endVisit')}
          hint={t('endVisitHint')}
          onEnd={s.endVisit}
        />

        {s.selectedClient && (
          <AnalysisGalleryPicker
            items={s.clientGallery}
            analyses={s.analysesForSelectedClient}
            selectedId={s.selectedImage?.id}
            onSelect={s.selectImage}
            accent="purple"
            selectLabel={t('selectImage')}
            emptyLabel={t('noGalleryImages')}
          />
        )}

        {!s.hasApiKey && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <p>{t('apiKeyMissing')}</p>
              <Link to="/settings" className="underline underline-offset-2 hover:text-amber-100 mt-1 inline-block">
                {t('goToAiSettings')}
              </Link>
            </div>
          </div>
        )}

        {s.hasApiKey && (
          <p className={`text-xs px-3 py-2 rounded-lg border ${
            settings.includeMedicalDataInAi
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200/90'
              : 'bg-white/5 border-white/10 opacity-70'
          }`}>
            {settings.includeMedicalDataInAi ? t('medicalDataIncluded') : t('medicalDataExcluded')}
          </p>
        )}

        {s.hasApiKey && !s.selectedImage && (
          <p className="text-sm text-center opacity-60">{t('selectImageFirst')}</p>
        )}

        <div className="flex gap-2">
          {s.analyzing ? (
            <button
              type="button"
              onClick={s.cancelAnalysis}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-500/20 text-red-300 hover:bg-red-500/30 transition"
            >
              <Loader className="animate-spin" size={18} />
              <span>{t('cancel')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={s.analyzeWithGemini}
              disabled={!canAnalyze}
              title={!s.hasApiKey ? t('apiKeyMissing') : !s.selectedImage ? t('selectImageFirst') : undefined}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:from-purple-400 hover:to-fuchsia-400 transition"
            >
              <Brain size={18} />
              <span>{t('analyzeWithAI')}</span>
            </button>
          )}
        </div>

        {s.analyzing && (
          <p className="text-sm text-center opacity-70">{analyzingLabel}</p>
        )}

        {s.error && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-sm">
              <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
              <span>{s.error}</span>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <ul className="text-sm text-blue-200 space-y-1 list-disc list-inside">
                <li>{t('tipInternet')}</li>
                <li>{t('tipVpn')}</li>
                <li>{t('tipCors')}</li>
                <li>{t('tipWait')}</li>
                <li>{t('tipApiKey')}</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 h-[clamp(380px,56vh,520px)] flex flex-col overflow-hidden">
        {s.selectedImage ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => s.setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
                >
                  <ZoomOut size={18} />
                </button>
                <span className="text-sm opacity-70">{Math.round(s.zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => s.setZoom(z => Math.min(ANALYSIS_ZOOM_MAX, z + ZOOM_STEP))}
                  className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
                >
                  <ZoomIn size={18} />
                </button>
              </div>
              {s.result && (
                <button
                  type="button"
                  onClick={s.downloadResult}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30"
                >
                  <Download size={18} />
                  <span>{t('download')}</span>
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center">
              {s.result ? (
                <canvas
                  ref={s.canvasRef}
                  style={{ transform: `scale(${s.zoom})`, transformOrigin: 'center' }}
                  className="max-w-full max-h-full object-contain rounded-xl transition-transform"
                />
              ) : (
                <img
                  ref={s.imgRef}
                  src={s.selectedImage.url}
                  alt=""
                  style={{ transform: `scale(${s.zoom})`, transformOrigin: 'center' }}
                  className="max-w-full max-h-full object-contain rounded-xl transition-transform"
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center opacity-50">
              <Brain size={64} className="mx-auto mb-4 opacity-30" />
              <p>{t('noImageSelected')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
