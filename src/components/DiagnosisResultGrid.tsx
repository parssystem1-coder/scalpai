import {
  observationGroups,
  observationGroupLabel,
  observationsInGroup,
  observationLabel,
} from '../lib/diagnosisCatalog';
import { useLang } from '../i18n';

interface Props {
  selectedIds: string[];
  title: string;
  emptyHint: string;
  /** رنگ حالت انتخاب‌شده — آبی برای AI، سبز برای آفلاین */
  accent?: 'blue' | 'emerald';
}

/**
 * نمایش فقط‌خواندنی همه گزینه‌های تشخیص کلینیکی به‌صورت گروه‌بندی‌شده؛
 * موارد تشخیص‌داده‌شده توسط تحلیل برجسته می‌شوند.
 */
export default function DiagnosisResultGrid({
  selectedIds,
  title,
  emptyHint,
  accent = 'emerald',
}: Props) {
  const { lang } = useLang();
  const selected = new Set(selectedIds);
  const activeCls = accent === 'blue'
    ? 'bg-blue-500 text-white ring-2 ring-blue-300/40'
    : 'bg-emerald-500 text-white ring-2 ring-emerald-300/40';

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-xs opacity-50 mb-4">{emptyHint}</p>
      <div className="space-y-5">
        {observationGroups.map(group => (
          <div key={group.id}>
            <h4 className="text-xs font-medium opacity-50 mb-2">
              {observationGroupLabel(group.id, lang)}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {observationsInGroup(group.id).map(opt => {
                const isSelected = selected.has(opt.id);
                return (
                  <div
                    key={opt.id}
                    className={`p-2.5 rounded-xl text-xs text-center transition ${
                      isSelected ? activeCls : 'bg-white/5 opacity-45'
                    }`}
                  >
                    {observationLabel(opt.id, lang)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
