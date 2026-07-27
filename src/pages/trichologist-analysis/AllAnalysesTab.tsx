import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import type { Analysis, Client } from '../../db';
import { formatDateForDisplay } from '../../components/PersianCalendar';
import { useLang, useT } from '../../i18n';
import { trichoDict, observationLabel } from './strings';

interface Props {
  analyses: Analysis[];
  clients: Client[];
  onView: (analysis: Analysis) => void;
}

export default function AllAnalysesTab({ analyses, clients, onView }: Props) {
  const t = useT(trichoDict);
  const { lang } = useLang();
  const [searchQuery, setSearchQuery] = useState('');

  const grouped = useMemo(() => {
    const filtered = analyses.filter(a => {
      const client = clients.find(c => c.id === a.clientId);
      if (!client) return false;
      return `${client.firstName} ${client.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());
    });
    return filtered.reduce((acc, analysis) => {
      if (!acc[analysis.clientId]) acc[analysis.clientId] = [];
      acc[analysis.clientId].push(analysis);
      return acc;
    }, {} as Record<string, Analysis[]>);
  }, [analyses, clients, searchQuery]);

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-50" size={20} />
        <input
          type="text"
          placeholder={t('searchClient')}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full ps-12 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-16 opacity-50">
          <Users size={64} className="mx-auto mb-4 opacity-30" />
          <p>{t('noAnalyses')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([clientId, clientAnalyses]) => {
            const client = clients.find(c => c.id === clientId);
            if (!client) return null;

            const sorted = [...clientAnalyses].sort(
              (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            return (
              <div key={clientId} className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                    <span className="text-white font-bold text-lg">{client.firstName?.[0] || '?'}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-lg">
                      {client.firstName} {client.lastName}
                    </p>
                    <p className="text-sm opacity-50">
                      {client.phone} - {clientAnalyses.length} {t('analysesCount')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {sorted.map(analysis => {
                    const observationLabels = (analysis.observations || [])
                      .slice(0, 2)
                      .map(o => observationLabel(o, lang))
                      .filter(Boolean);

                    return (
                      <div
                        key={analysis.id}
                        onClick={() => onView(analysis)}
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition border border-white/10"
                      >
                        <p className="font-medium text-sm">
                          {formatDateForDisplay(analysis.createdAt.split('T')[0])}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {observationLabels.map((label, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-xs">
                              {label}
                            </span>
                          ))}
                          {(analysis.observations || []).length > 2 && (
                            <span className="px-2 py-0.5 rounded bg-white/10 text-xs">
                              +{(analysis.observations || []).length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
