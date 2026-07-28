import type { GalleryItem } from '../db';
import { partitionGalleryForAnalysis, type AnalysisAgeRef } from '../lib/galleryPhotoAge';
import { useLang, usePick } from '../i18n';

type Accent = 'purple' | 'emerald';

interface Props {
  items: GalleryItem[];
  analyses: AnalysisAgeRef[];
  selectedId?: string | null;
  onSelect: (item: GalleryItem) => void;
  accent?: Accent;
  emptyLabel: string;
  selectLabel: string;
}

/**
 * انتخاب تصویر برای تحلیل آنلاین/آفلاین —
 * عکس‌های جدید این مراجعه را از عکس‌های قبلی جدا و با نشان متمایز می‌کند.
 */
export default function AnalysisGalleryPicker({
  items,
  analyses,
  selectedId,
  onSelect,
  accent = 'emerald',
  emptyLabel,
  selectLabel,
}: Props) {
  const pick = usePick();
  const { lang } = useLang();
  const { newItems, previousItems } = partitionGalleryForAnalysis(items, analyses);

  const selectedRing =
    accent === 'purple'
      ? 'border-purple-400 ring-2 ring-purple-400/40'
      : 'border-emerald-400 ring-2 ring-emerald-400/40';
  const newBadgeCls =
    accent === 'purple'
      ? 'bg-purple-500 text-white'
      : 'bg-emerald-500 text-white';
  const newCardCls =
    accent === 'purple'
      ? 'border-purple-400/70 shadow-[0_0_0_1px_rgba(192,132,252,0.35)]'
      : 'border-emerald-400/70 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]';

  if (items.length === 0) {
    return (
      <div>
        <label className="block mb-2 opacity-70">{selectLabel}</label>
        <p className="text-sm opacity-50 py-4 text-center bg-white/5 rounded-xl">{emptyLabel}</p>
      </div>
    );
  }

  const renderGrid = (list: GalleryItem[], kind: 'new' | 'previous') => (
    <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
      {list.map(item => {
        const selected = selectedId === item.id;
        const isNew = kind === 'new';
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition ${
              selected
                ? selectedRing
                : isNew
                  ? `${newCardCls} hover:brightness-110`
                  : 'border-white/10 opacity-75 hover:opacity-100 hover:border-white/30'
            }`}
          >
            <img src={item.url} alt="" className="w-full h-full object-cover" />
            <span
              className={`absolute top-1 start-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none ${
                isNew ? newBadgeCls : 'bg-black/65 text-white/90'
              }`}
            >
              {isNew ? pick('جدید', 'New') : pick('قبلی', 'Previous')}
            </span>
            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-[10px] text-center py-0.5 text-white/90 truncate px-1">
              {new Date(item.createdAt).toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-US')}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <label className="block opacity-70">{selectLabel}</label>

      {newItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-2 h-2 rounded-full ${accent === 'purple' ? 'bg-purple-400' : 'bg-emerald-400'}`} />
            <p className="text-sm font-medium">
              {pick('عکس‌های جدید این مراجعه', 'New photos this visit')}
              <span className="opacity-50 ms-1">({newItems.length})</span>
            </p>
          </div>
          {renderGrid(newItems, 'new')}
        </div>
      )}

      {previousItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-white/40" />
            <p className="text-sm font-medium opacity-80">
              {pick('عکس‌های قبلی', 'Previous photos')}
              <span className="opacity-50 ms-1">({previousItems.length})</span>
            </p>
          </div>
          {renderGrid(previousItems, 'previous')}
        </div>
      )}
    </div>
  );
}
