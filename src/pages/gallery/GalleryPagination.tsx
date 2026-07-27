import { ChevronLeft, ChevronRight, Loader } from 'lucide-react';

type GalleryPaginationProps = {
  activePage: number;
  activeTotalPages: number;
  isRtl: boolean;
  loading: boolean;
  scopedLoading: boolean;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
};

export function GalleryPagination({
  activePage,
  activeTotalPages,
  isRtl,
  loading,
  scopedLoading,
  onPageChange,
  totalItems,
  pageSize,
}: GalleryPaginationProps) {
  if (activeTotalPages <= 1 && totalItems === undefined) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-6 flex-wrap">
      <span className="text-sm font-medium px-3 py-2 rounded-lg bg-white/5 border border-white/10">
        Page {activePage} of {activeTotalPages}
        {totalItems !== undefined && <span className="ms-2 text-xs opacity-60">({totalItems} images{pageSize ? ` · ${pageSize}/page` : ''})</span>}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(activePage - 1)}
        disabled={activePage <= 1 || loading || scopedLoading}
        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
        aria-label="Previous page"
      >
        {isRtl ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {Array.from({ length: activeTotalPages }, (_, i) => i + 1)
        .filter(p => p === 1 || p === activeTotalPages || Math.abs(p - activePage) <= 1)
        .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
          acc.push(p);
          return acc;
        }, [])
        .map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`ellipsis-${idx}`} className="px-2 opacity-40">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              disabled={loading || scopedLoading}
              className={`min-w-[2.5rem] px-3 py-2 rounded-lg text-sm transition ${p === activePage ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'}`}
            >
              {p}
            </button>
          )
        )}

      <button
        type="button"
        onClick={() => onPageChange(activePage + 1)}
        disabled={activePage >= activeTotalPages || loading || scopedLoading}
        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
        aria-label="Next page"
      >
        {isRtl ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {(loading || scopedLoading) && <Loader className="animate-spin ms-2" size={18} />}
    </div>
  );
}
