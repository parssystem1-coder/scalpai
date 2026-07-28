import { Cpu, Search, Loader, AlertCircle, ZoomIn, ZoomOut } from 'lucide-react';
import type { GalleryItem, OfflineAnalysisResult } from '../../db';
import { useLang, useT } from '../../i18n';
import AnalysisGalleryPicker from '../../components/AnalysisGalleryPicker';
import AIAnalysisOverlay from '../../components/AIAnalysisOverlay';
import EndVisitButton from '../../components/EndVisitButton';
import ImageQualityWarning from '../../components/ImageQualityWarning';
import type { AnalysisAgeRef } from '../../lib/galleryPhotoAge';
import { offlineDict } from './strings';

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filteredClients: { id: string; firstName: string; lastName: string; phone: string }[];
  selectedClient: string;
  onSelectClient: (id: string) => void;
  clientGallery: GalleryItem[];
  analysesForSelectedClient: AnalysisAgeRef[];
  selectedImage: GalleryItem | null;
  onSelectImage: (item: GalleryItem) => void;
  analyzing: boolean;
  onAnalyze: () => void;
  error: string;
  zoom: number;
  onZoom: React.Dispatch<React.SetStateAction<number>>;
  resultAnnotatedUrl?: string | null;
  imageQuality?: OfflineAnalysisResult['imageQuality'] | null;
  showEndVisit?: boolean;
  endingVisit?: boolean;
  onEndVisit?: () => void | Promise<void>;
}

export default function AnalysisTab({
  searchQuery, onSearchChange, filteredClients, selectedClient, onSelectClient,
  clientGallery, analysesForSelectedClient, selectedImage, onSelectImage, analyzing, onAnalyze, error,
  zoom, onZoom, resultAnnotatedUrl, imageQuality,
  showEndVisit, endingVisit, onEndVisit,
}: Props) {

  const t = useT(offlineDict);
  const { isRtl } = useLang();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <AIAnalysisOverlay analyzing={analyzing} mode="offline" isRtl={isRtl} />
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={20} />
          <input
            type="text"
            placeholder={t('searchClient')}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="w-full ps-12 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block mb-2 opacity-70">{t('eligibleClients')}</label>
          {filteredClients.length === 0 ? (
            <div className="text-center py-8 opacity-50 bg-white/5 rounded-xl">
              <Cpu size={32} className="mx-auto mb-2 opacity-30" />
              <p>{t('noEligibleClients')}</p>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-2">
              {filteredClients.map(client => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient(client.id)}
                  className={`p-3 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                    selectedClient === client.id
                      ? 'bg-emerald-500/20 border border-emerald-500'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center">
                    <span className="text-white font-bold">{client.firstName?.[0] || '?'}</span>
                  </div>
                  <div>
                    <p className="font-medium">{client.firstName} {client.lastName}</p>
                    <p className="text-sm opacity-50">{client.phone}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <EndVisitButton
          visible={Boolean(showEndVisit && onEndVisit)}
          busy={endingVisit}
          label={t('endVisit')}
          hint={t('endVisitHint')}
          onEnd={onEndVisit!}
        />

        {selectedClient && (
          <AnalysisGalleryPicker
            items={clientGallery}
            analyses={analysesForSelectedClient}
            selectedId={selectedImage?.id}
            onSelect={onSelectImage}
            accent="emerald"
            selectLabel={t('selectImage')}
            emptyLabel={t('noGalleryImages')}
          />
        )}

        {selectedImage && (
          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 transition disabled:opacity-50"
          >
            {analyzing ? <Loader className="animate-spin" size={24} /> : <Cpu size={24} />}
            <span>{analyzing ? t('analyzing') : t('analyze')}</span>
          </button>
        )}

        {error && (
          <div className="flex items-start gap-2 p-4 rounded-xl bg-red-500/20 text-red-400">
            <AlertCircle size={20} className="flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <ImageQualityWarning quality={imageQuality} compact />
      </div>


      <div className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 h-[clamp(380px,56vh,520px)] flex flex-col overflow-hidden">
        {selectedImage ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => onZoom(z => Math.max(0.5, z - 0.25))} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
                <ZoomOut size={18} />
              </button>
              <span className="text-sm opacity-70">{Math.round(zoom * 100)}%</span>
              <button onClick={() => onZoom(z => Math.min(3, z + 0.25))} className="p-2 rounded-lg bg-white/10 hover:bg-white/20">
                <ZoomIn size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center">
              <img
                src={resultAnnotatedUrl || selectedImage.url}
                alt=""
                style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}
                className="max-w-full max-h-full object-contain rounded-xl transition-transform"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center opacity-50">
            <Cpu size={64} className="opacity-30" />
          </div>
        )}
      </div>
    </div>
  );
}
