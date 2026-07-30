/**
 * FeatureRecomputePanel — موج ۱ (W1-4)
 *
 * رابط کاربری مکانیزم «بازمحاسبهٔ فیچر از تصویر خام» (`featureRecompute.ts`):
 * نمایش ترکیب نسخه‌های استخر، اجرای دسته‌ای با نوار پیشرفت و امکان لغو،
 * و نوشتن نتیجه در هر سه بک‌اند دیتابیس (patch فیچر + نسخه).
 * تاریخچهٔ بالینی (Analysisها) دست‌نخورده می‌ماند؛ فقط TrainingSample به‌روز می‌شود.
 */
import { useMemo, useRef, useState } from 'react';
import { RefreshCw, Loader, XCircle } from 'lucide-react';
import { db } from '../../db';
import type { TrainingSample } from '../../db';
import { planFeatureRecompute, runFeatureRecomputeBatch, type RecomputeSummary } from '../../lib/featureRecompute';
import { FEATURE_VERSION } from '../../lib/scalpFeatures';
import { useTrainingSamplesStore } from '../../store';
import { usePick, useT } from '../../i18n';
import { offlineDict } from './strings';
import { toast } from 'sonner';

interface Props {
  samples: TrainingSample[];
}

export default function FeatureRecomputePanel({ samples }: Props) {
  const t = useT(offlineDict);
  const pick = usePick();
  const updateSample = useTrainingSamplesStore(s => s.updateSample);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<RecomputeSummary | null>(null);
  const cancelRef = useRef(false);

  const plan = useMemo(() => planFeatureRecompute(samples), [samples]);
  const nothingToDo = plan.upgradable.length === 0;

  const handleRun = async () => {
    cancelRef.current = false;
    setBusy(true);
    setSummary(null);
    setProgress({ done: 0, total: plan.upgradable.length });
    try {
      const { updates, summary: result } = await runFeatureRecomputeBatch(
        samples,
        {
          getImageUrl: gid => db.getGalleryItemDataUrl(gid),
          // استخراج‌گر واقعی (canvas) — از پیش‌فرض ماژول استفاده می‌کنیم
        },
        (done, total) => setProgress({ done, total }),
        () => cancelRef.current,
      );

      // اعمال اتمیکِ هر به‌روزرسانی؛ شکست یک نمونه بقیه را نگه نمی‌دارد
      let writeFailed = 0;
      for (const u of updates) {
        try {
          await updateSample(u.sampleId, { features: u.features, featureVersion: u.featureVersion });
        } catch {
          writeFailed++;
        }
      }
      setSummary({ ...result, failed: result.failed + writeFailed });
      if (result.canceled) {
        toast.info(pick('بازمحاسبه لغو شد؛ نمونه‌های پردازش‌شده ذخیره شدند.', 'Recompute canceled; processed samples were saved.'));
      }
    } catch (err) {
      toast.error(`${t('recomputeRun')}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <RefreshCw size={20} className="text-sky-400" />
          <h3 className="font-semibold">{t('recomputeTitle')}</h3>
          <span className="text-xs opacity-40" dir="ltr">{FEATURE_VERSION}</span>
        </div>
        <div className="flex items-center gap-2">
          {busy && (
            <button
              type="button"
              onClick={() => { cancelRef.current = true; }}
              className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm flex items-center gap-1.5"
            >
              <XCircle size={14} /> {t('recomputeCancel')}
            </button>
          )}
          <button
            type="button"
            onClick={handleRun}
            disabled={busy || nothingToDo}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-sm font-medium flex items-center gap-2"
          >
            {busy ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {busy ? t('recomputeRunning') : t('recomputeRun')}
          </button>
        </div>
      </div>
      <p className="text-xs opacity-60 mb-4">{t('recomputeDesc')}</p>

      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <div className="rounded-xl bg-white/5 p-3">
          <div className={`text-xl font-bold ${plan.upgradable.length ? 'text-sky-300' : 'text-emerald-300'}`}>
            {plan.upgradable.length}
          </div>
          <p className="text-xs opacity-60 mt-1">{t('recomputeUpgradable')}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-xl font-bold text-white/70">{plan.current.length}</div>
          <p className="text-xs opacity-60 mt-1">{t('recomputeCurrentVersion')}</p>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className={`text-xl font-bold ${plan.noImage.length ? 'text-yellow-300' : 'text-white/70'}`}>
            {plan.noImage.length}
          </div>
          <p className="text-xs opacity-60 mt-1">{t('recomputeNoImage')}</p>
        </div>
      </div>

      {nothingToDo && !summary && (
        <p className="text-sm text-emerald-300">{t('recomputeNothing')}</p>
      )}

      {busy && progress && progress.total > 0 && (
        <div className="mb-4">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-sky-500 transition-all"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs opacity-60 mt-1" dir="ltr">
            {progress.done} / {progress.total}
          </p>
        </div>
      )}

      {summary && (
        <div className={`rounded-xl border p-3 text-sm ${
          summary.failed > 0
            ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100/90'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100/90'
        }`}>
          {pick(
            `${summary.recomputed} نمونه بازمحاسبه شد، ${summary.skippedNoImage} نمونه بدون تصویر خام بازنشسته ماند${summary.failed > 0 ? `، ${summary.failed} ${t('recomputeFailedLabel')}` : ''}${summary.canceled ? ' (لغو شده در میانه)' : ''}.`,
            `${summary.recomputed} samples recomputed, ${summary.skippedNoImage} without raw image stayed retired${summary.failed > 0 ? `, ${summary.failed} ${t('recomputeFailedLabel')}` : ''}${summary.canceled ? ' (canceled midway)' : ''}.`,
          )}
        </div>
      )}
    </div>
  );
}
