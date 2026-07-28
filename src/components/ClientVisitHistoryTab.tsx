/**
 * تاریخچهٔ مراجعات یک مشتری برای تحلیل آنلاین یا آفلاین
 * (قبل از آرشیو همه‌مشتریان)
 */
import { useMemo } from 'react';
import { Calendar, ClipboardList, User } from 'lucide-react';
import type { Analysis, Client } from '../db';
import { formatDateForDisplay } from './PersianCalendar';
import {
  getAnalysisClinicalResult,
  groupAnalysesIntoVisits,
  type ResultSource,
} from '../lib/sessionVisit';
import { usePick } from '../i18n';

interface Props {
  selectedClientId: string;
  client: Client | undefined;
  analyses: Analysis[];
  type: 'ai' | 'offline';
  accent?: 'purple' | 'emerald';
  onView: (analysis: Analysis) => void;
  labels: {
    selectClientFirst: string;
    selectClientHint: string;
    noHistory: string;
    historyFor: string;
    densityShort: string;
  };
}

export default function ClientVisitHistoryTab({
  selectedClientId,
  client,
  analyses,
  type,
  accent = 'purple',
  onView,
  labels,
}: Props) {
  const pick = usePick();
  const source: ResultSource = type === 'ai' ? 'ai' : 'offline';
  const accentRing = accent === 'emerald'
    ? 'bg-emerald-500/10 border-emerald-500/30'
    : 'bg-purple-500/10 border-purple-500/30';
  const accentBadge = accent === 'emerald'
    ? 'bg-emerald-500/20 text-emerald-300'
    : 'bg-blue-500/20 text-blue-400';
  const accentLoss = accent === 'emerald'
    ? 'bg-teal-500/20 text-teal-300'
    : 'bg-purple-500/20 text-purple-400';
  const avatarGrad = accent === 'emerald'
    ? 'from-emerald-500 to-teal-500'
    : 'from-purple-500 to-pink-500';

  const visits = useMemo(
    () => groupAnalysesIntoVisits(analyses, type)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [analyses, type],
  );

  if (!selectedClientId) {
    return (
      <div className="text-center py-16 opacity-50">
        <User size={64} className="mx-auto mb-4 opacity-30" />
        <p>{labels.selectClientFirst}</p>
        <p className="text-sm mt-2">{labels.selectClientHint}</p>
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="text-center py-16 opacity-50">
        <ClipboardList size={64} className="mx-auto mb-4 opacity-30" />
        <p>{labels.noHistory}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`p-4 rounded-xl border ${accentRing}`}>
        <p className="font-semibold">
          {labels.historyFor}: {client?.firstName} {client?.lastName}
        </p>
        <p className="text-sm opacity-60 mt-1">
          {visits.length} {pick('جلسه', 'visits')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visits.map(visit => {
          const latest = visit.analyses[visit.analyses.length - 1];
          const clinical = getAnalysisClinicalResult(latest, source);
          const photoCount = visit.analyses.length;
          return (
            <button
              key={visit.key}
              type="button"
              onClick={() => onView(latest)}
              className="text-start rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 hover:bg-white/10 transition"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${avatarGrad} flex items-center justify-center`}>
                  <Calendar size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-medium">
                    {formatDateForDisplay(visit.createdAt.split('T')[0])}
                  </p>
                  <p className="text-xs opacity-50">
                    {new Date(visit.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>
              <p className="text-xs opacity-60 mb-2">
                {pick(`${photoCount} عکس در این جلسه`, `${photoCount} photos in visit`)}
              </p>
              {clinical && (
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs ${accentBadge}`}>
                    {labels.densityShort} {clinical.hairDensity.score}%
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${accentLoss}`}>
                    {clinical.hairLoss.level}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
