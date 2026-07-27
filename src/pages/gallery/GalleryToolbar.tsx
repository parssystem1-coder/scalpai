import type { RefObject } from 'react';
import { useState } from 'react';
import {
  Image, Video, Upload, List, Trash2, Search, Users, Images, ChevronDown, ChevronUp, Check, Grid2X2,
} from 'lucide-react';
import PersianCalendar from '../../components/PersianCalendar';
import ScalpRegionGrid from '../../components/scalp-region/ScalpRegionGrid';
import type { ScalpRegionId } from '../../lib/scalpRegions';
import { TRICHOSCOPE_MODES, type TrichoscopeModeId } from '../../lib/trichoscopeModes';
import type { Client } from '../../db';
import {
  CLIENT_SEARCH_LIMIT,
  RECENT_CLIENTS_LIMIT,
  type DisplayMode,
  type GalleryViewMode,
} from './constants';

type GalleryToolbarProps = {
  /** kept for API compatibility — labels are always English */
  isRtl: boolean;
  total: number;
  typeCounts: { photo: number; video: number };
  activeTab: 'photo' | 'video';
  onActiveTabChange: (tab: 'photo' | 'video') => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  filterClient: string;
  onFilterClientChange: (id: string) => void;
  selectedClient: Client | undefined;
  clientDropdownOpen: boolean;
  onClientDropdownOpenChange: (open: boolean) => void;
  clientSearchQuery: string;
  onClientSearchQueryChange: (value: string) => void;
  searchedClients: Client[];
  dropdownRef: RefObject<HTMLDivElement>;
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onClearExpandedAlbum: () => void;
  viewMode: GalleryViewMode;
  onViewModeChange: (mode: GalleryViewMode) => void;
  selectedItemsCount: number;
  onDeleteSelected: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
  onFilesSelected: (files: FileList) => void;
  galleryDateFrom: string;
  onGalleryDateFromChange: (value: string) => void;
  galleryDateTo: string;
  onGalleryDateToChange: (value: string) => void;
  galleryRegionId: ScalpRegionId | null;
  onGalleryRegionChange: (value: ScalpRegionId | null) => void;
  galleryLensMode: TrichoscopeModeId | null;
  onGalleryLensModeChange: (value: TrichoscopeModeId | null) => void;
  onClearGalleryFilters: () => void;
};

export function GalleryToolbar({
  total,
  typeCounts,
  activeTab,
  onActiveTabChange,
  searchQuery,
  onSearchQueryChange,
  filterClient,
  onFilterClientChange,
  selectedClient,
  clientDropdownOpen,
  onClientDropdownOpenChange,
  clientSearchQuery,
  onClientSearchQueryChange,
  searchedClients,
  dropdownRef,
  displayMode,
  onDisplayModeChange,
  onClearExpandedAlbum,
  viewMode,
  onViewModeChange,
  selectedItemsCount,
  onDeleteSelected,
  fileInputRef,
  onFilesSelected,
  galleryDateFrom,
  onGalleryDateFromChange,
  galleryDateTo,
  onGalleryDateToChange,
  galleryRegionId,
  onGalleryRegionChange,
  galleryLensMode,
  onGalleryLensModeChange,
  onClearGalleryFilters,
  isRtl,
}: GalleryToolbarProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-white/10 pb-4">
        <button onClick={() => onActiveTabChange('photo')} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${activeTab === 'photo' ? 'bg-blue-500 text-white' : 'hover:bg-white/10'}`}>
          <Image size={20} />
          <span>Photos</span>
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">{typeCounts.photo}</span>
        </button>
        <button onClick={() => onActiveTabChange('video')} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${activeTab === 'video' ? 'bg-purple-500 text-white' : 'hover:bg-white/10'}`}>
          <Video size={20} />
          <span>Videos</span>
          <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs">{typeCounts.video}</span>
        </button>
        <div className="flex-1" />
        <span className="text-sm opacity-50">
          {`${total} items`}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={18} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              className="w-full ps-10 pe-4 py-2 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none text-sm"
            />
          </div>
          {/* Client Filter - Searchable Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => onClientDropdownOpenChange(!clientDropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-blue-500 focus:border-blue-500 focus:outline-none min-w-[200px] text-start"
            >
              <span className="flex-1 truncate">
                {selectedClient ? `${selectedClient.firstName} ${selectedClient.lastName}` : 'All Clients'}
              </span>
              <svg className={`w-4 h-4 transition-transform ${clientDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {clientDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full min-w-[250px] bg-gray-800 border border-white/20 rounded-xl shadow-2xl overflow-hidden">
                {/* Search Input */}
                <div className="p-2 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute top-1/2 -translate-y-1/2 start-3 opacity-50" size={16} />
                    <input
                      type="text"
                      placeholder="Search client..."
                      value={clientSearchQuery}
                      onChange={e => onClientSearchQueryChange(e.target.value)}
                      className="w-full ps-9 pe-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none text-sm"
                      autoFocus
                    />
                  </div>
                </div>
                {/* Options List */}
                <div className="max-h-60 overflow-y-auto">
                  <button
                    onClick={() => { onFilterClientChange(''); onClientDropdownOpenChange(false); onClientSearchQueryChange(''); }}
                    className={`w-full px-4 py-2 text-start hover:bg-white/10 transition ${!filterClient ? 'bg-blue-500/20 text-blue-400' : ''}`}
                  >
                    All Clients
                  </button>
                  {!clientSearchQuery.trim() && (
                    <div className="px-4 py-1.5 text-xs opacity-50 border-b border-white/10">
                      {`Recent ${RECENT_CLIENTS_LIMIT} clients`}
                    </div>
                  )}
                  {searchedClients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onFilterClientChange(c.id); onClientDropdownOpenChange(false); onClientSearchQueryChange(''); }}
                      className={`w-full px-4 py-2 text-start hover:bg-white/10 transition flex items-center gap-3 ${filterClient === c.id ? 'bg-blue-500/20 text-blue-400' : ''}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                        {c.firstName?.[0] || '?'}
                      </div>
                      <div>
                        <p className="font-medium">{c.firstName} {c.lastName}</p>
                        {c.phone && <p className="text-xs opacity-50">{c.phone}</p>}
                      </div>
                    </button>
                  ))}
                  {searchedClients.length === 0 && (
                    <p className="px-4 py-3 text-center opacity-50 text-sm">No client found</p>
                  )}
                  {clientSearchQuery.trim() && searchedClients.length >= CLIENT_SEARCH_LIMIT && (
                    <p className="px-4 py-2 text-xs opacity-40 border-t border-white/10">
                      Refine search for more results
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* Display mode: by client / all */}
          <div className="flex rounded-xl bg-white/5 border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => { onDisplayModeChange('byClient'); onClearExpandedAlbum(); }}
                title="Group by client"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                  displayMode === 'byClient' ? 'bg-blue-500 text-white' : 'hover:bg-white/10 opacity-70'
                }`}
              >
                <Users size={16} />
                <span className="hidden sm:inline">By client</span>
              </button>
              <button
                type="button"
                onClick={() => { onDisplayModeChange('all'); onClearExpandedAlbum(); }}
                title="Show all media"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
                  displayMode === 'all' ? 'bg-blue-500 text-white' : 'hover:bg-white/10 opacity-70'
                }`}
              >
                <Images size={16} />
                <span className="hidden sm:inline">All files</span>
              </button>
          </div>

          {/* Size / layout controls shared by all files and client albums */}
          <div className="flex rounded-xl bg-white/5 border border-white/10 p-0.5">
            {([
              ['compact', 'Compact', 3],
              ['standard', 'Medium', 2],
              ['large', 'Large', 1],
            ] as const).map(([mode, label, columns]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                title={label}
                aria-label={label}
                className={`p-2 rounded-lg transition ${
                  viewMode === mode ? 'bg-blue-500 text-white' : 'hover:bg-white/10 opacity-65'
                }`}
              >
                <span
                  className="grid w-4 h-4 gap-[2px]"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: columns * columns }).map((_, index) => (
                    <span key={index} className="rounded-[1px] bg-current" />
                  ))}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => onViewModeChange('list')}
              title="List"
              aria-label="List"
              className={`p-2 rounded-lg transition ${
                viewMode === 'list' ? 'bg-blue-500 text-white' : 'hover:bg-white/10 opacity-65'
              }`}
            >
              <List size={16} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {selectedItemsCount > 0 && (
            <button onClick={onDeleteSelected} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30">
              <Trash2 size={16} />
              <span>{`Delete ${selectedItemsCount}`}</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" onChange={e => e.target.files && onFilesSelected(e.target.files)} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} disabled={!filterClient} className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 text-white hover:opacity-90 transition disabled:opacity-50" title="Upload without scalp region tag">
            <Upload size={20} />
            <span>Misc upload</span>
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[.03] p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs space-y-1">
              <span className="block opacity-70">Date from</span>
              <PersianCalendar value={galleryDateFrom} onChange={onGalleryDateFromChange} variant="session" isRtl={isRtl} />
            </div>
            <div className="text-xs space-y-1">
              <span className="block opacity-70">Date to</span>
              <PersianCalendar value={galleryDateTo} onChange={onGalleryDateToChange} variant="session" isRtl={isRtl} />
            </div>
            {(galleryDateFrom || galleryDateTo || galleryRegionId || galleryLensMode) && (
              <button type="button" onClick={onClearGalleryFilters} className="self-end rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">Clear filters</button>
            )}
          </div>
          <button type="button" onClick={() => setAdvancedOpen(value => !value)} className="inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm hover:bg-white/10">
            <span>Advanced filters</span>{advancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        {advancedOpen && (
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div><span className="block text-sm font-semibold">Scalp region</span><span className="block text-xs opacity-60">Filter images by head/scalp region.</span></div>
              {galleryRegionId && <button type="button" className="text-xs text-cyan-300" onClick={() => onGalleryRegionChange(null)}>Show all regions</button>}
            </div>
            <button type="button" onClick={() => onGalleryRegionChange(null)} className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-start transition-all ${!galleryRegionId ? 'border-cyan-300 bg-cyan-400/20 text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.22)]' : 'border-white/10 bg-white/[.04] hover:border-cyan-400/50'}`}>
              <span className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${!galleryRegionId ? 'bg-cyan-300 text-slate-900' : 'bg-white/10'}`}><Grid2X2 size={16} /></span><span><span className="block font-semibold">Show all regions</span><span className="block text-xs opacity-65">No region filter</span></span></span>
              {!galleryRegionId && <Check size={20} className="text-cyan-200" />}
            </button>
            <ScalpRegionGrid selectedId={galleryRegionId} assignedIds={new Set()} onSelect={onGalleryRegionChange} isRtl={isRtl} />
            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div><span className="block text-sm font-semibold">Trichoscope Lens</span><span className="block text-xs opacity-60">Filter reports by illumination/lens type.</span></div>
                {galleryLensMode && <button type="button" className="text-xs text-cyan-300" onClick={() => onGalleryLensModeChange(null)}>Show all lenses</button>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" onClick={() => onGalleryLensModeChange(null)} className={`rounded-xl border px-3 py-3 text-start transition ${!galleryLensMode ? 'border-cyan-300 bg-cyan-400/20 text-cyan-50' : 'border-white/10 bg-white/[.04] hover:border-cyan-400/50'}`}>
                  <span className="block font-semibold">All lenses</span><span className="text-xs opacity-60">Show every lens type</span>
                </button>
                {TRICHOSCOPE_MODES.map(mode => (
                  <button key={mode.id} type="button" onClick={() => onGalleryLensModeChange(mode.id)} className={`rounded-xl border px-3 py-3 text-start transition ${galleryLensMode === mode.id ? 'border-cyan-300 bg-cyan-400/20 text-cyan-50' : 'border-white/10 bg-white/[.04] hover:border-cyan-400/50'}`}>
                    <span className="flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ background: mode.color }} />{mode.en}</span><span className="text-xs opacity-60">{mode.fa}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

    </>
  );
}
