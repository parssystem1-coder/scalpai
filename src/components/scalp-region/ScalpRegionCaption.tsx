import { getScalpRegion, readScalpRegionFromMetadata } from '../../lib/scalpRegions';
import {
  getTrichoscopeMode,
  readTrichoscopeModeFromMetadata,
} from '../../lib/trichoscopeModes';
import type { GalleryItem } from '../../db';

/** برچسب ناحیه زیر تصویر — روی پیکسل‌های عکس رسم نمی‌شود */
export default function ScalpRegionCaption({
  item,
}: {
  item: GalleryItem;
  /** kept for API compatibility — labels are always English */
  isRtl?: boolean;
}) {
  const id = readScalpRegionFromMetadata(item.metadata);
  const region = getScalpRegion(id);
  const mode = getTrichoscopeMode(readTrichoscopeModeFromMetadata(item.metadata));
  if (!region) {
    return (
      <p className="text-[10px] opacity-35 truncate px-0.5">
        No region
      </p>
    );
  }

  return (
    <div
      className="text-[10px] font-medium px-1.5 py-1 rounded-md border flex items-center gap-1.5 min-w-0"
      style={{
        color: region.color,
        borderColor: `${region.color}44`,
        background: `${region.color}12`,
      }}
      title={`${region.en}${mode ? ` · ${mode.en}` : ''}`}
    >
      {mode && (
        <span
          className="w-2.5 h-2.5 rounded-[2px] border border-black/25 shrink-0"
          style={{ background: mode.color }}
        />
      )}
      <span className="truncate">
        {region.en}
        {mode ? ` · ${mode.en}` : ''}
      </span>
    </div>
  );
}
