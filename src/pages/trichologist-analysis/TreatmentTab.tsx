import { Calendar, ClipboardList, DollarSign, Plus, Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { trichoDict } from './strings';
import type { TreatmentTabProps } from './types';

const readOnlyClass = 'opacity-70 cursor-not-allowed';

export default function TreatmentTab({
  treatmentSteps,
  isReadOnly,
  addTreatmentStep,
  updateTreatmentStep,
  removeTreatmentStep,
}: TreatmentTabProps) {
  const t = useT(trichoDict);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t('treatmentSteps')}</h3>
        {!isReadOnly && (
          <button
            type="button"
            onClick={addTreatmentStep}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 transition"
          >
            <Plus size={18} />
            <span>{t('addStep')}</span>
          </button>
        )}
      </div>

      {treatmentSteps.length === 0 ? (
        <div className="text-center py-12 opacity-50">
          <ClipboardList size={48} className="mx-auto mb-4 opacity-30" />
          <p>{t('noSteps')}</p>
          {!isReadOnly && <p className="text-sm mt-1">{t('addStepHint')}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          {treatmentSteps.map((step, idx) => (
            <div key={step.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={step.title}
                    onChange={e => updateTreatmentStep(step.id, 'title', e.target.value)}
                    placeholder={t('stepTitle')}
                    readOnly={isReadOnly}
                    className={`px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none font-semibold ${isReadOnly ? readOnlyClass : ''}`}
                  />
                </div>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => removeTreatmentStep(step.id)}
                    className="p-2 rounded-lg hover:bg-red-500/20 text-red-400"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm opacity-70">{t('description')}</label>
                  <textarea
                    value={step.description}
                    onChange={e => updateTreatmentStep(step.id, 'description', e.target.value)}
                    rows={2}
                    readOnly={isReadOnly}
                    className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none ${isReadOnly ? readOnlyClass : ''}`}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm opacity-70">{t('products')}</label>
                  <textarea
                    value={step.products}
                    onChange={e => updateTreatmentStep(step.id, 'products', e.target.value)}
                    rows={2}
                    readOnly={isReadOnly}
                    className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none resize-none ${isReadOnly ? readOnlyClass : ''}`}
                  />
                </div>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block mb-1 text-sm opacity-70 flex items-center gap-1">
                      <Calendar size={14} /> {t('duration')}
                    </label>
                    <input
                      type="text"
                      value={step.duration}
                      onChange={e => updateTreatmentStep(step.id, 'duration', e.target.value)}
                      placeholder={t('durationPlaceholder')}
                      readOnly={isReadOnly}
                      className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none ${isReadOnly ? readOnlyClass : ''}`}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block mb-1 text-sm opacity-70 flex items-center gap-1">
                      <DollarSign size={14} /> {t('cost')}
                    </label>
                    <input
                      type="text"
                      value={step.cost}
                      onChange={e => updateTreatmentStep(step.id, 'cost', e.target.value)}
                      placeholder={t('costPlaceholder')}
                      readOnly={isReadOnly}
                      className={`w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none ${isReadOnly ? readOnlyClass : ''}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
