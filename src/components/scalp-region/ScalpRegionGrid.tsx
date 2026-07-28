import { SCALP_REGIONS, type ScalpRegionId } from '../../lib/scalpRegions';

type Props = {
  selectedId: ScalpRegionId | null;
  assignedIds: Set<ScalpRegionId>;
  onSelect: (id: ScalpRegionId) => void;
  /** kept for API compatibility — labels are always English */
  isRtl?: boolean;
};

/**
 * Region list — English names only, color change only (no numbers / no checkmarks)
 */
export default function ScalpRegionGrid({ selectedId, assignedIds, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {SCALP_REGIONS.map(region => {
        const selected = selectedId === region.id;
        const assigned = assignedIds.has(region.id);
        return (
          <button
            key={region.id}
            type="button"
            disabled={assigned}
            onClick={() => {
              if (assigned) return;
              onSelect(region.id);
            }}
            className={`relative text-start rounded-xl border px-3 py-2.5 transition overflow-hidden ${
              assigned
                ? 'border-emerald-500/45 bg-emerald-500/20 cursor-not-allowed'
                : selected
                  ? 'border-amber-300/80 bg-amber-400/20 scale-[1.02] shadow-lg'
                  : 'border-cyan-500/25 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-400/40'
            }`}
            style={{
              boxShadow: selected && !assigned ? '0 0 18px rgba(251,191,36,0.35)' : undefined,
            }}
          >
            <span
              className="absolute inset-y-0 start-0 w-1.5"
              style={{
                background: assigned ? '#22c55e' : selected ? '#fbbf24' : '#3b9eff',
              }}
            />
            <div className="flex items-center gap-2 ps-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  background: assigned ? '#22c55e' : selected ? '#fbbf24' : '#3b9eff',
                  boxShadow: selected && !assigned ? '0 0 8px #fbbf24' : undefined,
                }}
              />
              <p className={`text-sm font-semibold leading-snug truncate ${assigned ? 'text-emerald-100' : 'text-cyan-50'}`}>
                {region.shortEn}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
