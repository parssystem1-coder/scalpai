import { useLang, useT } from '../../i18n';
import {
  catalogOptionsFor,
  normalizeQuestionnaireValues,
  normalizeStructuredList,
  toggleStructuredOption,
  type QuestionnaireFieldKey,
  type StructuredListFieldKey,
  type StructuredListValue,
} from '../../lib/medicalQuestionnaireSchema';
import { trichoDict } from './strings';
import type { AnalysisFormProps } from './types';

const readOnlyClass = 'opacity-70 cursor-not-allowed';

function ChangeBadge({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <span className="ms-2 inline-flex items-center rounded-md bg-amber-500/15 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 text-[10px] font-medium">
      {label}
    </span>
  );
}

function StructuredMultiSelect({
  field,
  value,
  isReadOnly,
  isRtl,
  label,
  otherPlaceholder,
  selectHint,
  otherLabel,
  changed,
  changedLabel,
  onChange,
}: {
  field: StructuredListFieldKey;
  value: StructuredListValue;
  isReadOnly: boolean;
  isRtl: boolean;
  label: string;
  otherPlaceholder: string;
  selectHint: string;
  otherLabel: string;
  changed: boolean;
  changedLabel: string;
  onChange: (next: StructuredListValue) => void;
}) {
  const options = catalogOptionsFor(field);
  const showOther = value.selected.includes('other');

  return (
    <div>
      <label className="block mb-2 font-medium">
        {label}
        <ChangeBadge show={changed} label={changedLabel} />
      </label>
      <p className="text-xs opacity-45 mb-2">{selectHint}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(option => {
          const active = value.selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              disabled={isReadOnly}
              onClick={() => onChange(toggleStructuredOption(value, option.id))}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                active
                  ? 'bg-blue-500/25 border-blue-400 text-blue-100'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              } ${isReadOnly ? readOnlyClass : ''}`}
            >
              {isRtl ? option.fa : option.en}
            </button>
          );
        })}
      </div>
      {showOther && (
        <textarea
          value={value.other}
          onChange={e => onChange({ ...value, other: e.target.value })}
          rows={2}
          readOnly={isReadOnly}
          className={`mt-3 w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none ${isReadOnly ? readOnlyClass : ''}`}
          placeholder={`${otherLabel}: ${otherPlaceholder}`}
        />
      )}
    </div>
  );
}

export default function QuestionnaireTab({
  currentAnalysis,
  isReadOnly,
  updateQuestionnaire,
  changedFields = [],
  showDemographics = false,
}: AnalysisFormProps) {
  const t = useT(trichoDict);
  const { isRtl } = useLang();
  const q = normalizeQuestionnaireValues(currentAnalysis.medicalQuestionnaire ?? {});
  const changed = new Set(changedFields);
  const fieldClass = `w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none ${isReadOnly ? readOnlyClass : ''}`;
  const selectClass = `w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none ${isReadOnly ? readOnlyClass : ''}`;
  const changedLabel = t('changedFromPrevious');

  const mark = (key: QuestionnaireFieldKey) => changed.has(key);

  const setList = (key: StructuredListFieldKey, next: StructuredListValue) => {
    updateQuestionnaire(key, next);
  };

  return (
    <div className="space-y-6">
      {showDemographics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-2 font-medium">
              {t('age')}
              <ChangeBadge show={mark('age')} label={changedLabel} />
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={q.age || ''}
              onChange={e => updateQuestionnaire('age', e.target.value)}
              readOnly={isReadOnly}
              className={selectClass}
              placeholder={t('age')}
            />
          </div>
          <div>
            <label className="block mb-2 font-medium">
              {t('gender')}
              <ChangeBadge show={mark('gender')} label={changedLabel} />
            </label>
            <select
              value={q.gender || ''}
              onChange={e => updateQuestionnaire('gender', e.target.value)}
              disabled={isReadOnly}
              className={selectClass}
            >
              <option value="">{t('select')}</option>
              <option value="male">{t('male')}</option>
              <option value="female">{t('female')}</option>
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StructuredMultiSelect
          field="history"
          value={normalizeStructuredList(q.history)}
          isReadOnly={isReadOnly}
          isRtl={isRtl}
          label={t('medicalHistory')}
          otherPlaceholder={t('medicalHistoryPlaceholder')}
          selectHint={t('selectOptions')}
          otherLabel={t('otherDetails')}
          changed={mark('history')}
          changedLabel={changedLabel}
          onChange={next => setList('history', next)}
        />
        <StructuredMultiSelect
          field="medications"
          value={normalizeStructuredList(q.medications)}
          isReadOnly={isReadOnly}
          isRtl={isRtl}
          label={t('medications')}
          otherPlaceholder={t('medicationsPlaceholder')}
          selectHint={t('selectOptions')}
          otherLabel={t('otherDetails')}
          changed={mark('medications')}
          changedLabel={changedLabel}
          onChange={next => setList('medications', next)}
        />
        <div>
          <label className="block mb-2 font-medium">
            {t('allergies')}
            <ChangeBadge show={mark('allergies')} label={changedLabel} />
          </label>
          <textarea
            value={q.allergies || ''}
            onChange={e => updateQuestionnaire('allergies', e.target.value)}
            rows={3}
            readOnly={isReadOnly}
            className={fieldClass}
            placeholder={t('allergiesPlaceholder')}
          />
        </div>
        <StructuredMultiSelect
          field="previousTreatments"
          value={normalizeStructuredList(q.previousTreatments)}
          isReadOnly={isReadOnly}
          isRtl={isRtl}
          label={t('previousTreatments')}
          otherPlaceholder={t('previousTreatmentsPlaceholder')}
          selectHint={t('selectOptions')}
          otherLabel={t('otherDetails')}
          changed={mark('previousTreatments')}
          changedLabel={changedLabel}
          onChange={next => setList('previousTreatments', next)}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block mb-2 text-sm">
            {t('familyHistory')}
            <ChangeBadge show={mark('familyHistory')} label={changedLabel} />
          </label>
          <select
            value={q.familyHistory || ''}
            onChange={e => updateQuestionnaire('familyHistory', e.target.value)}
            disabled={isReadOnly}
            className={selectClass}
          >
            <option value="">{t('select')}</option>
            <option value="none">{t('none')}</option>
            <option value="father">{t('father')}</option>
            <option value="mother">{t('mother')}</option>
            <option value="both">{t('both')}</option>
          </select>
        </div>
        <div>
          <label className="block mb-2 text-sm">
            {t('stressLevel')}
            <ChangeBadge show={mark('stressLevel')} label={changedLabel} />
          </label>
          <select
            value={q.stressLevel || ''}
            onChange={e => updateQuestionnaire('stressLevel', e.target.value)}
            disabled={isReadOnly}
            className={selectClass}
          >
            <option value="">{t('select')}</option>
            <option value="low">{t('low')}</option>
            <option value="medium">{t('medium')}</option>
            <option value="high">{t('high')}</option>
          </select>
        </div>
        <div>
          <label className="block mb-2 text-sm">
            {t('sleepQuality')}
            <ChangeBadge show={mark('sleepQuality')} label={changedLabel} />
          </label>
          <select
            value={q.sleepQuality || ''}
            onChange={e => updateQuestionnaire('sleepQuality', e.target.value)}
            disabled={isReadOnly}
            className={selectClass}
          >
            <option value="">{t('select')}</option>
            <option value="good">{t('good')}</option>
            <option value="moderate">{t('moderate')}</option>
            <option value="poor">{t('poor')}</option>
          </select>
        </div>
        <div>
          <label className="block mb-2 text-sm">
            {t('dietType')}
            <ChangeBadge show={mark('dietType')} label={changedLabel} />
          </label>
          <select
            value={q.dietType || ''}
            onChange={e => updateQuestionnaire('dietType', e.target.value)}
            disabled={isReadOnly}
            className={selectClass}
          >
            <option value="">{t('select')}</option>
            <option value="balanced">{t('balanced')}</option>
            <option value="vegetarian">{t('vegetarian')}</option>
            <option value="lowProtein">{t('lowProtein')}</option>
            <option value="fastFood">{t('fastFood')}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block mb-2 font-medium">
          {t('lifestyle')}
          <ChangeBadge show={mark('lifestyle')} label={changedLabel} />
        </label>
        <textarea
          value={q.lifestyle || ''}
          onChange={e => updateQuestionnaire('lifestyle', e.target.value)}
          rows={3}
          readOnly={isReadOnly}
          className={fieldClass}
          placeholder={t('lifestylePlaceholder')}
        />
      </div>
    </div>
  );
}
