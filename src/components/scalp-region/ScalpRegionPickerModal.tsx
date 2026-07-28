import { useMemo, useState } from 'react';
import { Check, X, MapPin } from 'lucide-react';
import { getScalpRegion, type ScalpRegionId } from '../../lib/scalpRegions';
import ScalpRegionMap from './ScalpRegionMap';
import ScalpRegionGrid from './ScalpRegionGrid';

export type PendingUpload = {
  file: File;
  previewUrl: string;
  type: 'photo' | 'video';
};

type Props = {
  pending: PendingUpload;
  index: number;
  total: number;
  assignedIds: Set<ScalpRegionId>;
  /** kept for API compatibility — labels are always English */
  isRtl?: boolean;
  onConfirm: (regionId: ScalpRegionId) => void;
  onSkip: () => void;
  onCancelAll: () => void;
};

/**
 * مودال انتخاب ناحیه سر قبل از آپلود هر عکس
 */
export default function ScalpRegionPickerModal({
  pending,
  index,
  total,
  assignedIds,
  onConfirm,
  onSkip,
  onCancelAll,
}: Props) {
  const [selectedId, setSelectedId] = useState<ScalpRegionId | null>(null);
  const selected = useMemo(() => getScalpRegion(selectedId), [selectedId]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-5xl max-h-[94vh] overflow-y-auto rounded-3xl border border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 shadow-2xl shadow-cyan-500/10">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-white/10">
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan-300/70 mb-1">
              {`Photo ${index + 1} of ${total}`}
            </p>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MapPin className="text-cyan-400" size={22} />
              Select scalp region for this photo
            </h2>
            <p className="text-sm opacity-60 mt-1">
              Pick a region on the map or the English list, then confirm upload.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelAll}
            className="p-2 rounded-xl hover:bg-white/10 text-white/70"
            aria-label="close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 p-5">
          <div className="space-y-3">
            <div className="aspect-video rounded-2xl overflow-hidden border border-white/10 bg-black/40">
              {pending.type === 'photo' ? (
                <img src={pending.previewUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                <video src={pending.previewUrl} className="w-full h-full object-contain" controls />
              )}
            </div>
            <p className="text-xs opacity-50 truncate">{pending.file.name}</p>

            <ScalpRegionMap
              selectedId={selectedId}
              assignedIds={assignedIds}
              onSelect={setSelectedId}
              hint="Click a region · Gold = selected · Green = uploaded"
            />
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2 opacity-80">Regions</h3>
              <ScalpRegionGrid
                selectedId={selectedId}
                assignedIds={assignedIds}
                onSelect={setSelectedId}
              />
            </div>

            {selected && (
              <div
                className="rounded-2xl border px-4 py-3 text-sm"
                style={{
                  borderColor: `${selected.color}66`,
                  background: `${selected.color}18`,
                }}
              >
                <p className="font-semibold">{selected.shortEn}</p>
                <p className="opacity-70 mt-1 text-xs leading-relaxed">{selected.hintEn}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                disabled={!selectedId}
                onClick={() => selectedId && onConfirm(selectedId)}
                className="flex-1 min-w-[160px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 transition"
              >
                <Check size={18} />
                Confirm & upload
              </button>
              <button
                type="button"
                onClick={onSkip}
                className="px-4 py-3 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 text-sm"
              >
                Skip (no upload)
              </button>
            </div>
            <p className="text-[11px] opacity-45">
              Green = already uploaded · Gold = current selection
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
