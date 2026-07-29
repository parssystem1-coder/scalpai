import { Check, Pencil, Trash2, X } from 'lucide-react';
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

export default function RecentSamplesPanel({
  samples, onDelete, onToggleApproval, onEdit, editingSampleId, isRtl = true,
}: Props) {
  const t = useT(offlineDict);

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

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <h3 className="font-semibold mb-4">{isRtl ? 'نمونه‌های آموزشی اخیر در این صندوق' : 'Recent Training Samples'}</h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {samples.slice(0, 40).map(s => {
          const isAi = s.labelSource === 'online_ai';
          const approved = s.labelSource === 'expert' || s.approvedForTraining === true;
          const isEditing = editingSampleId === s.id;
          return (
            <div
              key={s.id}
              className={`flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg ${
                isEditing ? 'bg-cyan-500/15 border border-cyan-500/30' : 'bg-white/5'
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
    </div>
  );
}
