import { getScalpRegion, readScalpRegionFromMetadata } from '../../lib/scalpRegions';
import {
  getTrichoscopeMode,
  readTrichoscopeModeFromMetadata,
} from '../../lib/trichoscopeModes';
import type { GalleryItem } from '../../db';

/** نشان رنگی ناحیه سر روی کاشی گالری */
export default function ScalpRegionBadge({
  item,
}: {
  item: GalleryItem;
  /** kept for API compatibility — labels are always English */
  isRtl?: boolean;
}) {
  const id = readScalpRegionFromMetadata(item.metadata);
  const region = getScalpRegion(id);
  const mode = getTrichoscopeMode(readTrichoscopeModeFromMetadata(item.metadata));
  if (!region) return null;

  return (
    <div
      className="absolute top-2 end-2 max-w-[85%] px-1.5 py-1 rounded-md text-[10px] font-semibold leading-tight shadow-lg border border-white/20 bg-black/80 text-white"
      title={`${region.en}${mode ? ` · ${mode.en}` : ''}`}
    >
      <span className="block truncate">{region.en}</span>
      {mode && (
        <span className="mt-0.5 flex items-center gap-1 truncate">
          <span
            className="w-2 h-2 rounded-[2px] border border-black/30 shrink-0"
            style={{ background: mode.color }}
          />
          <span className="truncate">{mode.en}</span>
        </span>
      )}
    </div>
  );
}
