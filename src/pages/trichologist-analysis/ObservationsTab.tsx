import { useLang, useT } from '../../i18n';
import {
  trichoDict,
  observationGroups,
  observationGroupLabel,
  observationsInGroup,
  observationLabel,
} from './strings';
import type { ObservationsTabProps } from './types';

const readOnlyClass = 'opacity-70 cursor-not-allowed';

export default function ObservationsTab({
  currentAnalysis,
  isReadOnly,
  updateQuestionnaire,
  toggleObservation,
}: ObservationsTabProps) {
  const t = useT(trichoDict);
  const { lang } = useLang();
  const q = currentAnalysis.medicalQuestionnaire ?? {};
  const selectClass = `w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none ${isReadOnly ? readOnlyClass : ''}`;
  const fieldClass = `w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none ${isReadOnly ? readOnlyClass : ''}`;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-4">{t('selectIssues')}</h3>
        <div className="space-y-5">
          {observationGroups.map(group => (
            <div key={group.id}>
              <h4 className="text-xs font-medium opacity-50 mb-2">
                {observationGroupLabel(group.id, lang)}
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {observationsInGroup(group.id).map(opt => {
                  const isSelected = currentAnalysis.observations?.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleObservation(opt.id)}
                      disabled={isReadOnly}
                      className={`p-2.5 rounded-xl text-xs text-center transition ${isSelected ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10'} ${isReadOnly ? 'cursor-not-allowed' : ''}`}
                    >
                      {observationLabel(opt.id, lang)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-2">{t('severity')}</label>
          <select
            value={(q.severity as string) || ''}
            onChange={e => updateQuestionnaire('severity', e.target.value)}
            disabled={isReadOnly}
            className={selectClass}
          >
            <option value="">{t('select')}</option>
            <option value="mild">{t('mild')}</option>
            <option value="moderate">{t('moderate')}</option>
            <option value="severe">{t('severe')}</option>
          </select>
        </div>
        <div>
          <label className="block mb-2">{t('hairLossPattern')}</label>
          <select
            value={(q.pattern as string) || ''}
            onChange={e => updateQuestionnaire('pattern', e.target.value)}
            disabled={isReadOnly}
            className={selectClass}
          >
            <option value="">{t('select')}</option>
            <option value="diffuse">{t('diffuse')}</option>
            <option value="frontal">{t('frontal')}</option>
            <option value="vertex">{t('vertex')}</option>
            <option value="patchy">{t('patchy')}</option>
            <option value="total">{t('total')}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block mb-2">{t('observationNotes')}</label>
        <textarea
          value={(q.observationNotes as string) || ''}
          onChange={e => updateQuestionnaire('observationNotes', e.target.value)}
          rows={4}
          readOnly={isReadOnly}
          className={fieldClass}
          placeholder={t('observationNotesPlaceholder')}
        />
      </div>
    </div>
  );
}
