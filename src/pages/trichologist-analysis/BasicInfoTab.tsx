import { useEffect, useState } from 'react';
import { User, Search, ZoomIn } from 'lucide-react';
import { useAnalysesStore, useClientsStore, useGalleryStore, useSessionsStore } from '../../store';
import { resolveGalleryItemUrl } from '../../db';
import type { GalleryItem } from '../../db';
import { filterClientsEligibleForModule } from '../../lib/sessionVisit';
import { useT } from '../../i18n';
import EndVisitButton from '../../components/EndVisitButton';
import { trichoDict } from './strings';
import ImageLightbox from './ImageLightbox';

interface Props {
  selectedClient: string;
  onSelectClient: (id: string) => void;
  selectedImage: string;
  onSelectImage: (id: string) => void;
  isReadOnly: boolean;
  showEndVisit?: boolean;
  endingVisit?: boolean;
  onEndVisit?: () => void | Promise<void>;
}

export default function BasicInfoTab({
  selectedClient, onSelectClient, selectedImage, onSelectImage, isReadOnly,
  showEndVisit, endingVisit, onEndVisit,
}: Props) {
  const { clients } = useClientsStore();
  const { sessions } = useSessionsStore();
  const { analyses } = useAnalysesStore();
  const { fetchByClient } = useGalleryStore();
  const t = useT(trichoDict);

  const [searchQuery, setSearchQuery] = useState('');
  const [clientGallery, setClientGallery] = useState<GalleryItem[]>([]);
  const [previewImage, setPreviewImage] = useState<GalleryItem | null>(null);

  useEffect(() => {
    if (selectedClient) {
      fetchByClient(selectedClient).then(items => {
        setClientGallery(items.filter(i => i.type === 'photo'));
      });
    } else {
      setClientGallery([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient]);

  // نوبت scheduled + هنوز تحلیل تریکولوژیست برای همان نوبت ثبت نشده
  const eligibleClients = filterClientsEligibleForModule(
    clients,
    sessions,
    analyses,
    'trichologist',
  );
  const filteredClients = eligibleClients.filter(c =>
    `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const client = clients.find(c => c.id === selectedClient);

  const calculateAge = (birthDate: string) => {
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return t('unknownAge');
    const years = Math.floor((Date.now() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
    return `${years} ${t('years')}`;
  };

  // لیست گالری فقط thumbnail دارد؛ محتوای کامل هنگام باز شدن پیش‌نمایش
  // on-demand بارگذاری و جایگزین می‌شود
  const openImagePreview = (item: GalleryItem) => {
    setPreviewImage(item);
    resolveGalleryItemUrl(item).then(fullUrl => {
      setPreviewImage(prev => (prev && prev.id === item.id ? { ...prev, url: fullUrl } : prev));
    });
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={20} />
        <input
          type="text"
          placeholder={t('searchClient')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full ps-12 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          disabled={isReadOnly}
        />
      </div>

      {/* Client List */}
      {!isReadOnly && (
        <div>
          <label className="block mb-2 opacity-70">{t('eligibleClients')}</label>
          {filteredClients.length === 0 ? (
            <div className="text-center py-8 opacity-50 bg-white/10 rounded-xl">
              <User size={32} className="mx-auto mb-2 opacity-30" />
              <p>{t('noEligibleClients')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
              {filteredClients.map(c => (
                <div
                  key={c.id}
                  onClick={() => onSelectClient(c.id)}
                  className={`p-3 rounded-xl cursor-pointer transition flex items-center gap-3 ${
                    selectedClient === c.id
                      ? 'bg-blue-500/20 border border-blue-500'
                      : 'bg-white/5 hover:bg-white/10 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">{c.firstName?.[0] || '?'}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{c.firstName} {c.lastName}</p>
                    <p className="text-sm opacity-50">{c.phone}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <EndVisitButton
        visible={Boolean(showEndVisit && onEndVisit)}
        busy={endingVisit}
        label={t('endVisit')}
        hint={t('endVisitHint')}
        onEnd={onEndVisit!}
      />

      {/* Selected Client Info */}
      {client && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <h4 className="font-semibold mb-2">{t('selectedClient')}</h4>
          <p>{client.firstName} {client.lastName}</p>
          <p className="text-sm opacity-70">
            {client.gender === 'male' ? t('male') : t('female')} - {t('age')}: {calculateAge(client.birthDate || '')}
          </p>
        </div>
      )}

      {/* Gallery */}
      {selectedClient && clientGallery.length > 0 && (
        <div>
          <label className="block mb-2 opacity-70">
            {t('clientImages')} {!isReadOnly && <span className="text-xs">({t('clickHint')})</span>}
          </label>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
            {clientGallery.map(item => (
              <div
                key={item.id}
                onClick={() => !isReadOnly && onSelectImage(item.id)}
                onDoubleClick={() => openImagePreview(item)}
                className={`aspect-square rounded-xl overflow-hidden cursor-pointer transition group relative ${selectedImage === item.id ? 'ring-2 ring-blue-500 scale-105' : 'hover:scale-105'}`}
              >
                <img src={item.url} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); openImagePreview(item); }}
                    className="p-2 rounded-full bg-white/20 hover:bg-white/30"
                  >
                    <ZoomIn size={20} />
                  </button>
                </div>
                {selectedImage === item.id && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {previewImage && (
        <ImageLightbox
          image={previewImage}
          caption={client ? `${client.firstName} ${client.lastName}` : undefined}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
