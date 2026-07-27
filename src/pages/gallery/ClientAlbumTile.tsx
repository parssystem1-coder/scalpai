import type { ReactNode } from 'react';
import { Image, FolderOpen } from 'lucide-react';
import type { Client, GalleryItem } from '../../db';
import { ALBUM_PREVIEW_COUNT, type GalleryViewMode } from './constants';

export type ClientAlbum = {
  clientId: string;
  client?: Client;
  items: GalleryItem[];
};

export function ClientAlbumTile({
  album,
  onOpen,
  renderTileMedia,
  viewMode,
}: {
  album: ClientAlbum;
  /** kept for API compatibility — labels are always English */
  isRtl: boolean;
  onOpen: () => void;
  renderTileMedia: (item: GalleryItem) => ReactNode;
  viewMode: GalleryViewMode;
}) {
  const name = album.client
    ? `${album.client.firstName} ${album.client.lastName}`
    : 'Unknown client';
  const previews = album.items.slice(0, ALBUM_PREVIEW_COUNT);
  const extra = Math.max(0, album.items.length - ALBUM_PREVIEW_COUNT);
  const initial = album.client?.firstName?.[0] || '?';
  const isList = viewMode === 'list';
  const isCompact = viewMode === 'compact';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group text-start rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10 hover:border-blue-400/50 hover:bg-white/[0.07] transition shadow-lg shadow-black/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
        isList ? 'flex items-stretch' : ''
      }`}
    >
      <div className={`relative aspect-square bg-black/30 overflow-hidden shrink-0 ${
        isList ? 'w-28 sm:w-36' : 'w-full'
      }`}>
        {previews.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center opacity-30">
            <Image size={36} />
          </div>
        ) : previews.length === 1 ? (
          <div className="w-full h-full">{renderTileMedia(previews[0])}</div>
        ) : previews.length === 2 ? (
          <div className="grid grid-cols-2 h-full gap-0.5">
            {previews.map(item => (
              <div key={item.id} className="h-full overflow-hidden">{renderTileMedia(item)}</div>
            ))}
          </div>
        ) : previews.length === 3 ? (
          <div className="grid grid-cols-2 grid-rows-2 h-full gap-0.5">
            <div className="row-span-2 overflow-hidden">{renderTileMedia(previews[0])}</div>
            <div className="overflow-hidden">{renderTileMedia(previews[1])}</div>
            <div className="overflow-hidden">{renderTileMedia(previews[2])}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 h-full gap-0.5">
            {previews.map((item, idx) => (
              <div key={item.id} className="relative overflow-hidden">
                {renderTileMedia(item)}
                {idx === ALBUM_PREVIEW_COUNT - 1 && extra > 0 && (
                  <div className="absolute inset-0 bg-black/55 flex items-center justify-center text-lg font-semibold">
                    +{extra}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80 group-hover:opacity-100 transition pointer-events-none" />
        <div className="absolute top-2 end-2 px-2 py-0.5 rounded-lg bg-black/55 backdrop-blur text-xs font-medium">
          {album.items.length} files
        </div>
      </div>
      <div className={`${isCompact ? 'p-2 gap-2' : 'p-3 gap-3'} flex items-center flex-1 min-w-0`}>
        <div className={`${isCompact ? 'w-8 h-8 text-sm' : 'w-10 h-10'} rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold flex-shrink-0`}>
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{name}</p>
          <p className="text-xs opacity-50 truncate">
            Click to open album
          </p>
        </div>
        <FolderOpen size={16} className="opacity-40 group-hover:opacity-80 transition flex-shrink-0" />
      </div>
    </button>
  );
}
