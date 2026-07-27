import { useEffect, useState, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { Image, Video } from 'lucide-react';
import { useGalleryStore, useClientsStore, useSettingsStore } from '../../store';
import { db, resolveGalleryItemUrl } from '../../db';
import type { GalleryItem } from '../../db';
import { generateMediaThumbnail } from '../../lib/mediaThumbnail';
import {
  SCALP_REGION_IDS,
  SCALP_REGION_META_KEY,
  readScalpRegionFromMetadata,
  type ScalpRegionId,
} from '../../lib/scalpRegions';
import {
  SCALP_VISIT_META_KEY,
  ensureActiveVisit,
  pauseScalpVisit,
  endScalpVisit,
  getResumableVisit,
  setLastSelectedClient,
  getLastSelectedClient,
  clearLastSelectedClient,
  collectAssignedRegionModesForVisit,
} from '../../lib/scalpVisitSession';
import {
  TRICHOSCOPE_MODE_META_KEY,
  readTrichoscopeModeFromMetadata,
  regionModeKey,
  type TrichoscopeModeId,
} from '../../lib/trichoscopeModes';
import {
  ALBUM_PAGE_SIZE,
  RECENT_CLIENTS_LIMIT,
  CLIENT_SEARCH_LIMIT,
  persistGalleryDisplayMode,
  persistGalleryViewMode,
  readStoredGalleryDisplayMode,
  readStoredGalleryViewMode,
  type DisplayMode,
  type GalleryViewMode,
} from './constants';
import type { ClientAlbum } from './ClientAlbumTile';

export function useGalleryPage() {
  const { items, loading, total, pageSize, fetchPage, addItem, deleteItem: deleteGalleryItemFromStore, fetchByClient } = useGalleryStore();
  const { clients, fetchClients } = useClientsStore();
  const { settings } = useSettingsStore();
  const isRtl = settings.language === 'fa';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'photo' | 'video'>('photo');
  const [viewMode, setViewMode] = useState<GalleryViewMode>(() => readStoredGalleryViewMode());
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readStoredGalleryDisplayMode());

  useEffect(() => {
    persistGalleryViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    persistGalleryDisplayMode(displayMode);
  }, [displayMode]);

  const [filterClient, setFilterClient] = useState(() => {
    const lastClient = getLastSelectedClient();
    return lastClient && getResumableVisit(lastClient) ? lastClient : '';
  });
  const [expandedAlbumId, setExpandedAlbumId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<GalleryItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [activeRegionId, setActiveRegionId] = useState<ScalpRegionId | null>(null);
  // فیلترهای خود گالری (مستقل از ناحیه انتخابی برای آپلود)
  const [galleryDateFrom, setGalleryDateFrom] = useState('');
  const [galleryDateTo, setGalleryDateTo] = useState('');
  const [galleryRegionId, setGalleryRegionId] = useState<ScalpRegionId | null>(null);
  const [galleryLensMode, setGalleryLensMode] = useState<TrichoscopeModeId | null>(null);
  /** جلسهٔ جاری آپلود ناحیه‌ای برای مشتری انتخاب‌شده */
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [activeLensMode, setActiveLensMode] = useState<TrichoscopeModeId>('NL');
  // Immediate UI guard for the current visit/lens. The DB remains the source
  // of truth, but this prevents a second click before the refresh completes.
  const [optimisticAssignedRegionModes, setOptimisticAssignedRegionModes] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const regionFileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pendingRegionRef = useRef<ScalpRegionId | null>(null);
  const pendingLensModeRef = useRef<TrichoscopeModeId>('NL');
  /** صفحه‌بندی محلی برای حالت فیلتر/جستجو/آلبوم مشتری */
  const [localPage, setLocalPage] = useState(1);

  // برای فیلتر/جستجو/آلبوم و تب عکس/ویدیو باید کل داده‌ها بارگذاری شود،
  // وگرنه شمارش تب و فیلتر نوع فقط روی صفحهٔ جاری استور اعمال می‌شود.
  const [scopedItems, setScopedItems] = useState<GalleryItem[] | null>(null);
  const [scopedLoading, setScopedLoading] = useState(false);
  const [serverItems, setServerItems] = useState<GalleryItem[]>([]);
  const [serverTotal, setServerTotal] = useState(0);
  const [serverLoading, setServerLoading] = useState(false);
  const scopedMutationVersion = useRef(0);
  // حالت All files از query صفحه‌بندی‌شدهٔ backend استفاده می‌کند؛ حالت
  // By client برای ساخت آلبوم‌ها فعلاً به مجموعهٔ scoped نیاز دارد.
  // Region assignment always needs the selected client's current visit rows,
  // even when the main gallery is in All files mode.
  const needsScoped = displayMode === 'byClient' || !!filterClient;

  useEffect(() => {
    setLocalPage(1);
    setExpandedAlbumId(null);
  }, [displayMode, filterClient, searchQuery, activeTab, galleryDateFrom, galleryDateTo, galleryRegionId, galleryLensMode]);

  useEffect(() => {
    let cancelled = false;
    const mutationVersionAtStart = scopedMutationVersion.current;
    const loadScoped = async () => {
      if (!needsScoped) {
        setScopedItems(null);
        return;
      }
      setScopedLoading(true);
      try {
        const result = filterClient
          ? await fetchByClient(filterClient)
          : await db.getAllGallery();
        if (!cancelled && mutationVersionAtStart === scopedMutationVersion.current) {
          setScopedItems(Array.isArray(result) ? result : []);
        }
      } finally {
        if (!cancelled) setScopedLoading(false);
      }
    };
    void loadScoped();
    return () => { cancelled = true; };
  }, [filterClient, fetchByClient, total, needsScoped]);

  const serverQuery = useMemo(() => ({
    type: activeTab,
    clientId: filterClient || undefined,
    search: searchQuery || undefined,
    startDate: galleryDateFrom ? `${galleryDateFrom}T00:00:00.000Z` : undefined,
    endDate: galleryDateTo ? `${galleryDateTo}T23:59:59.999Z` : undefined,
    regionId: galleryRegionId || undefined,
    trichoscopeMode: galleryLensMode || undefined,
    limit: pageSize,
    offset: (localPage - 1) * pageSize,
  }), [activeTab, filterClient, searchQuery, galleryDateFrom, galleryDateTo, galleryRegionId, galleryLensMode, localPage, pageSize]);

  useEffect(() => {
    if (displayMode !== 'all') return;
    let cancelled = false;
    setServerLoading(true);
    Promise.all([
      db.getGalleryPage(serverQuery),
      db.getGalleryPageCount({
        type: serverQuery.type,
        clientId: serverQuery.clientId,
        search: serverQuery.search,
        startDate: serverQuery.startDate,
        endDate: serverQuery.endDate,
        regionId: serverQuery.regionId,
        trichoscopeMode: serverQuery.trichoscopeMode,
      }),
    ])
      .then(([rows, count]) => {
        if (!cancelled) { setServerItems(rows); setServerTotal(count); }
      })
      .catch(() => { if (!cancelled) { setServerItems([]); setServerTotal(0); } })
      .finally(() => { if (!cancelled) setServerLoading(false); });
    return () => { cancelled = true; };
  }, [displayMode, serverQuery]);

  const sourceItems = displayMode === 'all' ? serverItems : (scopedItems ?? items);

  const typeCounts = useMemo(() => ({
    photo: sourceItems.filter(i => i.type === 'photo').length,
    video: sourceItems.filter(i => i.type === 'video').length,
  }), [sourceItems]);

  // Search and filter
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return sourceItems.filter(item => {
      const matchesType = item.type === activeTab;
      const matchesClient = !filterClient || item.clientId === filterClient;
      const client = clients.find(c => c.id === item.clientId);
      const matchesSearch = !q || (client && `${client.firstName} ${client.lastName}`.toLowerCase().includes(q));
      const createdAt = new Date(item.createdAt).getTime();
      const from = galleryDateFrom ? new Date(`${galleryDateFrom}T00:00:00`).getTime() : -Infinity;
      const to = galleryDateTo ? new Date(`${galleryDateTo}T23:59:59.999`).getTime() : Infinity;
      const matchesDate = createdAt >= from && createdAt <= to;
      const matchesRegion = !galleryRegionId || readScalpRegionFromMetadata(item.metadata) === galleryRegionId;
      const matchesLens = !galleryLensMode || item.metadata?.[TRICHOSCOPE_MODE_META_KEY] === galleryLensMode;
      return matchesType && matchesClient && matchesSearch && matchesDate && matchesRegion && matchesLens;
    });
  }, [sourceItems, activeTab, filterClient, searchQuery, clients, galleryDateFrom, galleryDateTo, galleryRegionId, galleryLensMode]);

  const getClient = (id: string) => clients.find(c => c.id === id);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered clients for searchable dropdown — بدون جستجو فقط اخیر؛ با جستجو حداکثر نتایج محدود
  const searchedClients = useMemo(() => {
    const q = clientSearchQuery.trim().toLowerCase();
    if (!q) {
      return [...clients]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, RECENT_CLIENTS_LIMIT);
    }
    return clients
      .filter(c => `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(q))
      .slice(0, CLIENT_SEARCH_LIMIT);
  }, [clients, clientSearchQuery]);

  const selectedClient = clients.find(c => c.id === filterClient);

  useEffect(() => { fetchPage(1); fetchClients(); }, [fetchPage, fetchClients]);

  const clientAlbums = useMemo<ClientAlbum[]>(() => {
    const map = new Map<string, GalleryItem[]>();
    for (const item of filteredItems) {
      const list = map.get(item.clientId) || [];
      list.push(item);
      map.set(item.clientId, list);
    }
    return Array.from(map.entries())
      .map(([clientId, albumItems]) => ({
        clientId,
        client: clients.find(c => c.id === clientId),
        items: albumItems.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
      }))
      .sort((a, b) => {
        const an = `${a.client?.firstName || ''} ${a.client?.lastName || ''}`.trim();
        const bn = `${b.client?.firstName || ''} ${b.client?.lastName || ''}`.trim();
        return an.localeCompare(bn, isRtl ? 'fa' : 'en');
      });
  }, [filteredItems, clients, isRtl]);

  const expandedAlbum = expandedAlbumId
    ? clientAlbums.find(a => a.clientId === expandedAlbumId) || null
    : null;

  // صفحه‌بندی: در حالت «همه فایل‌ها» بدون اسکوپ از استور؛ وگرنه محلی
  const useServerPaging = displayMode === 'all';
  const localItemTotalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const serverItemTotalPages = Math.max(1, Math.ceil(serverTotal / pageSize));
  const localAlbumTotalPages = Math.max(1, Math.ceil(clientAlbums.length / ALBUM_PAGE_SIZE));
  const activeTotalPages = displayMode === 'byClient' && !expandedAlbum
    ? localAlbumTotalPages
    : (useServerPaging ? serverItemTotalPages : localItemTotalPages);
  const activePage = localPage;
  const activePageSize = displayMode === 'byClient' && !expandedAlbum ? ALBUM_PAGE_SIZE : pageSize;
  const activeTotalItems = displayMode === 'byClient' && !expandedAlbum
    ? clientAlbums.length
    : (useServerPaging ? serverTotal : filteredItems.length);

  const pagedItems = useMemo(() => {
    if (useServerPaging) return filteredItems;
    const start = (localPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, useServerPaging, localPage, pageSize]);

  const pagedAlbums = useMemo(() => {
    const start = (localPage - 1) * ALBUM_PAGE_SIZE;
    return clientAlbums.slice(start, start + ALBUM_PAGE_SIZE);
  }, [clientAlbums, localPage]);

  const goGalleryPage = (next: number) => {
    const safe = Math.max(1, Math.min(activeTotalPages, next));
    setLocalPage(safe);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  // هنگام انتخاب مشتری: ادامه جلسه paused یا ساخت جلسه جدید
  useEffect(() => {
    if (!filterClient) {
      setActiveVisitId(null);
      setActiveRegionId(null);
      setActiveLensMode('NL');
      setOptimisticAssignedRegionModes(new Set());
      return;
    }
    setOptimisticAssignedRegionModes(new Set());
    const visitId = ensureActiveVisit(filterClient);
    setActiveVisitId(visitId);
    setActiveRegionId(null);
    setActiveLensMode('NL');
  }, [filterClient]);

  const selectClient = useCallback((clientId: string) => {
    setFilterClient(clientId);
    if (clientId) setLastSelectedClient(clientId);
    else clearLastSelectedClient();
    setClientDropdownOpen(false);
  }, []);

  const clearClientSelection = useCallback(() => {
    setFilterClient('');
    setActiveVisitId(null);
    setActiveRegionId(null);
    setActiveLensMode('NL');
    setOptimisticAssignedRegionModes(new Set());
    clearLastSelectedClient();
    pendingRegionRef.current = null;
  }, []);

  const pauseEndVisit = useCallback(() => {
    if (!filterClient) return;
    pauseScalpVisit(filterClient);
    // Pause means save progress, not close the region workflow. Keep the
    // customer, visit id and nine-region grid visible; selecting/uploading a
    // new region will reactivate the same visit id through ensureActiveVisit.
    setActiveRegionId(null);
    pendingRegionRef.current = null;
  }, [filterClient]);

  const endVisit = useCallback(() => {
    if (!filterClient) return;
    endScalpVisit(filterClient);
    clearClientSelection();
  }, [filterClient, clearClientSelection]);

  const assignedRegionModeKeys = useMemo(() => {
    if (!filterClient || !activeVisitId) return new Set<string>();
    const pool = (scopedItems ?? []).filter(i => i.clientId === filterClient);
    const persisted = collectAssignedRegionModesForVisit(pool, activeVisitId, readScalpRegionFromMetadata);
    for (const key of optimisticAssignedRegionModes) persisted.add(key);
    return persisted;
  }, [filterClient, scopedItems, activeVisitId, optimisticAssignedRegionModes]);

  const assignedRegionIds = useMemo(() => {
    const set = new Set<ScalpRegionId>();
    for (const regionId of SCALP_REGION_IDS) {
      if (assignedRegionModeKeys.has(regionModeKey(regionId, activeLensMode))) {
        set.add(regionId);
      }
    }
    return set;
  }, [assignedRegionModeKeys, activeLensMode]);

  const selectLensMode = useCallback((mode: TrichoscopeModeId) => {
    setActiveLensMode(mode);
    setActiveRegionId(null);
    pendingRegionRef.current = null;
    pendingLensModeRef.current = mode;
  }, []);

  const refreshGalleryAfterMutation = useCallback(async () => {
    const version = ++scopedMutationVersion.current;
    const clientPromise = needsScoped && filterClient
      ? db.getGalleryByClient(filterClient)
      : Promise.resolve(null);
    const pagePromise = displayMode === 'all'
      ? Promise.all([
        db.getGalleryPage(serverQuery),
        db.getGalleryPageCount({
          type: serverQuery.type,
          clientId: serverQuery.clientId,
          search: serverQuery.search,
          startDate: serverQuery.startDate,
          endDate: serverQuery.endDate,
          regionId: serverQuery.regionId,
          trichoscopeMode: serverQuery.trichoscopeMode,
        }),
      ])
      : Promise.resolve(null);
    const [clientItems, pageResult] = await Promise.all([clientPromise, pagePromise]);
    if (version !== scopedMutationVersion.current) return;
    if (clientItems) setScopedItems(clientItems);
    if (pageResult) {
      setServerItems(pageResult[0]);
      setServerTotal(pageResult[1]);
    }
  }, [displayMode, filterClient, needsScoped, serverQuery]);

  const uploadFilesWithRegion = async (
    files: FileList | File[],
    regionId: ScalpRegionId | null,
    lensMode: TrichoscopeModeId = activeLensMode,
  ) => {
    if (!filterClient) {
      alert('Please select a client first');
      return;
    }
    if (regionId && assignedRegionModeKeys.has(regionModeKey(regionId, lensMode))) {
      return;
    }
    // Re-open a paused visit in place when the user continues uploading without
    // leaving the customer selected. The visit id remains stable.
    const visitId = ensureActiveVisit(filterClient);
    if (visitId !== activeVisitId) setActiveVisitId(visitId);

    setUploading(true);
    try {
      // هر ترکیب ناحیه + لنز فقط یک عکس در هر جلسه می‌پذیرد.
      const uploadQueue = regionId ? Array.from(files).slice(0, 1) : Array.from(files);
      for (const file of uploadQueue) {
        const isVideo = file.type.startsWith('video/');
        const type = isVideo ? 'video' : 'photo';
        const dataUrl = await readFileAsDataUrl(file);
        const thumbnail = await generateMediaThumbnail(dataUrl, type);
        const metadata =
          regionId && type === 'photo'
            ? {
                [SCALP_REGION_META_KEY]: regionId,
                [SCALP_VISIT_META_KEY]: visitId,
                [TRICHOSCOPE_MODE_META_KEY]: lensMode,
              }
            : undefined;
        const newItem = await addItem(filterClient, {
          clientId: filterClient,
          type,
          url: dataUrl,
          thumbnail,
          filename: file.name,
          metadata,
        });
        // Keep the currently selected client's scoped gallery in sync immediately.
        // The global page refresh does not necessarily change `total`, so relying
        // only on the scoped-loading effect could leave the new region unassigned
        // until the user leaves and re-enters the gallery.
        scopedMutationVersion.current += 1;
        if (regionId && type === 'photo') {
          const key = regionModeKey(regionId, lensMode);
          setOptimisticAssignedRegionModes(current => {
            const next = new Set(current);
            next.add(key);
            return next;
          });
        }
        setScopedItems(current => current ? [newItem, ...current] : [newItem]);
      }
      await refreshGalleryAfterMutation();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (regionFileInputRef.current) regionFileInputRef.current.value = '';
    }
  };

  /** انتخاب ناحیه از پنل چپ → باز شدن خودکار پنجره فایل */
  const selectRegionForUpload = useCallback((regionId: ScalpRegionId) => {
    if (!filterClient) {
      alert('Please select a client first');
      return;
    }
    if (assignedRegionIds.has(regionId)) {
      return;
    }
    setActiveRegionId(regionId);
    pendingRegionRef.current = regionId;
    pendingLensModeRef.current = activeLensMode;
    window.setTimeout(() => regionFileInputRef.current?.click(), 80);
  }, [filterClient, assignedRegionIds, activeLensMode]);

  const handleRegionFilesSelected = async (files: FileList) => {
    const regionId = pendingRegionRef.current || activeRegionId;
    const lensMode = pendingLensModeRef.current;
    if (!regionId || assignedRegionModeKeys.has(regionModeKey(regionId, lensMode))) return;
    await uploadFilesWithRegion(files, regionId, lensMode);
    setActiveRegionId(null);
    pendingRegionRef.current = null;
  };

  /** آپلود متفرقه — بدون برچسب ناحیه */
  const handleMiscFiles = async (files: FileList) => {
    await uploadFilesWithRegion(files, null);
  };

  const deleteGalleryItem = useCallback(async (id: string) => {
    const deleted = scopedItems?.find(item => item.id === id);
    await deleteGalleryItemFromStore(id);
    if (deleted) {
      const regionId = readScalpRegionFromMetadata(deleted.metadata);
      const lensMode = readTrichoscopeModeFromMetadata(deleted.metadata) ?? 'NL';
      if (regionId) {
        const key = regionModeKey(regionId, lensMode);
        setOptimisticAssignedRegionModes(current => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    }
    await refreshGalleryAfterMutation();
  }, [deleteGalleryItemFromStore, refreshGalleryAfterMutation, scopedItems]);

  const toggleSelect = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const deleteSelected = async () => {
    if (!confirm('Are you sure?')) return;
    for (const id of selectedItems) await deleteGalleryItem(id);
    setSelectedItems([]);
  };

  // محتوای کامل آیتم پیش‌نمایش — لیست‌ها فقط thumbnail دارند و محتوای
  // کامل هنگام باز شدن پیش‌نمایش on-demand بارگذاری می‌شود
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewIdRef = useRef<string | null>(null);

  const openPreview = (item: GalleryItem) => {
    setPreviewItem(item);
    setPreviewUrl(null);
    setZoom(1);
    setRotation(0);
    previewIdRef.current = item.id;
    resolveGalleryItemUrl(item).then(full => {
      if (previewIdRef.current === item.id) setPreviewUrl(full);
    });
  };

  const downloadImage = async (item: GalleryItem) => {
    const url = await resolveGalleryItemUrl(item);
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = item.filename || `image-${item.id}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // در لیست‌ها url ویدیوهای فایل‌محور یک thumbnail تصویری (jpeg) است و فقط
  // ردیف‌های legacy خودِ data URL ویدیو را دارند؛ بر همین اساس رندر می‌کنیم.
  const renderTileMedia = (item: GalleryItem, onClick?: () => void): ReactNode => {
    if (!item.url) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-white/5" onClick={onClick}>
          {item.type === 'photo' ? <Image size={24} className="opacity-30" /> : <Video size={24} className="opacity-30" />}
        </div>
      );
    }
    if (item.type === 'video' && item.url.startsWith('data:video')) {
      return <video src={item.url} className="w-full h-full object-cover" onClick={onClick} />;
    }
    return <img src={item.url} alt={item.filename} className="w-full h-full object-cover" onClick={onClick} />;
  };

  return {
    isRtl,
    items,
    loading: loading || serverLoading,
    total,
    needsScoped,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    viewMode,
    setViewMode,
    displayMode,
    setDisplayMode,
    filterClient,
    setFilterClient,
    galleryDateFrom,
    setGalleryDateFrom,
    galleryDateTo,
    setGalleryDateTo,
    galleryRegionId,
    setGalleryRegionId,
    galleryLensMode,
    setGalleryLensMode,
    selectClient,
    clearClientSelection,
    pauseEndVisit,
    endVisit,
    activeVisitId,
    visitIsResumable: filterClient ? !!getResumableVisit(filterClient) : false,
    expandedAlbumId,
    setExpandedAlbumId,
    selectedItems,
    previewItem,
    setPreviewItem,
    uploading,
    zoom,
    setZoom,
    rotation,
    setRotation,
    clientDropdownOpen,
    setClientDropdownOpen,
    clientSearchQuery,
    setClientSearchQuery,
    fileInputRef,
    dropdownRef,
    scopedItems,
    scopedLoading,
    typeCounts,
    filteredItems,
    getClient,
    searchedClients,
    selectedClient,
    clientAlbums,
    expandedAlbum,
    activeTotalPages,
    activePage,
    activePageSize,
    activeTotalItems,
    pagedItems,
    pagedAlbums,
    goGalleryPage,
    handleMiscFiles,
    activeRegionId,
    activeLensMode,
    selectLensMode,
    assignedRegionIds,
    assignedRegionModeKeys,
    selectRegionForUpload,
    regionFileInputRef,
    handleRegionFilesSelected,
    toggleSelect,
    deleteSelected,
    previewUrl,
    openPreview,
    downloadImage,
    renderTileMedia,
    deleteItem: deleteGalleryItem,
  };
}
