import { useT } from '../../i18n';
import { trichoDict } from './strings';
import type { RecommendationsTabProps } from './types';

const readOnlyClass = 'opacity-70 cursor-not-allowed';

export default function RecommendationsTab({ recommendations, isReadOnly, onChange }: RecommendationsTabProps) {
  const t = useT(trichoDict);

  return (
    <div className="space-y-4">
      {!isReadOnly && (
        <div className="flex items-center gap-2 p-2 bg-white/5 rounded-xl">
          <button type="button" className="p-2 rounded hover:bg-white/10 font-bold">B</button>
          <button type="button" className="p-2 rounded hover:bg-white/10 italic">I</button>
          <button type="button" className="p-2 rounded hover:bg-white/10 underline">U</button>
          <div className="w-px h-6 bg-white/20" />
          <button type="button" className="p-2 rounded hover:bg-white/10 text-sm">H1</button>
          <button type="button" className="p-2 rounded hover:bg-white/10 text-sm">H2</button>
          <div className="w-px h-6 bg-white/20" />
          <button type="button" className="p-2 rounded hover:bg-white/10">&#8226;</button>
          <button type="button" className="p-2 rounded hover:bg-white/10">1.</button>
        </div>
      )}
      <textarea
        value={recommendations}
        onChange={e => onChange(e.target.value)}
        rows={16}
        readOnly={isReadOnly}
        className={`w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none font-mono ${isReadOnly ? readOnlyClass : ''}`}
        placeholder={t('recommendationsPlaceholder')}
      />
    </div>
  );
}
