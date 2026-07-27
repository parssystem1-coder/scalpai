import { Image, Trash2, Eye, Download, Loader } from 'lucide-react';
import { ClientAlbumTile } from './ClientAlbumTile';
import { GalleryLightbox } from './GalleryLightbox';
import { GalleryToolbar } from './GalleryToolbar';
import { GalleryPagination } from './GalleryPagination';
import { useGalleryPage } from './useGalleryPage';
import ScalpRegionSidePanel from '../../components/scalp-region/ScalpRegionSidePanel';
import ScalpRegionCaption from '../../components/scalp-region/ScalpRegionCaption';
import ScalpRegionBadge from '../../components/scalp-region/ScalpRegionBadge';
import type { GalleryItem } from '../../db';
import type { GalleryViewMode } from './constants';

const mediaGridClass = (mode: GalleryViewMode) => {
  if (mode === 'compact') return 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2';
  if (mode === 'large') return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5';
  return 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';
};

const albumGridClass = (mode: GalleryViewMode) => {
  if (mode === 'list') return 'grid grid-cols-1 gap-3';
  if (mode === 'compact') return 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3';
  if (mode === 'large') return 'grid grid-cols-1 sm:grid-cols-2 gap-6';
  return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5';
};

function PhotoTile({
  item,
  selected,
  onToggle,
  onPreview,
  onDownload,
  onDelete,
  renderMedia,
  viewMode,
  clientLabel,
}: {
  item: GalleryItem;
  selected: boolean;
  /** kept for API compatibility — labels are always English */
  isRtl: boolean;
  clientLabel?: string;
  onToggle: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  renderMedia: (item: GalleryItem, onClick?: () => void) => React.ReactNode;
  viewMode: Exclude<GalleryViewMode, 'list'>;
}) {
  const compact = viewMode === 'compact';
  return (
    <div className="space-y-1.5">
      <div className={`relative group rounded-xl overflow-hidden aspect-square cursor-pointer ${selected ? 'ring-2 ring-blue-500' : ''}`}>
        {renderMedia(item, onToggle)}
        <ScalpRegionBadge item={item} />
        <div className={`absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center ${compact ? 'gap-1' : 'gap-2'}`}>
          <button type="button" onClick={onPreview} className={`${compact ? 'p-1.5' : 'p-2'} rounded-full bg-white/20 hover:bg-white/30`} title="View">
            <Eye size={compact ? 14 : 18} />
          </button>
          <button type="button" onClick={onDownload} className={`${compact ? 'p-1.5' : 'p-2'} rounded-full bg-green-500/20 hover:bg-green-500/30 text-green-400`} title="Download">
            <Download size={compact ? 14 : 18} />
          </button>
          <button type="button" onClick={onDelete} className={`${compact ? 'p-1.5' : 'p-2'} rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400`} title="Delete">
            <Trash2 size={compact ? 14 : 18} />
          </button>
        </div>
        <div className="absolute top-2 start-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-5 h-5 rounded opacity-0 group-hover:opacity-100 checked:opacity-100 transition"
          />
        </div>
        {clientLabel && (
          <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 text-xs truncate">
            {clientLabel}
          </div>
        )}
      </div>
      <ScalpRegionCaption item={item} />
    </div>
  );
}

function PhotoListRow({
  item,
  selected,
  clientLabel,
  onToggle,
  onPreview,
  onDownload,
  onDelete,
  renderMedia,
}: {
  item: GalleryItem;
  selected: boolean;
  /** kept for API compatibility — labels are always English */
  isRtl: boolean;
  clientLabel?: string;
  onToggle: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onDelete: () => void;
  renderMedia: (item: GalleryItem, onClick?: () => void) => React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition ${selected ? 'ring-2 ring-blue-500' : ''}`}>
      <input type="checkbox" checked={selected} onChange={onToggle} className="w-5 h-5 rounded" />
      <div className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer" onClick={onPreview}>
        {renderMedia(item)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.filename}</p>
        {clientLabel && <p className="text-sm opacity-50 truncate">{clientLabel}</p>}
        <div className="mt-1 max-w-md">
          <ScalpRegionCaption item={item} />
        </div>
      </div>
      <p className="text-sm opacity-50 hidden sm:block">
        {new Date(item.createdAt).toLocaleDateString('en-US')}
      </p>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onPreview} className="p-2 rounded-lg hover:bg-white/10" title="View">
          <Eye size={16} />
        </button>
        <button type="button" onClick={onDownload} className="p-2 rounded-lg hover:bg-green-500/20 text-green-400" title="Download">
          <Download size={16} />
        </button>
        <button type="button" onClick={onDelete} className="p-2 rounded-lg hover:bg-red-500/20 text-red-400" title="Delete">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const g = useGalleryPage();
  // حالت list سطر جدا دارد؛ تایل‌ها فقط اندازه‌های شبکه‌ای را می‌پذیرند
  const tileViewMode: Exclude<GalleryViewMode, 'list'> = g.viewMode === 'list' ? 'standard' : g.viewMode;

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      <input
        ref={g.regionFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          if (e.target.files?.length) void g.handleRegionFilesSelected(e.target.files);
        }}
      />

      <div className="w-full xl:w-[380px] xl:sticky xl:top-4 shrink-0">
        <ScalpRegionSidePanel
          selectedId={g.activeRegionId}
          assignedIds={g.assignedRegionIds}
          onSelect={g.selectRegionForUpload}
          isRtl={g.isRtl}
          disabled={!g.filterClient}
          disabledHint="Select a client to upload region photos"
          assignedCount={g.assignedRegionIds.size}
          onPauseEnd={g.pauseEndVisit}
          onEnd={g.endVisit}
          lensMode={g.activeLensMode}
          onLensModeChange={g.selectLensMode}
        />
      </div>

      <div className="flex-1 min-w-0 space-y-6">
        <GalleryToolbar
          isRtl={g.isRtl}
          total={g.total}
          typeCounts={g.typeCounts}
          activeTab={g.activeTab}
          onActiveTabChange={g.setActiveTab}
          searchQuery={g.searchQuery}
          onSearchQueryChange={g.setSearchQuery}
          filterClient={g.filterClient}
          onFilterClientChange={g.selectClient}
          selectedClient={g.selectedClient}
          clientDropdownOpen={g.clientDropdownOpen}
          onClientDropdownOpenChange={g.setClientDropdownOpen}
          clientSearchQuery={g.clientSearchQuery}
          onClientSearchQueryChange={g.setClientSearchQuery}
          searchedClients={g.searchedClients}
          dropdownRef={g.dropdownRef}
          displayMode={g.displayMode}
          onDisplayModeChange={g.setDisplayMode}
          onClearExpandedAlbum={() => g.setExpandedAlbumId(null)}
          viewMode={g.viewMode}
          onViewModeChange={g.setViewMode}
          selectedItemsCount={g.selectedItems.length}
          onDeleteSelected={g.deleteSelected}
          fileInputRef={g.fileInputRef}
          onFilesSelected={g.handleMiscFiles}
          galleryDateFrom={g.galleryDateFrom}
          onGalleryDateFromChange={value => { g.setGalleryDateFrom(value); }}
          galleryDateTo={g.galleryDateTo}
          onGalleryDateToChange={value => { g.setGalleryDateTo(value); }}
          galleryRegionId={g.galleryRegionId}
          onGalleryRegionChange={value => { g.setGalleryRegionId(value); }}
          galleryLensMode={g.galleryLensMode}
          onGalleryLensModeChange={value => { g.setGalleryLensMode(value); }}
          onClearGalleryFilters={() => { g.setGalleryDateFrom(''); g.setGalleryDateTo(''); g.setGalleryRegionId(null); g.setGalleryLensMode(null); }}
        />

        {g.loading && g.items.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <Loader className="animate-spin mx-auto mb-4" size={32} />
            <p>Loading...</p>
          </div>
        ) : g.uploading ? (
          <div className="text-center py-12 opacity-50">
            <Loader className="animate-spin mx-auto mb-4" size={32} />
            <p>Uploading...</p>
          </div>
        ) : g.scopedLoading && g.scopedItems === null ? (
          <div className="text-center py-12 opacity-50">
            <Loader className="animate-spin mx-auto mb-4" size={32} />
            <p>Searching...</p>
          </div>
        ) : g.filteredItems.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <Image size={48} className="mx-auto mb-4 opacity-30" />
            <p>No items found</p>
          </div>
        ) : g.displayMode === 'byClient' ? (
          <>
            {g.expandedAlbum ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => g.setExpandedAlbumId(null)}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-sm"
                  >
                    ← Back to albums
                  </button>
                  <div>
                    <h3 className="font-semibold text-lg">
                      {g.expandedAlbum.client
                        ? `${g.expandedAlbum.client.firstName} ${g.expandedAlbum.client.lastName}`
                        : 'Unknown client'}
                    </h3>
                    <p className="text-sm opacity-50">
                      {g.expandedAlbum.items.length} files in this album
                    </p>
                  </div>
                </div>
                {g.viewMode === 'list' ? (
                  <div className="space-y-2">
                    {g.expandedAlbum.items.map(item => (
                      <PhotoListRow
                        key={item.id}
                        item={item}
                        selected={g.selectedItems.includes(item.id)}
                        isRtl={g.isRtl}
                        onToggle={() => g.toggleSelect(item.id)}
                        onPreview={() => g.openPreview(item)}
                        onDownload={() => g.downloadImage(item)}
                        onDelete={() => g.deleteItem(item.id)}
                        renderMedia={g.renderTileMedia}
                      />
                    ))}
                  </div>
                ) : (
                  <div className={mediaGridClass(g.viewMode)}>
                    {g.expandedAlbum.items.map(item => (
                      <PhotoTile
                        key={item.id}
                        item={item}
                        selected={g.selectedItems.includes(item.id)}
                        isRtl={g.isRtl}
                        onToggle={() => g.toggleSelect(item.id)}
                        onPreview={() => g.openPreview(item)}
                        onDownload={() => g.downloadImage(item)}
                        onDelete={() => g.deleteItem(item.id)}
                        renderMedia={g.renderTileMedia}
                        viewMode={tileViewMode}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={albumGridClass(g.viewMode)}>
                {g.pagedAlbums.map(album => (
                  <ClientAlbumTile
                    key={album.clientId}
                    album={album}
                    isRtl={g.isRtl}
                    onOpen={() => g.setExpandedAlbumId(album.clientId)}
                    renderTileMedia={item => g.renderTileMedia(item)}
                    viewMode={g.viewMode}
                  />
                ))}
              </div>
            )}
            {!g.expandedAlbum && (
              <GalleryPagination
                activePage={g.activePage}
                activeTotalPages={g.activeTotalPages}
                isRtl={g.isRtl}
                loading={g.loading}
                scopedLoading={g.scopedLoading}
                onPageChange={g.goGalleryPage}
                totalItems={g.activeTotalItems}
                pageSize={g.activePageSize}
              />
            )}
          </>
        ) : g.viewMode !== 'list' ? (
          <>
            <div className={mediaGridClass(g.viewMode)}>
              {g.pagedItems.map(item => (
                <PhotoTile
                  key={item.id}
                  item={item}
                  selected={g.selectedItems.includes(item.id)}
                  isRtl={g.isRtl}
                  clientLabel={`${g.getClient(item.clientId)?.firstName ?? ''} ${g.getClient(item.clientId)?.lastName ?? ''}`}
                  onToggle={() => g.toggleSelect(item.id)}
                  onPreview={() => g.openPreview(item)}
                  onDownload={() => g.downloadImage(item)}
                  onDelete={() => g.deleteItem(item.id)}
                  renderMedia={g.renderTileMedia}
                  viewMode={tileViewMode}
                />
              ))}
            </div>
            <GalleryPagination
              activePage={g.activePage}
              activeTotalPages={g.activeTotalPages}
              isRtl={g.isRtl}
              loading={g.loading}
              scopedLoading={g.scopedLoading}
              onPageChange={g.goGalleryPage}
              totalItems={g.activeTotalItems}
              pageSize={g.activePageSize}
            />
          </>
        ) : (
          <>
            <div className="space-y-2">
              {g.pagedItems.map(item => (
                <PhotoListRow
                  key={item.id}
                  item={item}
                  selected={g.selectedItems.includes(item.id)}
                  isRtl={g.isRtl}
                  clientLabel={`${g.getClient(item.clientId)?.firstName ?? ''} ${g.getClient(item.clientId)?.lastName ?? ''}`}
                  onToggle={() => g.toggleSelect(item.id)}
                  onPreview={() => g.openPreview(item)}
                  onDownload={() => g.downloadImage(item)}
                  onDelete={() => g.deleteItem(item.id)}
                  renderMedia={g.renderTileMedia}
                />
              ))}
            </div>
            <GalleryPagination
              activePage={g.activePage}
              activeTotalPages={g.activeTotalPages}
              isRtl={g.isRtl}
              loading={g.loading}
              scopedLoading={g.scopedLoading}
              onPageChange={g.goGalleryPage}
              totalItems={g.activeTotalItems}
              pageSize={g.activePageSize}
            />
          </>
        )}

        {!g.expandedAlbum && (g.displayMode === 'all' ? g.pagedItems.length > 0 : g.pagedAlbums.length > 0) && (
          <div className="text-center text-sm opacity-50 pb-2">
            {`Page ${g.activePage} of ${g.activeTotalPages} — ${g.displayMode === 'byClient' ? g.clientAlbums.length : (g.needsScoped ? g.filteredItems.length : g.total)} total`}
          </div>
        )}
      </div>

      {g.previewItem && (
        <GalleryLightbox
          previewItem={g.previewItem}
          previewUrl={g.previewUrl}
          zoom={g.zoom}
          rotation={g.rotation}
          isRtl={g.isRtl}
          getClient={g.getClient}
          onClose={() => g.setPreviewItem(null)}
          onZoomChange={g.setZoom}
          onRotationChange={g.setRotation}
          onDownload={g.downloadImage}
        />
      )}
    </div>
  );
}
