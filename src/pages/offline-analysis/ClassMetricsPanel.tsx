/**
 * ClassMetricsPanel — فاز ۲٫۱ و ۲٫۲
 *
 * نمایش صادقانهٔ کیفیت مدل به‌ازای هر برچسب، به‌جای یک عدد F1 میکروی
 * گمراه‌کننده. هدف: کاربر ببیند مدل روی کدام تشخیص‌ها واقعاً چیزی یاد گرفته
 * و روی کدام‌ها اصلاً داده نداشته است.
 */
import { useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import type { LocalModelMetadata } from '../../db';
import { observationLabel } from '../../lib/diagnosisCatalog';
import { useLang, usePick } from '../../i18n';
import CalibrationCard from './CalibrationCard';

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export default function ClassMetricsPanel({
  modelMetadata,
}: {
  modelMetadata: LocalModelMetadata | null;
}) {
  const pick = usePick();
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  const perClass = modelMetadata?.holdoutPerClass?.perClass ?? [];
  const support = modelMetadata?.labelSupport ?? [];
  const suppressed = modelMetadata?.suppressedLabels ?? [];

  // موج ۴: حتی اگر جدول per-class خالی باشد، کارت کالیبراسیون معنا دارد
  if (!perClass.length && !support.length && !modelMetadata?.calibration) return null;

  // فقط کلاس‌هایی که در holdout نمونهٔ مثبت داشتند قابل ارزیابی‌اند
  const evaluated = perClass
    .filter(c => c.support > 0)
    .sort((a, b) => b.f1 - a.f1);

  const supportMap = new Map(support.map(s => [s.id, s]));
  const label = (id: string) => observationLabel(id, lang) ?? id;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 font-semibold">
          <BarChart3 size={18} className="text-sky-400" />
          {pick('کیفیت مدل به تفکیک تشخیص', 'Per-diagnosis model quality')}
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="opacity-60">{pick('F1 ماکرو', 'Macro F1')}</div>
          <div className="text-lg font-semibold">
            {typeof modelMetadata?.holdoutMacroF1 === 'number'
              ? modelMetadata.holdoutMacroF1.toFixed(3)
              : '—'}
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="opacity-60">{pick('F1 میکرو', 'Micro F1')}</div>
          <div className="text-lg font-semibold">
            {typeof modelMetadata?.holdoutObsF1 === 'number'
              ? modelMetadata.holdoutObsF1.toFixed(3)
              : '—'}
          </div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="opacity-60">{pick('کلاس ارزیابی‌شده', 'Evaluated classes')}</div>
          <div className="text-lg font-semibold">{evaluated.length}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="opacity-60">{pick('برچسب سرکوب‌شده', 'Suppressed labels')}</div>
          <div className="text-lg font-semibold">{suppressed.length}</div>
        </div>
      </div>

      {modelMetadata?.repeatedHoldout && modelMetadata.repeatedHoldout.mae.runs > 1 && (
        <p className="mt-3 text-xs opacity-75">
          {pick(
            `پایداری روی ${modelMetadata.repeatedHoldout.mae.runs} اجرای مستقل — MAE: ${modelMetadata.repeatedHoldout.mae.mean.toFixed(2)} ± ${modelMetadata.repeatedHoldout.mae.std.toFixed(2)}، F1 ماکرو: ${modelMetadata.repeatedHoldout.macroF1.mean.toFixed(3)} ± ${modelMetadata.repeatedHoldout.macroF1.std.toFixed(3)}`,
            `Stability over ${modelMetadata.repeatedHoldout.mae.runs} independent runs — MAE: ${modelMetadata.repeatedHoldout.mae.mean.toFixed(2)} ± ${modelMetadata.repeatedHoldout.mae.std.toFixed(2)}, macro F1: ${modelMetadata.repeatedHoldout.macroF1.mean.toFixed(3)} ± ${modelMetadata.repeatedHoldout.macroF1.std.toFixed(3)}`,
          )}
        </p>
      )}

      <p className="mt-2 text-xs opacity-65">
        {pick(
          'F1 ماکرو میانگین کیفیت روی تک‌تک تشخیص‌هاست و از F1 میکرو سخت‌گیرانه‌تر است؛ میکرو تحت سلطهٔ چند تشخیص پرتکرار قرار می‌گیرد و کیفیت واقعی روی تشخیص‌های نادر را پنهان می‌کند.',
          'Macro F1 averages quality across individual diagnoses and is stricter than micro F1, which is dominated by a few frequent diagnoses and hides real quality on rare ones.',
        )}
      </p>

      {/* موج ۴ (D1/D3) — کارت کالیبراسیون همیشه دیده می‌شود؛ سه حالت موجود/ناموجود/ارزیابی حداقلی */}
      <CalibrationCard modelMetadata={modelMetadata} />

      {expanded && (
        <div className="mt-4 space-y-4">
          {evaluated.length > 0 && (
            <div>
              <p className="text-xs font-semibold opacity-70 mb-2">
                {pick('تشخیص‌های ارزیابی‌شده (دارای نمونهٔ مثبت در holdout)', 'Evaluated diagnoses (with positive holdout samples)')}
              </p>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-white/5 sticky top-0">
                    <tr className="text-start">
                      <th className="p-2 text-start font-medium">{pick('تشخیص', 'Diagnosis')}</th>
                      <th className="p-2 text-start font-medium">{pick('نمونه', 'Support')}</th>
                      <th className="p-2 text-start font-medium">P</th>
                      <th className="p-2 text-start font-medium">R</th>
                      <th className="p-2 text-start font-medium">F1</th>
                      <th className="p-2 text-start font-medium">{pick('آستانه', 'Thr')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evaluated.map(c => (
                      <tr key={c.id} className="border-t border-white/5">
                        <td className="p-2">{label(c.id)}</td>
                        <td className="p-2 opacity-70">
                          {c.support}
                          {supportMap.get(c.id) ? ` / ${supportMap.get(c.id)!.positives}` : ''}
                        </td>
                        <td className="p-2 opacity-80">{pct(c.precision)}</td>
                        <td className="p-2 opacity-80">{pct(c.recall)}</td>
                        <td className={`p-2 font-medium ${c.f1 >= 0.6 ? 'text-emerald-300' : c.f1 >= 0.3 ? 'text-yellow-300' : 'text-red-300'}`}>
                          {c.f1.toFixed(2)}
                        </td>
                        <td className="p-2 opacity-60">{c.threshold.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {suppressed.length > 0 && (
            <div>
              <p className="text-xs font-semibold opacity-70 mb-1">
                {pick(
                  `تشخیص‌های سرکوب‌شده (${suppressed.length}) — دادهٔ کافی برای یادگیری ندارند و مدل محلی روی آن‌ها اظهارنظر نمی‌کند`,
                  `Suppressed diagnoses (${suppressed.length}) — insufficient data; the local model does not report them`,
                )}
              </p>
              <p className="text-xs opacity-55 leading-relaxed">
                {suppressed.map(label).join('، ')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
