import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Grid2X2, LayoutGrid, Rows3 } from 'lucide-react';
import { db } from '../../db';
import { formatDateForDisplay } from '../../lib/jalaliDate';
import type { GalleryItem } from '../../db';
import { SCALP_REGION_META_KEY, type ScalpRegionId } from '../../lib/scalpRegions';
import ScalpRegionGrid from '../../components/scalp-region/ScalpRegionGrid';
import ScalpRegionCaption from '../../components/scalp-region/ScalpRegionCaption';
import ScalpRegionBadge from '../../components/scalp-region/ScalpRegionBadge';
import PersianCalendar from '../../components/PersianCalendar';
import { useLang, useT } from '../../i18n';
import { offlineDict } from './strings';
import { GalleryPagination } from '../gallery/GalleryPagination';

type ViewSize = 'small' | 'medium' | 'large';
const PAGE_SIZE = 18;

function toLocalIso(value: string, endOfDay = false) {
  if (!value) return undefined;
  // PersianCalendar returns a Gregorian yyyy-MM-dd date. Construct it in the
  // user's local timezone so the range represents the selected local day.
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`);
  return date.toISOString();
}

export default function TrainingPoolGalleryTab() {
  const t = useT(offlineDict);
  const { isRtl } = useLang();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [regionId, setRegionId] = useState<ScalpRegionId | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [viewSize, setViewSize] = useState<ViewSize>(() => {
    if (typeof window === 'undefined') return 'small';
    const saved = window.localStorage.getItem('scalpai-training-pool-gallery-view-size');
    return saved === 'small' || saved === 'medium' || saved === 'large' ? saved : 'small';
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    window.localStorage.setItem('scalpai-training-pool-gallery-view-size', viewSize);
  }, [viewSize]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const query = useMemo(() => ({
    status: 'completed' as const,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    startDate: toLocalIso(startDate),
    endDate: toLocalIso(endDate, true),
    regionId: regionId || undefined,
  }), [page, startDate, endDate, regionId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([db.getTrainingPoolItems(query), db.getTrainingPoolItemsCount({ status: query.status, startDate: query.startDate, endDate: query.endDate, regionId: query.regionId })])
      .then(([rows, count]) => {
        if (!cancelled) { setItems(rows.filter(item => item.type === 'photo')); setTotal(count); }
      })
      .catch(() => { if (!cancelled) { setItems([]); setTotal(0); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  const changeFilter = (fn: () => void) => { fn(); setPage(1); };
  const gridClass = viewSize === 'small'
    ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2'
    : viewSize === 'large'
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
      : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{t('trainingPoolGalleryTitle')}</h3>
          <p className="text-xs opacity-60">{t('completedTrainingItems')}</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1" aria-label={t('imageSize')}>
          {([['small', Grid2X2], ['medium', LayoutGrid], ['large', Rows3]] as const).map(([size, Icon]) => (
            <button key={size} type="button" onClick={() => setViewSize(size)} className={`p-2 rounded ${viewSize === size ? 'bg-blue-500 text-white' : 'opacity-60 hover:opacity-100'}`} title={t(size)}><Icon size={17} /></button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="text-xs space-y-1"><span className="block opacity-70">{t('dateFrom')}</span><PersianCalendar value={startDate} onChange={value => { setStartDate(value); setPage(1); }} variant="session" isRtl={isRtl} /></div>
          <div className="text-xs space-y-1"><span className="block opacity-70">{t('dateTo')}</span><PersianCalendar value={endDate} onChange={value => { setEndDate(value); setPage(1); }} variant="session" isRtl={isRtl} /></div>
          <button type="button" onClick={() => { setStartDate(''); setEndDate(''); setPage(1); }} disabled={!startDate && !endDate} className="rounded px-3 py-2 text-sm bg-white/5 hover:bg-white/10 disabled:opacity-40">{t('clearDates')}</button>
          <button type="button" onClick={() => setAdvanced(value => !value)} className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm bg-white/5 hover:bg-white/10"><span>{t('advancedFilters')}</span>{advanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
        </div>
        {advanced && (
          <div className="border-t border-white/10 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="block text-sm font-semibold">{t('regionFilter')}</span>
                <span className="block text-xs opacity-60">{t('regionFilterHint')}</span>
              </div>
              {regionId && <button type="button" className="text-xs text-cyan-300 hover:text-cyan-100" onClick={() => changeFilter(() => setRegionId(null))}>{t('allRegions')}</button>}
            </div>
            <button
              type="button"
              onClick={() => changeFilter(() => setRegionId(null))}
              className={`w-full flex items-center justify-between rounded-xl border-2 px-4 py-3 text-start transition-all ${
                !regionId
                  ? 'border-cyan-300 bg-cyan-400/20 text-cyan-50 shadow-[0_0_20px_rgba(34,211,238,0.22)]'
                  : 'border-white/10 bg-white/[.04] text-white/75 hover:border-cyan-400/50 hover:bg-cyan-400/10'
              }`}
            >
              <span className="flex items-center gap-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${!regionId ? 'bg-cyan-300 text-slate-900' : 'bg-white/10'}`}><Grid2X2 size={16} /></span><span><span className="block font-semibold">{t('allRegions')}</span><span className="block text-xs opacity-65">{t('allRegionsHint')}</span></span></span>
              {!regionId && <Check size={20} className="text-cyan-200" />}
            </button>
            <ScalpRegionGrid selectedId={regionId} assignedIds={new Set()} onSelect={id => changeFilter(() => setRegionId(id))} isRtl={isRtl} />
          </div>
        )}
      </div>

      {loading && <div className="text-center py-8 opacity-70">{t('loading')}</div>}
      {!loading && items.length === 0 && <div className="text-center py-12 opacity-60">{t('noCompletedTrainingPhotos')}</div>}
      <div className={`grid ${gridClass}`}>
        {items.map(item => {
          const region = item.metadata?.[SCALP_REGION_META_KEY] as ScalpRegionId | undefined;
          return <article key={item.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[.03]"><img src={item.thumbnail || item.url} alt={item.filename} className="w-full aspect-square object-cover" loading="lazy" /><div className="p-2 text-xs space-y-1"><p className="truncate" title={item.filename}>{item.filename}</p><div className="flex justify-between gap-2 opacity-70"><span>{formatDateForDisplay(item.createdAt.slice(0, 10))}</span>{region && <ScalpRegionCaption item={item} />}</div>{region && <ScalpRegionBadge item={item} />}</div></article>;
        })}
      </div>
      <GalleryPagination activePage={page} activeTotalPages={totalPages} isRtl={isRtl} loading={loading} scopedLoading={false} onPageChange={setPage} totalItems={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
