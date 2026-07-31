/**
 * DatasetAuditPanel — موج ۱ (W1-2)
 *
 * پنل ممیزی دیتاست آموزشی: اتصال دو ماژول قبلاً یتیم `datasetAudit.ts`
 * (ممیزی برچسب‌ها/تکراری‌ها/توزیع) و `auditVisualTwins` (دوقلوهای بصری
 * بر اساس dHash) به UI.
 * اجرای ممیزی روی تقاضا (دکمه) انجام می‌شود تا خواندن کل آیتم‌های گالری
 * در هر رندر هزینه نسازد. گزارش کاملاً خواندنی است — هیچ حذف خودکاری
 * انجام نمی‌شود (تصمیم بالینی با متخصص می‌ماند).
 */
import { useState } from 'react';
import { ClipboardCheck, Loader, AlertTriangle } from 'lucide-react';
import { db } from '../../db';
import type { TrainingSample } from '../../db';
import { auditDataset, auditVisualTwins, type DatasetAuditReport, type VisualTwinGroup } from '../../lib/datasetAudit';
import { observationLabel } from '../../lib/diagnosisCatalog';
import { useLang, usePick, useT } from '../../i18n';
import { offlineDict } from './strings';

interface Props {
  samples: TrainingSample[];
}

interface AuditState {
  report: DatasetAuditReport;
  twins: VisualTwinGroup[];
  dhashCovered: number;
  dhashTotal: number;
}

export default function DatasetAuditPanel({ samples }: Props) {
  const t = useT(offlineDict);
  const pick = usePick();
  const { lang } = useLang();
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<AuditState | null>(null);

  const handleRun = async () => {
    setRunning(true);
    try {
      // خواندن همهٔ آیتم‌های گالری (بدون limit) فقط برای متادیتای dhash —
      // آدرس‌دهی پرهزینهٔ content انجام نمی‌شود چون به url دسترسی نداریم.
      const items = await db.getGalleryPage({});
      const photoItems = items.filter(i => i.type === 'photo');
      const dhashCovered = photoItems.filter(
        i => typeof i.metadata?.dhash === 'string' && (i.metadata.dhash as string).length === 16,
      ).length;
      setState({
        report: auditDataset(samples),
        twins: auditVisualTwins(samples, items),
        dhashCovered,
        dhashTotal: photoItems.length,
      });
    } finally {
      setRunning(false);
    }
  };

  const underSupported = state?.report.underSupportedLabels ?? [];
  const duplicates = state?.report.duplicates ?? [];
  const twins = state?.twins ?? [];
  const hasIssue = underSupported.length > 0 || duplicates.length > 0 || twins.length > 0;

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={20} className="text-teal-400" />
          <h3 className="font-semibold">{t('datasetAuditTitle')}</h3>
        </div>
        <button
          type="button"
          onClick={handleRun}
          disabled={running || samples.length === 0}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-sm font-medium flex items-center gap-2"
        >
          {running ? <Loader size={14} className="animate-spin" /> : <ClipboardCheck size={14} />}
          {running ? t('auditRunning') : t('auditRun')}
        </button>
      </div>
      <p className="text-xs opacity-60 mb-4">{t('datasetAuditDesc')}</p>

      {state && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
            <div className="rounded-xl bg-white/5 p-3">
              <div className="text-xl font-bold text-teal-300">{state.report.totalSamples}</div>
              <p className="text-xs opacity-60 mt-1">{t('auditTotalSamples')}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className={`text-xl font-bold ${underSupported.length ? 'text-yellow-300' : 'text-emerald-300'}`}>
                {underSupported.length}
              </div>
              <p className="text-xs opacity-60 mt-1">{t('auditUnderSupported')}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className={`text-xl font-bold ${duplicates.length ? 'text-yellow-300' : 'text-emerald-300'}`}>
                {duplicates.length}
              </div>
              <p className="text-xs opacity-60 mt-1">{t('auditDuplicates')}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <div className={`text-xl font-bold ${twins.length ? 'text-orange-300' : 'text-emerald-300'}`}>
                {twins.length}
              </div>
              <p className="text-xs opacity-60 mt-1">{t('auditVisualTwins')}</p>
            </div>
          </div>

          <p className="text-xs opacity-60">
            {t('auditDhashCoverage')}:{' '}
            {pick(
              `${state.dhashCovered} از ${state.dhashTotal} تصویر — از این پس dHash هنگام آپلود محاسبه می‌شود.`,
              `${state.dhashCovered} of ${state.dhashTotal} images — dHash is computed at upload time from now on.`,
            )}
          </p>

          {!hasIssue && <p className="text-sm text-emerald-300">{t('auditNoIssue')}</p>}

          {underSupported.length > 0 && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3">
              <p className="text-xs font-semibold text-yellow-300 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {t('auditUnderSupported')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {underSupported.slice(0, 30).map(id => (
                  <span key={id} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-xs">
                    {observationLabel(id, lang) ?? id}
                  </span>
                ))}
                {underSupported.length > 30 && (
                  <span className="text-xs opacity-50">+{underSupported.length - 30}</span>
                )}
              </div>
            </div>
          )}

          {twins.length > 0 && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
              <p className="text-xs font-semibold text-orange-300 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {t('auditVisualTwins')}
              </p>
              <ul className="text-xs space-y-1.5">
                {twins.slice(0, 10).map((g, i) => (
                  <li key={i} className="opacity-85">
                    {pick(
                      `گروه ${i + 1}: ${g.galleryItemIds.length} ${t('auditImagesLabel')}، ${g.sampleIds.length} ${t('auditSamplesLabel')} — ${t('auditMinDistanceLabel')}: ${g.minDistance}`,
                      `Group ${i + 1}: ${g.galleryItemIds.length} ${t('auditImagesLabel')}, ${g.sampleIds.length} ${t('auditSamplesLabel')} — ${t('auditMinDistanceLabel')}: ${g.minDistance}`,
                    )}
                  </li>
                ))}
                {twins.length > 10 && <li className="opacity-50">+{twins.length - 10}</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
