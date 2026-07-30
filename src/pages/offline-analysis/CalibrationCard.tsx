/**
 * CalibrationCard — موج ۴ (D1/D3): کارت «کالیبراسیون» داخل ClassMetricsPanel
 * -----------------------------------------------------------------------
 * سه حالت نقشه‌راه:
 *  ۱) شاخص موجود → ECE با رنگ‌بندی (≤0.10 سبز / ۰٫۱۰–۰٫۲۰ کهربانی / >0.20 قرمز)
 *     + Brier + تعداد holdout + CI95 + گزارش تصمیم دما (D3).
 *  ۲) شاخص ناموجود (مدل‌های پیش از موج ۴) → هیچ عددی جعل نمی‌کنیم؛ پیام
 *     «بازآموزی کنید» می‌دهیم.
 *  ۳) ارزیابی حداقلی (fallback با <۳ مشتری) → بنر کهربانی «ارزیابی حداقلی —
 *     دادهٔ مشتری‌محور کافی نیست» به‌همراه جزئیات صادقانه.
 *
 * خود کارت فقط view است؛ تمام منطق در buildCalibrationCardModel (خالص و
 * تست‌شده) است تا «رندر سه حالت» در تست واحد پوشش داده شده باشد.
 */
import { FlaskConical, Thermometer, TriangleAlert } from 'lucide-react';
import type { LocalModelMetadata } from '../../db';
import { buildCalibrationCardModel } from '../../lib/calibrationPresentation';
import { usePick } from '../../i18n';

function bandChipClass(band: 'green' | 'amber' | 'red'): string {
  switch (band) {
    case 'green':
      return 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10';
    case 'amber':
      return 'text-amber-300 border-amber-500/30 bg-amber-500/10';
    case 'red':
      return 'text-red-300 border-red-500/30 bg-red-500/10';
  }
}

export default function CalibrationCard({
  modelMetadata,
}: {
  modelMetadata: LocalModelMetadata | null;
}) {
  const pick = usePick();
  const model = buildCalibrationCardModel(modelMetadata);

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical size={16} className="text-violet-400" />
        {pick('کالیبراسیون', 'Calibration')}
      </div>

      {model.minimalEvaluation && model.minimalDetail && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <TriangleAlert size={14} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              {pick(
                'ارزیابی حداقلی — دادهٔ مشتری‌محور کافی نیست',
                'Minimal evaluation — not enough client-level data',
              )}
            </div>
            <div className="opacity-90 mt-1 leading-relaxed">{model.minimalDetail}</div>
          </div>
        </div>
      )}

      {model.state === 'absent' ? (
        <p className="mt-3 text-xs opacity-70 leading-relaxed">
          {pick(
            'شاخص‌های کالیبراسیون (ECE/Brier) برای مدل فعلی محاسبه نشده است؛ با یک بازآموزی جدید، این شاخص‌ها این‌جا ظاهر می‌شوند.',
            'Calibration metrics (ECE/Brier) were not computed for the current model; retrain once and they will appear here.',
          )}
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div
            className={`rounded-xl border p-3 ${bandChipClass(model.band!)}`}
            title={pick(
              'ECE: فاصلهٔ میانگین بین اعتمادِ مدل و دقت واقعی‌اش در سطل‌های کنفیدانس. کمتر بهتر؛ ≤0.10 خوب، >0.20 یعنی احتمال‌ها گمراه‌کننده‌اند.',
              'ECE: average gap between model confidence and its real accuracy across confidence bins. Lower is better; ≤0.10 good, >0.20 means probabilities are misleading.',
            )}
          >
            <div className="opacity-70">{pick('خطای کالیبراسیون (ECE)', 'Calibration error (ECE)')}</div>
            <div className="text-lg font-semibold">{model.ece!.toFixed(3)}</div>
          </div>
          <div
            className="rounded-xl bg-white/5 p-3"
            title={pick(
              'Brier: میانگین مربعاتِ خطای احتمال پیش‌بینی‌شده در برابر برچسب واقعی؛ صفر یعنی کامل.',
              'Brier: mean squared error of predicted probabilities against true labels; zero means perfect.',
            )}
          >
            <div className="opacity-70">{pick('امتیاز برایر (Brier)', 'Brier score')}</div>
            <div className="text-lg font-semibold">{model.brier!.toFixed(3)}</div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <div className="opacity-70">{pick('نمونهٔ holdout', 'Holdout samples')}</div>
            <div className="text-lg font-semibold">
              {typeof model.holdoutSampleCount === 'number' ? model.holdoutSampleCount : '—'}
            </div>
          </div>
          <div
            className="rounded-xl bg-white/5 p-3"
            title={pick(
              'بازهٔ اطمینان ۹۵٪ روی اجرای K-Fold مشتری‌محور — بازهٔ پهن یعنی عدد میانگین نباید تنها خوانده شود.',
              '95% confidence interval from client-level K-Fold runs — a wide interval means the mean alone should not be trusted.',
            )}
          >
            <div className="opacity-70">{pick('CI95 — MAE', 'CI95 — MAE')}</div>
            <div className="text-lg font-semibold">
              {model.kFold
                ? `${model.kFold.mae.mean.toFixed(2)} ± ${model.kFold.mae.margin.toFixed(2)}`
                : '—'}
            </div>
            {model.kFold && (
              <div className="opacity-60">
                {pick('F1 ماکرو', 'Macro F1')}
                {': '}
                {model.kFold.macroF1.mean.toFixed(3)} ± {model.kFold.macroF1.margin.toFixed(3)}
              </div>
            )}
          </div>
        </div>
      )}

      {model.temperature && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs">
          <Thermometer size={14} className="shrink-0 mt-0.5 text-cyan-300" />
          <div className="leading-relaxed">
            <span className="font-semibold">
              {model.temperature.adopted
                ? pick('کالیبراسیون دما اعمال شد', 'Temperature scaling applied')
                : model.temperature.attempted
                  ? pick('کالیبراسیون دما بررسی شد و پذیرفته نشد', 'Temperature scaling evaluated, not adopted')
                  : pick('کالیبراسیون دما (فاقد پیش‌شرط)', 'Temperature scaling (not eligible)')}
            </span>
            {model.temperature.adopted
              && typeof model.temperature.fittedT === 'number'
              && typeof model.temperature.eceBefore === 'number'
              && typeof model.temperature.eceAfter === 'number' && (
              <span className="opacity-90">
                {' '}
                {pick(
                  `T=${model.temperature.fittedT.toFixed(2)} · ECE: ${model.temperature.eceBefore.toFixed(3)} ← ${model.temperature.eceAfter.toFixed(3)}`,
                  `T=${model.temperature.fittedT.toFixed(2)} · ECE: ${model.temperature.eceBefore.toFixed(3)} → ${model.temperature.eceAfter.toFixed(3)}`,
                )}
              </span>
            )}
            <span className="block opacity-70 mt-0.5">{model.temperature.reason}</span>
          </div>
        </div>
      )}
    </div>
  );
}
