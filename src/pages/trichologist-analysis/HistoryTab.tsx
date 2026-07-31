import { Calendar, ClipboardList, User } from 'lucide-react';
import type { Analysis, Client } from '../../db';
import { formatDateForDisplay } from '../../lib/jalaliDate';
import { useLang, useT } from '../../i18n';
import { trichoDict, observationLabel } from './strings';

interface Props {
  selectedClient: string;
  client: Client | undefined;
  history: Analysis[];
  onView: (analysis: Analysis) => void;
}

export default function HistoryTab({ selectedClient, client, history, onView }: Props) {
  const t = useT(trichoDict);
  const { lang } = useLang();

  if (!selectedClient) {
    return (
      <div className="text-center py-16 opacity-50">
        <User size={64} className="mx-auto mb-4 opacity-30" />
        <p>{t('selectClientFirst')}</p>
        <p className="text-sm mt-2">{t('selectClientHint')}</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-16 opacity-50">
        <ClipboardList size={64} className="mx-auto mb-4 opacity-30" />
        <p>{t('noHistory')}</p>
      </div>
    );
  }

  const sorted = [...history].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
        <p className="font-semibold">
          {t('historyFor')}: {client?.firstName} {client?.lastName}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map(analysis => {
          const observationLabels = (analysis.observations || [])
            .slice(0, 3)
            .map(o => observationLabel(o, lang))
            .filter(Boolean);

          return (
            <div
              key={analysis.id}
              onClick={() => onView(analysis)}
              className="rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 p-4 hover:bg-white/10 cursor-pointer transition"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                  <Calendar size={18} className="text-white" />
                </div>
                <div>
                  <p className="font-medium">{formatDateForDisplay(analysis.createdAt.split('T')[0])}</p>
                  <p className="text-xs opacity-50">{new Date(analysis.createdAt).toLocaleTimeString('fa-IR')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {observationLabels.map((label, i) => (
                  <span key={i} className="px-2 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs">
                    {label}
                  </span>
                ))}
                {(analysis.observations || []).length > 3 && (
                  <span className="px-2 py-1 rounded-lg bg-white/10 text-xs">
                    +{(analysis.observations || []).length - 3}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
