import { MapPin } from 'lucide-react';
import { getScalpRegion, type ScalpRegionId } from '../../lib/scalpRegions';
import type { TrichoscopeModeId } from '../../lib/trichoscopeModes';
import ScalpRegionMap from './ScalpRegionMap';
import ScalpRegionGrid from './ScalpRegionGrid';
import TrichoscopeModeSelector from './TrichoscopeModeSelector';

type Props = {
  selectedId: ScalpRegionId | null;
  assignedIds: Set<ScalpRegionId>;
  onSelect: (id: ScalpRegionId) => void;
  /** kept for API compatibility — labels are always English */
  isRtl?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  assignedCount?: number;
  onPauseEnd?: () => void;
  onEnd?: () => void;
  lensMode: TrichoscopeModeId;
  onLensModeChange: (mode: TrichoscopeModeId) => void;
};

/**
 * پنل سمت چپ گالری — انتخاب ناحیه سر + پایان / پایان موقت
 */
export default function ScalpRegionSidePanel({
  selectedId,
  assignedIds,
  onSelect,
  disabled,
  disabledHint,
  assignedCount = 0,
  onPauseEnd,
  onEnd,
  lensMode,
  onLensModeChange,
}: Props) {
  const selected = getScalpRegion(selectedId);
  const canFinish = assignedCount > 0;

  return (
    <aside className="rounded-3xl border border-cyan-400/25 bg-gradient-to-b from-slate-950 via-slate-900/95 to-cyan-950/40 p-4 shadow-xl shadow-cyan-500/5 space-y-4">
      <div className="flex items-start gap-2">
        <div className="p-2 rounded-xl bg-cyan-500/15 text-cyan-300">
          <MapPin size={18} />
        </div>
        <div>
          <h2 className="font-semibold text-base leading-tight">
            Scalp region map
          </h2>
          <p className="text-xs opacity-55 mt-1 leading-relaxed">
            Select a region to upload. Pause End = continue later · End = new empty session.
          </p>
        </div>
      </div>

      {disabled ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-4 text-sm text-amber-100/90 text-center">
          {disabledHint || 'Select a client first'}
        </div>
      ) : (
        <>
          <TrichoscopeModeSelector
            value={lensMode}
            onChange={onLensModeChange}
          />

          <ScalpRegionMap
            selectedId={selectedId}
            assignedIds={assignedIds}
            onSelect={onSelect}
            hint="Click a region · Gold = selected · Green = uploaded"
          />

          <ScalpRegionGrid
            selectedId={selectedId}
            assignedIds={assignedIds}
            onSelect={onSelect}
          />

          {selected && (
            <div
              className="rounded-2xl border px-3 py-2.5 text-xs"
              style={{ borderColor: `${selected.color}55`, background: `${selected.color}14` }}
            >
              <p className="font-semibold text-sm text-cyan-50">{selected.shortEn}</p>
              <p className="opacity-65 mt-1 leading-relaxed">{selected.hintEn}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              disabled={!canFinish || !onPauseEnd}
              onClick={onPauseEnd}
              className="px-3 py-2.5 rounded-xl border border-cyan-400/35 bg-cyan-500/10 text-cyan-100 text-sm font-semibold hover:bg-cyan-500/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Save progress and leave — resume remaining regions later"
            >
              Pause End
            </button>
            <button
              type="button"
              disabled={!canFinish || !onEnd}
              onClick={onEnd}
              className="px-3 py-2.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 text-emerald-100 text-sm font-semibold hover:bg-emerald-500/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Finish this session — next time all regions start empty"
            >
              End
            </button>
          </div>
          <p className="text-[10px] text-center text-white/40 leading-relaxed">
            Pause End = continue later · End = start fresh next time ({assignedCount}/9 for {lensMode})
          </p>
        </>
      )}
    </aside>
  );
}
