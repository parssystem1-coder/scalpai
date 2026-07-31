import type { Analysis, Client } from '../../db';
import { formatDateForDisplay } from '../../lib/jalaliDate';
import { groupAnalysesIntoVisits } from '../../lib/sessionVisit';
import { usePick, useT } from '../../i18n';
import { offlineDict } from './strings';

interface Props {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  analysesGroupedByClient: Record<string, Analysis[]>;
  clients: Client[];
  onView: (analysis: Analysis) => void;
}

export default function AllAnalysesTab({
  searchQuery, onSearchChange, analysesGroupedByClient, clients, onView,
}: Props) {
  const t = useT(offlineDict);
  const pick = usePick();

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder={t('search')}
        value={searchQuery}
        onChange={e => onSearchChange(e.target.value)}
        className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10"
      />
      {Object.entries(analysesGroupedByClient).map(([clientId, clientAnalyses]) => {
        const client = clients.find(c => c.id === clientId);
        if (!client) return null;
        const visits = groupAnalysesIntoVisits(clientAnalyses, 'offline');
        return (
          <div key={clientId} className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <p className="font-semibold mb-3">
              {client.firstName} {client.lastName}
              <span className="text-sm font-normal opacity-50 ms-2">
                {visits.length} {pick('جلسه', 'visits')}
              </span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {visits.map(visit => {
                const latest = visit.analyses[visit.analyses.length - 1];
                return (
                  <div
                    key={visit.key}
                    onClick={() => onView(latest)}
                    className="p-3 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer"
                  >
                    <p className="text-sm">{formatDateForDisplay(visit.createdAt.split('T')[0])}</p>
                    <p className="text-xs opacity-60 mt-1">
                      {pick(`${visit.analyses.length} عکس`, `${visit.analyses.length} photos`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
