/**
 * AiAgreementPanel — فاز ۳٫۱
 *
 * اولین عدد واقعی دربارهٔ کیفیت تحلیل آنلاین: «AI چقدر با متخصص توافق دارد؟»
 * فقط روی نمونه‌هایی محاسبه می‌شود که متخصص واقعاً بازبینی و تصحیح کرده است.
 */
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Gauge } from 'lucide-react';
import type { TrainingSample } from '../../db';
import { buildAiAgreementReport } from '../../lib/aiAgreement';
import { observationLabel } from '../../lib/diagnosisCatalog';
import { useLang, usePick } from '../../i18n';

const SCORE_LABELS: Record<string, { fa: string; en: string }> = {
  oiliness: { fa: 'چربی', en: 'Oiliness' },
  dryness: { fa: 'خشکی', en: 'Dryness' },
  dandruff: { fa: 'شوره', en: 'Dandruff' },
  redness: { fa: 'قرمزی', en: 'Redness' },
  densityScore: { fa: 'تراکم', en: 'Density' },
  shine: { fa: 'براقیت', en: 'Shine' },
  patchiness: { fa: 'لکه‌ای بودن', en: 'Patchiness' },
  pigmentation: { fa: 'رنگ‌دانه', en: 'Pigmentation' },
  hairThickness: { fa: 'ضخامت تار', en: 'Hair thickness' },
};

export default function AiAgreementPanel({
  samples,
}: {
  samples: TrainingSample[];
}) {
  const pick = usePick();
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(false);

  const report = useMemo(() => buildAiAgreementReport(samples), [samples]);

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 font-semibold">
          <Gauge size={18} className="text-fuchsia-400" />
          {pick('توافق تحلیل آنلاین با متخصص', 'Online AI vs. expert agreement')}
        </span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {report.sampleCount === 0 ? (
        <p className="mt-3 text-xs opacity-70 leading-relaxed">
          {pick(
            'هنوز دادهٔ کافی وجود ندارد. این سنجش وقتی فعال می‌شود که متخصص نتیجهٔ یک تحلیل آنلاین را ویرایش کند؛ از آن لحظه نسخهٔ اولیهٔ AI نگه داشته می‌شود و با نسخهٔ نهایی متخصص مقایسه می‌گردد. نمونه‌های ثبت‌شده پیش از این به‌روزرسانی، نسخهٔ اولیه ندارند و در این گزارش نمی‌آیند.',
            'Not enough data yet. This measurement activates once an expert edits an online AI result: from that moment the original AI version is preserved and compared against the expert’s final version. Samples recorded before this update have no baseline and are excluded.',
          )}
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="opacity-60">{pick('نمونهٔ بازبینی‌شده', 'Reviewed samples')}</div>
              <div className="text-lg font-semibold">{report.sampleCount}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="opacity-60">{pick('MAE امتیازها', 'Score MAE')}</div>
              <div className="text-lg font-semibold">{report.overallMae.toFixed(1)}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="opacity-60">{pick('F1 تشخیص‌ها', 'Diagnosis F1')}</div>
              <div className="text-lg font-semibold">{report.observationF1.toFixed(2)}</div>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className="opacity-60">{pick('بدون تغییر', 'Unchanged')}</div>
              <div className="text-lg font-semibold">{report.unchangedObservationCount}</div>
            </div>
          </div>

          <p className="mt-2 text-xs opacity-60 leading-relaxed">
            {pick(
              `دقت (precision) ${report.observationPrecision.toFixed(2)} یعنی چه نسبتی از تشخیص‌های AI مورد تأیید متخصص بوده، و فراخوانی (recall) ${report.observationRecall.toFixed(2)} یعنی چه نسبتی از تشخیص‌های متخصص را AI دیده است. توجه: این آمار سوگیری انتخاب دارد، چون معمولاً موارد مشکوک‌تر برای بازبینی انتخاب می‌شوند.`,
              `Precision ${report.observationPrecision.toFixed(2)} = share of AI diagnoses the expert kept; recall ${report.observationRecall.toFixed(2)} = share of expert diagnoses the AI caught. Note: this is selection-biased, since more doubtful cases tend to get reviewed.`,
            )}
          </p>

          {expanded && (
            <div className="mt-4 space-y-4">
              {report.perScore.length > 0 && (
                <div>
                  <p className="text-xs font-semibold opacity-70 mb-2">
                    {pick('خطای هر شاخص (بیشترین خطا اول)', 'Per-metric error (largest first)')}
                  </p>
                  <div className="rounded-xl border border-white/10 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="p-2 text-start font-medium">{pick('شاخص', 'Metric')}</th>
                          <th className="p-2 text-start font-medium">MAE</th>
                          <th className="p-2 text-start font-medium">{pick('سوگیری', 'Bias')}</th>
                          <th className="p-2 text-start font-medium">n</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.perScore.map(s => (
                          <tr key={s.key} className="border-t border-white/5">
                            <td className="p-2">
                              {SCORE_LABELS[s.key] ? SCORE_LABELS[s.key][lang === 'fa' ? 'fa' : 'en'] : s.key}
                            </td>
                            <td className={`p-2 font-medium ${s.mae <= 10 ? 'text-emerald-300' : s.mae <= 20 ? 'text-yellow-300' : 'text-red-300'}`}>
                              {s.mae.toFixed(1)}
                            </td>
                            <td className="p-2 opacity-75">
                              {s.bias > 0 ? '+' : ''}{s.bias.toFixed(1)}
                              <span className="opacity-60">
                                {' '}
                                {s.bias > 1
                                  ? pick('(بیش‌برآورد AI)', '(AI overestimates)')
                                  : s.bias < -1
                                    ? pick('(کم‌برآورد AI)', '(AI underestimates)')
                                    : ''}
                              </span>
                            </td>
                            <td className="p-2 opacity-60">{s.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {report.perLabel.length > 0 && (
                <div>
                  <p className="text-xs font-semibold opacity-70 mb-2">
                    {pick('اختلاف در تشخیص‌ها (بیشترین اختلاف اول)', 'Diagnosis disagreements (largest first)')}
                  </p>
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-white/10">
                    <table className="w-full text-xs">
                      <thead className="bg-white/5 sticky top-0">
                        <tr>
                          <th className="p-2 text-start font-medium">{pick('تشخیص', 'Diagnosis')}</th>
                          <th className="p-2 text-start font-medium">{pick('توافق', 'Agreed')}</th>
                          <th className="p-2 text-start font-medium">{pick('فقط AI', 'AI only')}</th>
                          <th className="p-2 text-start font-medium">{pick('فقط متخصص', 'Expert only')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.perLabel.map(l => (
                          <tr key={l.id} className="border-t border-white/5">
                            <td className="p-2">{observationLabel(l.id, lang) ?? l.id}</td>
                            <td className="p-2 text-emerald-300">{l.agreed}</td>
                            <td className="p-2 text-amber-300">{l.aiOnly}</td>
                            <td className="p-2 text-sky-300">{l.expertOnly}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1 text-xs opacity-55">
                    {pick(
                      '«فقط AI» = مثبت کاذب (متخصص حذف کرده)؛ «فقط متخصص» = موردی که AI ندیده است.',
                      '"AI only" = false positives the expert removed; "Expert only" = findings the AI missed.',
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
