import { useState } from 'react';
import { Check, Pencil, Trash2, X, ChevronRight, ChevronLeft, Filter } from 'lucide-react';
import type { TrainingSample } from '../../db';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import { useT } from '../../i18n';
import { offlineDict } from './strings';

interface Props {
  samples: TrainingSample[];
  onDelete: (id: string) => void;
  onToggleApproval: (id: string, approved: boolean) => void;
  onEdit: (sample: TrainingSample) => void;
  editingSampleId?: string | null;
  isRtl?: boolean;
}

// لیست عوارض بالینی معروف برای فیلتر
const FILTER_OBSERVATIONS = [
  { id: 'dandruff', fa: 'شوره', en: 'Dandruff', color: 'border-white/10 text-white hover:bg-white/5' },
  { id: 'redness', fa: 'قرمزی', en: 'Redness', color: 'border-red-500/30 text-red-300 hover:bg-red-500/5' },
  { id: 'oily', fa: 'چربی سر', en: 'Oily Scalp', color: 'border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/5' },
  { id: 'hairLoss', fa: 'ریزش مو', en: 'Hair Loss', color: 'border-purple-500/30 text-purple-300 hover:bg-purple-500/5' },
  { id: 'alopecia', fa: 'آلوپسی', en: 'Alopecia', color: 'border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/5' },
  { id: 'thinning', fa: 'نازک شدن مو', en: 'Thinning', color: 'border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/5' },
];

export default function RecentSamplesPanel({
  samples, onDelete, onToggleApproval, onEdit, editingSampleId, isRtl = true,
}: Props) {
  const t = useT(offlineDict);

  const [selectedObs, setSelectedObs] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  if (samples.length === 0) return null;

  const getSourceLabel = (source: string) => {
    if (source === 'expert') {
      return isRtl ? 'تحلیل تریکولوژیست' : 'Trichologist';
    }
    if (source === 'online_ai') {
      return isRtl ? 'آنلاین' : 'Online';
    }
    return isRtl ? 'آفلاین' : 'Offline';
  };

  // اعمال فیلتر بر اساس عارضه بالینی انتخابی
  const filteredSamples = samples.filter(s => {
    if (!selectedObs) return true;
    const obsList = s.label?.observations ?? [];
    return obsList.includes(selectedObs);
  });

  // محاسبات صفحه‌بندی
  const totalPages = Math.max(1, Math.ceil(filteredSamples.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const pagedSamples = filteredSamples.slice(startIndex, startIndex + pageSize);

  const handleSelectObs = (obsId: string | null) => {
    setSelectedObs(obsId);
    setCurrentPage(1); // بازگشت به صفحه اول در زمان تغییر فیلتر
  };

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-6 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Filter size={20} className="text-blue-400" />
          <span>{isRtl ? 'نمونه‌های آموزشی اخیر در این صندوق' : 'Recent Training Samples'}</span>
        </h3>
        <span className="text-xs opacity-50">
          {isRtl 
            ? `نمایش ${pagedSamples.length} از ${filteredSamples.length} نمونه` 
            : `Showing ${pagedSamples.length} of ${filteredSamples.length} samples`}
        </span>
      </div>

      {/* نوار فیلتر عوارض بالینی */}
      <div className="space-y-2">
        <p className="text-xs font-medium opacity-65">{isRtl ? 'فیلتر بر اساس عارضه بالینی:' : 'Filter by Clinical Observation:'}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleSelectObs(null)}
            className={`px-3 py-1 rounded-full text-xs border transition-all ${
              selectedObs === null
                ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                : 'border-white/10 text-white/70 hover:bg-white/5'
            }`}
          >
            {isRtl ? 'همه عوارض' : 'All'}
          </button>
          {FILTER_OBSERVATIONS.map(obs => {
            const selected = selectedObs === obs.id;
            return (
              <button
                key={obs.id}
                type="button"
                onClick={() => handleSelectObs(obs.id)}
                className={`px-3 py-1 rounded-full text-xs border transition-all ${
                  selected
                    ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-semibold'
                    : obs.color
                }`}
              >
                {isRtl ? obs.fa : obs.en}
              </button>
            );
          })}
        </div>
      </div>

      {/* لیست نمونه‌ها */}
      {pagedSamples.length === 0 ? (
        <div className="text-center py-8 opacity-50 text-sm">
          {isRtl ? 'هیچ نمونه‌ای با این عارضه در این صندوق یافت نشد.' : 'No samples found with this observation.'}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {pagedSamples.map(s => {
              const isAi = s.labelSource === 'online_ai';
              const approved = s.labelSource === 'expert' || s.approvedForTraining === true;
              const isEditing = editingSampleId === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg ${
                    isEditing ? 'bg-cyan-500/15 border border-cyan-500/30 animate-pulse' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs shrink-0 ${
                        s.labelSource === 'expert'
                          ? 'bg-purple-500/20 text-purple-300'
                          : isAi
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-white/10 text-white/60'
                      }`}
                    >
                      {getSourceLabel(s.labelSource)}
                    </span>
                    {isAi && (
                      <span className={`text-xs ${approved ? 'text-emerald-400' : 'text-yellow-400'}`}>
                        {approved ? t('approved') : t('pendingAi')}
                      </span>
                    )}
                    <span className="opacity-70 text-xs">
                      {formatDateForDisplay(s.createdAt.split('T')[0])}
                    </span>
                    {s.usedInTraining && <span className="text-xs text-blue-400">{t('used')}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onEdit(s)}
                      className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300"
                      title={t('editSample')}
                    >
                      <Pencil size={12} />
                      {t('editSample')}
                    </button>
                    {isAi && (
                      <button
                        onClick={() => onToggleApproval(s.id, !approved)}
                        className={`px-2 py-1 rounded-lg text-xs flex items-center gap-1 ${
                          approved
                            ? 'bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-300'
                            : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300'
                        }`}
                        title={approved ? t('revokeApproval') : t('approveForTraining')}
                      >
                        {approved ? <X size={12} /> : <Check size={12} />}
                        {approved ? t('revokeApproval') : t('approveForTraining')}
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(s.id)}
                      className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* صفحه‌بندی (Pagination) */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-white/5">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={activePage === 1}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>
              <span className="text-xs opacity-60">
                {isRtl ? `صفحه ${activePage} از ${totalPages}` : `Page ${activePage} of ${totalPages}`}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={activePage === totalPages}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                {isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
