import { useEffect, useState } from 'react';
import { Check, Pencil, Trash2, X, ChevronRight, ChevronLeft, Filter, Calendar, Search, Gauge, Loader } from 'lucide-react';
import type { TrainingSample } from '../../db';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import { useT } from '../../i18n';
import { offlineDict } from './strings';
import { observationGroups, observationsInGroup } from '../../lib/diagnosisCatalog';
import { useTrainingSamplesStore } from '../../store';

interface Props {
  samples: TrainingSample[];
  onDelete: (id: string) => void;
  onToggleApproval: (id: string, approved: boolean) => void;
  onEdit: (sample: TrainingSample) => void;
  editingSampleId?: string | null;
  isRtl?: boolean;
}

export default function RecentSamplesPanel({
  samples, onDelete, onToggleApproval, onEdit, editingSampleId, isRtl = true,
}: Props) {
  const t = useT(offlineDict);

  // فیلترهای پیشرفته
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedObs, setSelectedObs] = useState<string | null>(null);

  // مدال عوارض بالینی
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState('');

  // صفحه‌بندی
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // موج ۱ (W1-1) — مرتب‌سازی یادگیری فعال: شناسهٔ نمونه → عدم‌قطعیت MC-Dropout
  const [alBusy, setAlBusy] = useState(false);
  const [alOrder, setAlOrder] = useState<Map<string, number> | null>(null);
  const [alMessage, setAlMessage] = useState('');
  const modelMetadata = useTrainingSamplesStore(s => s.modelMetadata);

  // با تغییر مجموعهٔ نمونه‌ها (تأیید/حذف/ویرایش)، رتبه‌بندی قدیمی باطل می‌شود
  // تا نمره‌های بیات روی نمونه‌های تازه دیده نشوند.
  useEffect(() => {
    setAlOrder(null);
    setAlMessage('');
  }, [samples]);

  /** فعال‌سازی مرتب‌سازی بر اساس عدم‌قطعیت مدل روی نمونه‌های در انتظار بازبینی */
  const handleActiveLearningSort = async () => {
    if (alOrder) {
      setAlOrder(null);
      setAlMessage('');
      return;
    }
    setAlBusy(true);
    setAlMessage('');
    try {
      // بارگذاری تنبل — چپ TF.js فقط هنگام استفادهٔ واقعی وارد باندل می‌شود
      const modelMod = await import('../../lib/localModel');
      const { rankActiveLearningQueue } = await import('../../lib/activeLearning');
      if (modelMetadata?.featureMeans?.length && modelMetadata?.featureStds?.length) {
        modelMod.setCachedFeatureNorm({
          means: modelMetadata.featureMeans,
          stds: modelMetadata.featureStds,
        });
        modelMod.setCachedObsPolicy({
          thresholds: modelMetadata.obsThresholds,
          suppressedLabels: modelMetadata.suppressedLabels,
        });
      }
      if (!(await modelMod.hasLocalModel())) {
        setAlMessage(t('activeLearningNoModel'));
        return;
      }
      // صف یادگیری فعال = نمونه‌هایی که هنوز تأیید متخصص نشده‌اند
      const pending = filteredSamples.filter(
        s => !(s.labelSource === 'expert' || s.approvedForTraining === true),
      );
      if (pending.length === 0) {
        setAlMessage(t('activeLearningNoPending'));
        return;
      }
      const queue = await rankActiveLearningQueue(pending);
      setAlOrder(new Map(queue.map(q => [q.sample.id, q.uncertainty])));
      setAlMessage(t('activeLearningSorted'));
    } catch {
      setAlMessage(t('activeLearningNoModel'));
    } finally {
      setAlBusy(false);
    }
  };

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

  // اعمال تمام فیلترها (منبع، تاریخ، عارضه بالینی)
  const filteredSamples = samples.filter(s => {
    // ۱. فیلتر منبع تحلیل
    if (selectedSource !== 'all') {
      if (s.labelSource !== selectedSource) return false;
    }

    // ۲. فیلتر بازه زمانی (بر اساس تاریخ شمسی یا میلادی ذخیره شده در createdAt)
    const sDate = s.createdAt.slice(0, 10); // YYYY-MM-DD
    if (dateFrom && sDate < dateFrom) return false;
    if (dateTo && sDate > dateTo) return false;

    // ۳. فیلتر عارضه بالینی
    if (selectedObs) {
      const obsList = s.label?.observations ?? [];
      if (!obsList.includes(selectedObs)) return false;
    }

    return true;
  });

  // موج ۱ (W1-1) — هنگام فعال بودن یادگیری فعال، نمونه‌ها بر اساس عدم‌قطعیت
  // مرتب می‌شوند؛ نمونه‌های بدون نمره (مثلاً قبلاً تأییدشده) به انتها می‌روند.
  const orderedSamples = alOrder
    ? [...filteredSamples].sort((a, b) => {
      const ua = alOrder.get(a.id);
      const ub = alOrder.get(b.id);
      if (ua === undefined && ub === undefined) return 0;
      if (ua === undefined) return 1;
      if (ub === undefined) return -1;
      return ub - ua;
    })
    : filteredSamples;

  // محاسبات صفحه‌بندی
  const totalPages = Math.max(1, Math.ceil(orderedSamples.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const pagedSamples = orderedSamples.slice(startIndex, startIndex + pageSize);

  // پیدا کردن برچسب عارضه بالینی انتخاب‌شده برای نمایش
  const getSelectedObsLabel = () => {
    if (!selectedObs) return '';
    for (const group of observationGroups) {
      const items = observationsInGroup(group.id);
      const found = items.find(o => o.id === selectedObs);
      if (found) return isRtl ? found.fa : found.en;
    }
    return selectedObs;
  };

  const clearAllFilters = () => {
    setSelectedSource('all');
    setDateFrom('');
    setDateTo('');
    setSelectedObs(null);
    setCurrentPage(1);
  };

  const hasActiveFilters = selectedSource !== 'all' || dateFrom || dateTo || selectedObs !== null;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-6 shadow-xl relative">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Filter size={20} className="text-blue-400" />
          <span>{isRtl ? 'نمونه‌های آموزشی اخیر در این صندوق' : 'Recent Training Samples'}</span>
        </h3>
        <div className="flex items-center gap-3">
          {/* موج ۱ (W1-1) — دکمهٔ مرتب‌سازی یادگیری فعال */}
          <button
            type="button"
            onClick={handleActiveLearningSort}
            disabled={alBusy}
            title={t('activeLearningSort')}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50 ${
              alOrder
                ? 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-300'
                : 'border-white/10 text-white/70 hover:bg-white/5'
            }`}
          >
            {alBusy ? <Loader size={14} className="animate-spin" /> : <Gauge size={14} />}
            <span>
              {alBusy
                ? t('activeLearningSorting')
                : alOrder
                  ? t('activeLearningDefaultOrder')
                  : t('activeLearningSort')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilterPanelOpen(!filterPanelOpen)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
              filterPanelOpen || hasActiveFilters
                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                : 'border-white/10 text-white/70 hover:bg-white/5'
            }`}
          >
            <Filter size={14} />
            <span>{isRtl ? 'فیلترهای پیشرفته بالینی' : 'Advanced Filters'}</span>
          </button>
          <span className="text-xs opacity-50">
            {isRtl 
              ? `نمایش ${pagedSamples.length} از ${filteredSamples.length} نمونه` 
              : `Showing ${pagedSamples.length} of ${filteredSamples.length} samples`}
          </span>
        </div>
      </div>

      {/* پنل فیلتر پیشرفته تاشو */}
      {filterPanelOpen && (
        <div className="rounded-xl bg-black/25 border border-white/5 p-4 grid grid-cols-1 md:grid-cols-3 gap-4 transition-all">
          {/* فیلتر منبع تحلیل */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium opacity-70">{isRtl ? 'منبع تحلیل:' : 'Analysis Source:'}</label>
            <select
              value={selectedSource}
              onChange={e => { setSelectedSource(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="all">{isRtl ? 'همه منابع' : 'All Sources'}</option>
              <option value="online_ai">{isRtl ? 'آنلاین (هوش مصنوعی)' : 'Online AI'}</option>
              <option value="offline_heuristic">{isRtl ? 'آفلاین (قانون‌محور)' : 'Offline Heuristic'}</option>
              <option value="expert">{isRtl ? 'تحلیل تریکولوژیست' : 'Trichologist (Expert)'}</option>
            </select>
          </div>

          {/* فیلتر بازه زمانی */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium opacity-70">{isRtl ? 'بازه زمانی (از / تا):' : 'Date Range (From / To):'}</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Calendar size={14} className="absolute top-1/2 -translate-y-1/2 start-3 opacity-40" />
                <input
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={dateFrom}
                  onChange={e => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="w-full ps-9 pe-2 py-2 rounded-xl bg-white/5 border border-white/10 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="relative">
                <Calendar size={14} className="absolute top-1/2 -translate-y-1/2 start-3 opacity-40" />
                <input
                  type="text"
                  placeholder="YYYY-MM-DD"
                  value={dateTo}
                  onChange={e => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="w-full ps-9 pe-2 py-2 rounded-xl bg-white/5 border border-white/10 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* فیلتر عوارض بالینی (باز کردن پاپ‌آپ) */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <label className="block text-xs font-medium opacity-70 mb-1">{isRtl ? 'انتخاب عارضه بالینی:' : 'Clinical Observation:'}</label>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="w-full py-2 px-4 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold hover:bg-white/10 hover:border-white/20 transition flex items-center justify-between"
            >
              <span>{selectedObs ? getSelectedObsLabel() : (isRtl ? 'انتخاب عارضه بالینی...' : 'Select Observation...')}</span>
              <span className="text-xs text-blue-400 font-bold">{isRtl ? 'تغییر' : 'Change'}</span>
            </button>
          </div>
        </div>
      )}

      {/* موج ۱ (W1-1) — پیام وضعیت مرتب‌سازی یادگیری فعال */}
      {alMessage && (
        <div className={`rounded-xl border px-3 py-2 text-xs ${
          alOrder
            ? 'bg-fuchsia-500/10 border-fuchsia-500/25 text-fuchsia-200/90'
            : alMessage === t('activeLearningNoModel')
              ? 'bg-yellow-500/10 border-yellow-500/25 text-yellow-200/90'
              : 'bg-white/5 border-white/10 text-white/70'
        }`}>
          {alMessage}
        </div>
      )}

      {/* نشانگر فیلترهای فعال */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-3 text-xs">
          <span className="opacity-60">{isRtl ? 'فیلترهای فعال:' : 'Active Filters:'}</span>
          {selectedSource !== 'all' && (
            <span className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-1.5">
              <span>{isRtl ? 'منبع: ' : 'Source: '}{getSourceLabel(selectedSource)}</span>
              <button onClick={() => { setSelectedSource('all'); setCurrentPage(1); }} className="hover:text-white"><X size={12} /></button>
            </span>
          )}
          {dateFrom && (
            <span className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-1.5">
              <span>{isRtl ? 'از تاریخ: ' : 'From: '}{dateFrom}</span>
              <button onClick={() => { setDateFrom(''); setCurrentPage(1); }} className="hover:text-white"><X size={12} /></button>
            </span>
          )}
          {dateTo && (
            <span className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-1.5">
              <span>{isRtl ? 'تا تاریخ: ' : 'To: '}{dateTo}</span>
              <button onClick={() => { setDateTo(''); setCurrentPage(1); }} className="hover:text-white"><X size={12} /></button>
            </span>
          )}
          {selectedObs && (
            <span className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-1.5">
              <span>{isRtl ? 'عارضه: ' : 'Obs: '}{getSelectedObsLabel()}</span>
              <button onClick={() => { setSelectedObs(null); setCurrentPage(1); }} className="hover:text-white"><X size={12} /></button>
            </span>
          )}
          <button
            onClick={clearAllFilters}
            className="ms-auto text-xs text-red-400 hover:underline flex items-center gap-1"
          >
            <span>{isRtl ? 'پاک کردن همه' : 'Clear All'}</span>
          </button>
        </div>
      )}

      {/* لیست نمونه‌ها */}
      {pagedSamples.length === 0 ? (
        <div className="text-center py-8 opacity-50 text-sm">
          {isRtl ? 'هیچ نمونه‌ای با این عوارض در این صندوق یافت نشد.' : 'No samples found with this observation.'}
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
                    {/* موج ۱ (W1-1) — نشان عدم‌قطعیت هنگام مرتب‌سازی یادگیری فعال */}
                    {alOrder && alOrder.get(s.id) !== undefined && (() => {
                      const u = alOrder.get(s.id)!;
                      const tone = u >= 0.12
                        ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : u >= 0.05
                          ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs border ${tone}`}
                          title={t('modelUncertaintyHint')}
                          dir="ltr"
                        >
                          {t('uncertaintyBadge')}: {u.toFixed(3)}
                        </span>
                      );
                    })()}
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

      {/* مدال پاپ‌آپ پیشرفتهٔ انتخاب تمام عوارض بالینی */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-gray-900 border border-white/10 rounded-3xl p-6 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Filter className="text-blue-400" size={20} />
                <span>{isRtl ? 'انتخاب عارضه بالینی برای فیلتر' : 'Select Clinical Observation for Filter'}</span>
              </h3>
              <button
                onClick={() => { setModalOpen(false); setModalSearch(''); }}
                className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* کادر جستجوی عوارض در مدال */}
            <div className="relative">
              <Search size={18} className="absolute top-1/2 -translate-y-1/2 start-4 opacity-40" />
              <input
                type="text"
                placeholder={isRtl ? 'جستجوی عارضه بالینی...' : 'Search clinical observation...'}
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                className="w-full ps-11 pe-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            {/* لیست دسته‌بندی‌شدهٔ تمام عوارض بالینی */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-1">
              {observationGroups.map(group => {
                const items = observationsInGroup(group.id).filter(o => {
                  if (!modalSearch) return true;
                  const query = modalSearch.toLowerCase();
                  return o.id.toLowerCase().includes(query) || o.fa.toLowerCase().includes(query) || o.en.toLowerCase().includes(query);
                });

                if (items.length === 0) return null;

                return (
                  <div key={group.id} className="space-y-2.5">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider border-s-2 border-blue-500 ps-2">
                      {isRtl ? group.fa : group.en}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.map(o => {
                        const selected = selectedObs === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                              setSelectedObs(o.id);
                              setCurrentPage(1);
                              setModalOpen(false);
                              setModalSearch('');
                            }}
                            className={`px-3 py-2 rounded-xl border text-start text-xs transition-all flex items-center justify-between ${
                              selected
                                ? 'border-blue-500 bg-blue-500/10 text-blue-300 font-semibold'
                                : 'border-white/10 bg-white/[0.01] text-white/80 hover:bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <span className="truncate">{isRtl ? o.fa : o.en}</span>
                            <span className="text-[10px] opacity-40 truncate">({o.id})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/10 pt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setSelectedObs(null); setModalOpen(false); setModalSearch(''); }}
                className="px-4 py-2 rounded-xl text-xs bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20"
              >
                {isRtl ? 'حذف فیلتر عارضه' : 'Clear Observation'}
              </button>
              <button
                type="button"
                onClick={() => { setModalOpen(false); setModalSearch(''); }}
                className="px-4 py-2 rounded-xl text-xs bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
              >
                {isRtl ? 'بستن' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
