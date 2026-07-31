/**
 * TrainingGalleryTab — «استخر تصاویر آموزشی»
 * -----------------------------------------------------------------------
 * عکس‌هایی که به هیچ مشتری واقعی تعلق ندارند (clientId ثابت
 * SYSTEM_TRAINING_POOL_CLIENT_ID) — فقط برای برچسب‌گذاری/آموزش مدل محلی.
 *
 * برخلاف useAISession.ts/useOfflineSession.ts (که کاملاً به مشتری/نوبت
 * واقعی و aggregateVisitResults/addAnalysis گره خورده‌اند)، این تب مستقیماً
 * از توابع «مستقل» src/lib/analysis-utils.ts استفاده می‌کند: هیچ ردیف
 * Analysis/Session ساخته نمی‌شود — فقط نتیجه در ExpertLabelingPanel نمایش
 * داده می‌شود و با دکمهٔ Save همان پنل، مستقیماً یک TrainingSample جدید
 * ذخیره می‌شود.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Image, Loader, Upload, Cpu, Sparkles, Tag, Trash2 } from 'lucide-react';
import { useGalleryStore, useSettingsStore, useTrainingSamplesStore } from '../../store';
import { db, resolveGalleryItemUrl } from '../../db';
import type { GalleryItem, TrainingSampleLabel } from '../../db';
import { generateMediaThumbnail } from '../../lib/mediaThumbnail';
import {
  SCALP_REGION_META_KEY,
  type ScalpRegionId,
} from '../../lib/scalpRegions';
import ScalpRegionGrid from '../../components/scalp-region/ScalpRegionGrid';
import ScalpRegionBadge from '../../components/scalp-region/ScalpRegionBadge';
import ScalpRegionCaption from '../../components/scalp-region/ScalpRegionCaption';
import { SYSTEM_TRAINING_POOL_CLIENT_ID } from '../../lib/systemTrainingPool';
import { FEATURE_VERSION } from '../../lib/scalpFeatures';
import {
  runStandaloneOfflineAnalysis,
  runStandaloneOnlineAnalysis,
  analysisResultToTrainingLabel,
  extractStandaloneImageFeatures,
  resolveCurrentAiRuntimeConfig,
} from '../../lib/analysis-utils';
import { useLang, useT } from '../../i18n';
import { hasValidPrivacyConsent } from '../../lib/privacyConsent';
import { offlineDict } from './strings';
import { DEFAULT_LABEL_FORM } from './constants';
import ExpertLabelingPanel from './ExpertLabelingPanel';

/** یک عکس پرونده‌ای را به data URL تبدیل می‌کند (برای آپلود) */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type RunningAnalysis = { itemId: string; kind: 'offline' | 'online' } | null;

export default function TrainingGalleryTab() {
  const { settings } = useSettingsStore();
  const { saveSampleAndCompletePoolItem } = useTrainingSamplesStore();
  const t = useT(offlineDict);
  const { isRtl } = useLang();

  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadRegionId, setUploadRegionId] = useState<ScalpRegionId | null>(null);
  const [running, setRunning] = useState<RunningAnalysis>(null);
  const [error, setError] = useState('');

  const [labelImage, setLabelImage] = useState<GalleryItem | null>(null);
  const [labelForm, setLabelForm] = useState<TrainingSampleLabel>({ ...DEFAULT_LABEL_FORM });
  const [labelSaving, setLabelSaving] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadItems = async () => {
    setLoading(true);
    try {
      const rows = await db.getTrainingPoolItems({ status: 'active' });
      setItems(rows.filter(i => i.type === 'photo'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const clearLabelState = () => {
    setLabelImage(null);
    setLabelForm({ ...DEFAULT_LABEL_FORM });
  };

  const handleFilesSelected = async (files: FileList) => {
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await readFileAsDataUrl(file);
        const thumbnail = await generateMediaThumbnail(dataUrl, 'photo');
        const metadata = uploadRegionId ? { [SCALP_REGION_META_KEY]: uploadRegionId } : undefined;
        // skipGlobalRefresh=true: این آپلود نباید گالری عمومی/همهٔ مشتریان
        // (useGalleryStore.items/total سراسری که GalleryPage مصرف می‌کند) را
        // رفرش/ریست کند.
        await useGalleryStore.getState().addItem(
          SYSTEM_TRAINING_POOL_CLIENT_ID,
          { clientId: SYSTEM_TRAINING_POOL_CLIENT_ID, type: 'photo', url: dataUrl, thumbnail, filename: file.name, metadata },
          true,
        );
      }
      await loadItems();
    } catch (err) {
      setError((err as Error).message || t('offlineError'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (item: GalleryItem) => {
    if (!confirm(t('deleteConfirm'))) return;
    try {
      // مستقیماً از db، نه useGalleryStore.deleteItem — آن متد بدون قید و شرط
      // fetchPage سراسری را صدا می‌زند و گالری عمومی را بی‌دلیل رفرش می‌کند
      // (همان اثر جانبی‌ای که addItem با skipGlobalRefresh رفع شد).
      await db.deleteGalleryItem(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      if (labelImage?.id === item.id) clearLabelState();
    } catch (err) {
      setError((err as Error).message || t('offlineError'));
    }
  };

  const scrollToPanel = () => {
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleExpertLabel = async (item: GalleryItem) => {
    setError('');
    const fullUrl = await resolveGalleryItemUrl(item);
    setLabelImage({ ...item, url: fullUrl });
    setLabelForm({ ...DEFAULT_LABEL_FORM });
    scrollToPanel();
  };

  const handleOfflineAnalysis = async (item: GalleryItem) => {
    setError('');
    setRunning({ itemId: item.id, kind: 'offline' });
    try {
      const fullUrl = await resolveGalleryItemUrl(item);
      const result = await runStandaloneOfflineAnalysis({
        imageUrl: fullUrl,
        metadata: item.metadata,
        isRtl,
        confidenceThreshold: settings.aiConfidenceThreshold,
      });
      setLabelImage({ ...item, url: fullUrl });
      setLabelForm(analysisResultToTrainingLabel(result));
      scrollToPanel();
    } catch (err) {
      setError((err as Error).message || t('offlineAnalysisFailed'));
    } finally {
      setRunning(null);
    }
  };

  const handleOnlineAnalysis = async (item: GalleryItem) => {
    setError('');
    // موج ۲ (C3.1) — درگاه سخت رضایت حریم‌خصوصی، مشابه صفحهٔ تحلیل آنلاین
    if (!hasValidPrivacyConsent(settings)) {
      setError(t('privacyConsentRequired'));
      return;
    }
    if (!settings.hasApiKey && !settings.aiApiKey) {
      setError(t('apiKeyRequiredForOnline'));
      return;
    }
    setRunning({ itemId: item.id, kind: 'online' });
    try {
      const fullUrl = await resolveGalleryItemUrl(item);
      const runtime = await resolveCurrentAiRuntimeConfig(settings);
      const result = await runStandaloneOnlineAnalysis({
        imageUrl: fullUrl,
        metadata: item.metadata,
        isRtl,
        runtime,
        confidenceThreshold: settings.aiConfidenceThreshold,
      });
      setLabelImage({ ...item, url: fullUrl });
      setLabelForm(analysisResultToTrainingLabel(result));
      scrollToPanel();
    } catch (err) {
      setError((err as Error).message || t('onlineAnalysisFailed'));
    } finally {
      setRunning(null);
    }
  };

  const handleSave = async () => {
    if (!labelImage) return;
    setLabelSaving(true);
    try {
      const lesionTypes = (labelForm.lesions ?? []).map(l => l.type);
      const observations = Array.from(new Set([
        ...(labelForm.observations ?? []),
        ...lesionTypes,
      ]));
      const label: TrainingSampleLabel = {
        ...labelForm,
        observations,
        lesions: labelForm.lesions ?? [],
      };
      const features = await extractStandaloneImageFeatures(labelImage.url);
      // «ذخیره به‌عنوان یک TrainingSample جدید» — بدون ساخت ردیف در جدول analyses.
      // clientId ثابت روی کلاینت سیستمی می‌ماند تا این نمونه هم مثل سایر
      // نمونه‌های استخر آموزشی قابل شناسایی/فیلتر باشد.
      await saveSampleAndCompletePoolItem({
        clientId: SYSTEM_TRAINING_POOL_CLIENT_ID,
        galleryItemId: labelImage.id,
        features,
        label,
        labelSource: 'expert',
        confidence: 1,
        featureVersion: FEATURE_VERSION,
        approvedForTraining: true,
      });
      setItems(current => current.filter(item => item.id !== labelImage.id));
      toast.success(t('trainingSampleSaved'));
      clearLabelState();
    } catch (err) {
      setError((err as Error).message || t('offlineError'));
    } finally {
      setLabelSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Image size={20} className="text-cyan-400" />
          <h3 className="font-semibold">{t('trainingGalleryTitle')}</h3>
        </div>
        <p className="text-sm opacity-70">{t('trainingGalleryHint')}</p>

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs opacity-50">{t('selectRegionBeforeUpload')}</p>
          <ScalpRegionGrid
            selectedId={uploadRegionId}
            assignedIds={new Set()}
            onSelect={id => setUploadRegionId(prev => (prev === id ? null : id))}
          />
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={e => { if (e.target.files?.length) void handleFilesSelected(e.target.files); }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-r from-teal-400 to-emerald-500 text-white hover:opacity-90 transition disabled:opacity-50"
        >
          {uploading ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
          <span>{uploading ? t('uploadingPhotos') : t('addTrainingPhotos')}</span>
        </button>

        {loading ? (
          <div className="text-center py-12 opacity-50">
            <Loader className="animate-spin mx-auto mb-4" size={32} />
            <p>{t('search')}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <Image size={48} className="mx-auto mb-4 opacity-30" />
            <p>{t('noTrainingPhotos')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(item => {
              const isOffline = running?.itemId === item.id && running.kind === 'offline';
              const isOnline = running?.itemId === item.id && running.kind === 'online';
              const isBusy = running?.itemId === item.id;
              return (
                <div key={item.id} className="space-y-1.5">
                  <div className="relative rounded-xl overflow-hidden aspect-square bg-black/30">
                    {item.url ? (
                      <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image size={24} className="opacity-30" />
                      </div>
                    )}
                    <ScalpRegionBadge item={item} />
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(item)}
                      className="absolute top-2 start-2 p-1.5 rounded-full bg-red-500/70 hover:bg-red-500/90 text-white"
                      title={t('deletePhoto')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <ScalpRegionCaption item={item} />
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => handleOfflineAnalysis(item)}
                      disabled={isBusy}
                      className="flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-[10px] disabled:opacity-40"
                      title={t('runOfflineAnalysis')}
                    >
                      {isOffline ? <Loader size={14} className="animate-spin" /> : <Cpu size={14} />}
                      <span className="leading-tight text-center">{t('runOfflineAnalysis')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOnlineAnalysis(item)}
                      disabled={isBusy}
                      className="flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-[10px] disabled:opacity-40"
                      title={t('runOnlineAnalysis')}
                    >
                      {isOnline ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      <span className="leading-tight text-center">{t('runOnlineAnalysis')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExpertLabel(item)}
                      disabled={isBusy}
                      className="flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-[10px] disabled:opacity-40"
                      title={t('runExpertAnalysis')}
                    >
                      <Tag size={14} />
                      <span className="leading-tight text-center">{t('runExpertAnalysis')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {labelImage && (
        <ExpertLabelingPanel
          panelRef={panelRef}
          clients={[]}
          labelClient={SYSTEM_TRAINING_POOL_CLIENT_ID}
          onLabelClientChange={() => { /* no-op — hideClientSelector است */ }}
          labelGallery={items}
          labelImage={labelImage}
          onLabelImageChange={async next => {
            if (!next) { clearLabelState(); return; }
            const fullUrl = await resolveGalleryItemUrl(next);
            setLabelImage({ ...next, url: fullUrl });
            setLabelForm({ ...DEFAULT_LABEL_FORM });
          }}
          labelForm={labelForm}
          onLabelFormChange={setLabelForm}
          labelSaving={labelSaving}
          onSave={handleSave}
          onSuggest={async () => {
            if (!labelImage) return;
            const { heuristicScoresFromMetrics } = await import('../../lib/scalpFeatures');
            const { observationsFromScores } = await import('../../lib/diagnosisCatalog');
            const metrics = await extractStandaloneImageFeatures(labelImage.url);
            const scores = heuristicScoresFromMetrics(metrics);
            setLabelForm(prev => ({
              ...prev,
              ...scores,
              observations: observationsFromScores(scores),
            }));
          }}
          hideClientSelector
        />
      )}
    </div>
  );
}
