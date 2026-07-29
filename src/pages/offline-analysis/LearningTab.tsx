/**
 * LearningTab — یادگیری ماشین محلی حرفه‌ای
 * وضعیت مدل، کیفیت دیتاست، تأیید/ویرایش نمونه‌های AI، مقایسه موتورها، برچسب متخصص
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { WifiOff, Users, Image as ImageIcon, Images, Check } from 'lucide-react';
import { useAnalysesStore, useClientsStore, useGalleryStore, useSettingsStore, useTrainingSamplesStore } from '../../store';
import { electronUtils, resolveGalleryItemUrl } from '../../db';
import type { GalleryItem, LocalModelVersionInfo, TrainingSample, TrainingSampleLabel } from '../../db';
import { extractImageFeatures, heuristicScoresFromMetrics, FEATURE_VERSION, LEGACY_FEATURE_VERSIONS } from '../../lib/scalpFeatures';
import { FEATURE_VERSION_WITH_QUESTIONNAIRE } from '../../lib/questionnaireMlFeatures';
import { normalizeObservationIds, observationsFromScores } from '../../lib/diagnosisCatalog';
import { loadQuestionnaireFeaturesForClient } from '../../lib/medicalQuestionnaireDraft';
import { useT } from '../../i18n';
import { offlineDict } from './strings';
import { DEFAULT_LABEL_FORM } from './constants';
import ModelStatusPanel from './ModelStatusPanel';
import ExpertLabelingPanel from './ExpertLabelingPanel';
import RecentSamplesPanel from './RecentSamplesPanel';
import EngineComparePanel from './EngineComparePanel';
import ClassMetricsPanel from './ClassMetricsPanel';
import AiAgreementPanel from './AiAgreementPanel';
import DataMaturityPanel from './DataMaturityPanel';
import TrainingGalleryTab from './TrainingGalleryTab';
import TrainingPoolGalleryTab from './TrainingPoolGalleryTab';

function isUsableModelVersion(version?: string) {
  return version === FEATURE_VERSION || version === FEATURE_VERSION_WITH_QUESTIONNAIRE;
}

/** بارگذاری تنبل TensorFlow.js فقط وقتی تب یادگیری واقعاً استفاده شود */
async function loadLocalModel() {
  return import('../../lib/localModel');
}

function labelFromSample(sample: TrainingSample): TrainingSampleLabel {
  const l = sample.label ?? {};
  return {
    ...DEFAULT_LABEL_FORM,
    ...l,
    oiliness: l.oiliness ?? DEFAULT_LABEL_FORM.oiliness,
    dryness: l.dryness ?? DEFAULT_LABEL_FORM.dryness,
    dandruff: l.dandruff ?? DEFAULT_LABEL_FORM.dandruff,
    redness: l.redness ?? DEFAULT_LABEL_FORM.redness,
    densityScore: l.densityScore ?? DEFAULT_LABEL_FORM.densityScore,
    shine: l.shine ?? DEFAULT_LABEL_FORM.shine,
    patchiness: l.patchiness ?? DEFAULT_LABEL_FORM.patchiness,
    pigmentation: l.pigmentation ?? DEFAULT_LABEL_FORM.pigmentation,
    hairThickness: l.hairThickness ?? DEFAULT_LABEL_FORM.hairThickness,
    observations: l.observations ?? [],
    lesions: l.lesions ?? [],
    hairLossLevel: l.hairLossLevel,
    hairDensityLevel: l.hairDensityLevel,
  };
}

function labelFormFromAnalysis(analysis: import('../../db').Analysis): TrainingSampleLabel | null {
  const result = analysis.aiResults ?? analysis.offlineResults;
  if (!result) return null;
  const lesionTypes = result.lesions?.map(lesion => lesion.type) ?? [];
  const observations = normalizeObservationIds([
    ...(result.observations ?? []),
    ...lesionTypes,
  ]);
  return {
    ...DEFAULT_LABEL_FORM,
    oiliness: result.scalpCondition.oiliness,
    dryness: result.scalpCondition.dryness,
    dandruff: result.scalpCondition.dandruff ?? DEFAULT_LABEL_FORM.dandruff,
    redness: result.scalpCondition.redness ?? DEFAULT_LABEL_FORM.redness,
    densityScore: result.hairDensity.score,
    shine: result.scalpCondition.shine ?? DEFAULT_LABEL_FORM.shine,
    patchiness: result.scalpCondition.patchiness ?? DEFAULT_LABEL_FORM.patchiness,
    pigmentation: result.scalpCondition.pigmentation ?? DEFAULT_LABEL_FORM.pigmentation,
    hairThickness: result.scalpCondition.hairThickness ?? DEFAULT_LABEL_FORM.hairThickness,
    hairLossLevel: result.hairLoss.level,
    hairDensityLevel: result.hairDensity.level,
    observations,
    lesions: result.lesions ?? [],
  };
}

export default function LearningTab() {
  const { clients } = useClientsStore();
  const { analyses, fetchAnalyses } = useAnalysesStore();
  const { fetchByClient } = useGalleryStore();
  const { settings, updateSettings } = useSettingsStore();
  const {
    samples: trainingSamples,
    modelMetadata,
    fetchSamples: fetchTrainingSamples,
    addSample: addTrainingSample,
    updateSample,
    deleteSample: deleteTrainingSample,
    markSamplesUsed,
    fetchModelMetadata,
    saveModelMetadata,
    clearModelMetadata,
  } = useTrainingSamplesStore();
  const t = useT(offlineDict);

  /** منبع تصویر برای برچسب‌گذاری دستی/تحلیل: مشتری واقعی یا استخر آموزشی سیستمی */
  const [labelingSource, setLabelingSource] = useState<'client' | 'pool' | 'poolGallery'>('client');

  const [labelClient, setLabelClient] = useState('');
  const [labelGallery, setLabelGallery] = useState<GalleryItem[]>([]);
  const [labelImage, setLabelImage] = useState<GalleryItem | null>(null);
  const [labelForm, setLabelForm] = useState<TrainingSampleLabel>({ ...DEFAULT_LABEL_FORM });
  const [labelSaving, setLabelSaving] = useState(false);
  const [editingSampleId, setEditingSampleId] = useState<string | null>(null);
  const [editingFromAi, setEditingFromAi] = useState(false);
  const [modelHasWeights, setModelHasWeights] = useState(false);
  const [training, setTraining] = useState(false);
  const [trainProgress, setTrainProgress] = useState<{ epoch: number; loss?: number; val_loss?: number } | null>(null);
  const [trainError, setTrainError] = useState('');
  /** فاز ۰٫۱ — پیام نتیجهٔ گیت مقایسه با مدل قبلی (رد یا پذیرش) */
  const [retrainNotice, setRetrainNotice] = useState<{ replaced: boolean; reason: string } | null>(null);
  /** فاز ۰٫۵ — وجود نسخهٔ پشتیبان قابل بازگردانی */
  const [canRollback, setCanRollback] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const expertPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchTrainingSamples();
    fetchModelMetadata();
    fetchAnalyses();
    loadLocalModel().then(m => m.hasLocalModel()).then(setModelHasWeights);
    loadLocalModel().then(m => m.hasModelBackup()).then(setCanRollback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // نرمال‌سازی فیچر از متادیتا برای پیش‌بینی صحیح
  useEffect(() => {
    if (!modelMetadata?.featureMeans?.length || !modelMetadata?.featureStds?.length) return;
    loadLocalModel().then(m => {
      m.setCachedObsPolicy({
        thresholds: modelMetadata.obsThresholds,
        suppressedLabels: modelMetadata.suppressedLabels,
      });
      m.setCachedFeatureNorm({
        means: modelMetadata.featureMeans!,
        stds: modelMetadata.featureStds!,
      });
    });
  }, [modelMetadata]);

  useEffect(() => {
    if (!labelClient) { setLabelGallery([]); return; }
    fetchByClient(labelClient).then(items => setLabelGallery(items.filter(i => i.type === 'photo')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelClient]);

  // تحلیل ممکن است بعد از فهرست تصاویر از DB برسد؛ در این حالت برچسب‌های
  // کلینیکی تصویر را به‌محض آماده شدن تحلیل، بدون دخالت کاربر همگام می‌کنیم.
  useEffect(() => {
    if (labelingSource !== 'client' || !labelImage || editingSampleId) return;
    const latestAnalysis = analyses
      .filter(analysis => analysis.clientId === labelImage.clientId && analysis.galleryItemId === labelImage.id && (analysis.aiResults || analysis.offlineResults))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const analyzedLabel = latestAnalysis ? labelFormFromAnalysis(latestAnalysis) : null;
    if (analyzedLabel) setLabelForm(analyzedLabel);
  }, [analyses, editingSampleId, labelImage, labelingSource]);

  const stats = useMemo(() => {
    const untrainedSamplesCount = trainingSamples.filter(s => !s.usedInTraining).length;
    const samplesBySource = trainingSamples.reduce<Record<string, number>>((acc, s) => {
      acc[s.labelSource] = (acc[s.labelSource] || 0) + 1;
      return acc;
    }, {});
    const approvedAiCount = trainingSamples.filter(
      s => s.labelSource === 'online_ai' && s.approvedForTraining,
    ).length;
    const pendingAiCount = trainingSamples.filter(
      s => s.labelSource === 'online_ai' && !s.approvedForTraining,
    ).length;
    const eligibleCount = trainingSamples.filter(s => {
      if (s.featureVersion && s.featureVersion !== FEATURE_VERSION && !LEGACY_FEATURE_VERSIONS.includes(s.featureVersion as typeof LEGACY_FEATURE_VERSIONS[number])) return false;
      if (s.labelSource === 'expert') return true;
      if (s.labelSource === 'online_ai') return s.approvedForTraining === true;
      return false;
    }).length;
    return { untrainedSamplesCount, samplesBySource, approvedAiCount, pendingAiCount, eligibleCount };
  }, [trainingSamples]);

  const clearEditState = () => {
    setEditingSampleId(null);
    setEditingFromAi(false);
    setLabelForm({ ...DEFAULT_LABEL_FORM });
    setLabelImage(null);
  };

  const handleCancelEdit = () => {
    clearEditState();
  };

  const handleEditSample = async (sample: TrainingSample) => {
    setEditingSampleId(sample.id);
    setEditingFromAi(sample.labelSource === 'online_ai');
    setLabelForm(labelFromSample(sample));

    const clientId = sample.clientId || '';
    setLabelClient(clientId);

    if (clientId && sample.galleryItemId) {
      const items = await fetchByClient(clientId);
      const photos = items.filter(i => i.type === 'photo');
      setLabelGallery(photos);
      const item = photos.find(p => p.id === sample.galleryItemId);
      if (item) {
        const fullUrl = await resolveGalleryItemUrl(item);
        setLabelImage({ ...item, url: fullUrl });
      } else {
        setLabelImage(null);
      }
    } else {
      setLabelImage(null);
    }

    requestAnimationFrame(() => {
      expertPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleSaveExpertLabel = async () => {
    if (!labelImage && !editingSampleId) return;
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

      if (editingSampleId) {
        // تصحیح متخصص: برچسب به‌روز + تبدیل به expert + واجد شرایط آموزش
        const questionnaireFeatures = await loadQuestionnaireFeaturesForClient(
          labelClient || undefined,
        );
        await updateSample(editingSampleId, {
          label,
          labelSource: 'expert',
          approvedForTraining: true,
          confidence: 1,
          usedInTraining: false,
          featureVersion: FEATURE_VERSION,
          clientId: labelClient || undefined,
          galleryItemId: labelImage?.id,
          questionnaireFeatures,
        });
        clearEditState();
        return;
      }

      if (!labelImage) return;
      const fullUrl = await resolveGalleryItemUrl(labelImage);
      const { metrics } = await extractImageFeatures(fullUrl);
      const questionnaireFeatures = await loadQuestionnaireFeaturesForClient(
        labelClient || undefined,
      );
      await addTrainingSample({
        clientId: labelClient || undefined,
        galleryItemId: labelImage.id,
        features: metrics,
        label,
        labelSource: 'expert',
        confidence: 1,
        featureVersion: FEATURE_VERSION,
        approvedForTraining: true,
        questionnaireFeatures,
      });
      setLabelForm({ ...DEFAULT_LABEL_FORM });
      setLabelImage(null);
    } finally {
      setLabelSaving(false);
    }
  };

  const suggestHeuristicLabel = async () => {
    if (!labelImage) return;
    const { metrics } = await extractImageFeatures(await resolveGalleryItemUrl(labelImage));
    const scores = heuristicScoresFromMetrics(metrics);
    setLabelForm(prev => ({
      ...prev,
      ...scores,
      observations: observationsFromScores(scores),
    }));
  };

  const handleTrainModel = async (forceReplace = false) => {
    setTraining(true);
    setTrainError('');
    setRetrainNotice(null);
    setTrainProgress(null);
    try {
      const { trainLocalModel, setCachedFeatureNorm } = await loadLocalModel();
      const trainResult = await trainLocalModel(trainingSamples, (epoch, logs) => {
        setTrainProgress({
          epoch,
          loss: logs.loss,
          val_loss: logs.val_loss,
        });
      }, {
        // فاز ۰٫۱ — مدل جدید فقط اگر روی holdout بدتر نباشد جایگزین می‌شود
        activeBaseline: modelHasWeights && modelMetadata
          ? {
            version: modelMetadata.version,
            architecture: modelMetadata.architecture,
            featureVersion: modelMetadata.featureVersion,
            holdoutMae: modelMetadata.holdoutMae,
            holdoutObsF1: modelMetadata.holdoutObsF1,
            holdoutMacroF1: modelMetadata.holdoutMacroF1,
          }
          : null,
        forceReplace,
      });

      setRetrainNotice({
        replaced: trainResult.modelPersisted,
        reason: trainResult.retrainGate.reason,
      });

      // مدل رد شد → متادیتا/نمونه‌های استفاده‌شده هم نباید تغییر کنند
      if (!trainResult.modelPersisted) {
        return;
      }

      const nextVersion = (modelMetadata?.version || 0) + 1;
      const prevHistory: LocalModelVersionInfo[] = modelMetadata
        ? [
          ...(modelMetadata.history ?? []),
          {
            version: modelMetadata.version,
            trainedAt: modelMetadata.trainedAt,
            sampleCount: modelMetadata.sampleCount,
            featureVersion: modelMetadata.featureVersion,
            architecture: modelMetadata.architecture,
            valLoss: modelMetadata.valLoss,
            valMaeScores: modelMetadata.valMaeScores,
            valObsF1: modelMetadata.valObsF1,
            holdoutMae: modelMetadata.holdoutMae,
            holdoutObsF1: modelMetadata.holdoutObsF1,
            seed: modelMetadata.seed,
            datasetHash: modelMetadata.datasetHash,
            evaluation: modelMetadata.evaluation,
          },
        ].slice(-12)
        : [];

      setCachedFeatureNorm({
        means: trainResult.featureMeans,
        stds: trainResult.featureStds,
      });

      await saveModelMetadata({
        version: nextVersion,
        trainedAt: new Date().toISOString(),
        sampleCount: trainResult.sampleCount,
        sampleCountBySource: trainResult.sampleCountBySource,
        loss: trainResult.loss,
        valLoss: trainResult.valLoss,
        featureVersion: trainResult.featureVersion,
        architecture: trainResult.architecture,
        epochsRun: trainResult.epochs,
        maeScores: trainResult.maeScores,
        valMaeScores: trainResult.valMaeScores,
        obsF1: trainResult.obsF1,
        valObsF1: trainResult.valObsF1,
        holdoutMae: trainResult.holdoutMae,
        holdoutObsF1: trainResult.holdoutObsF1,
        seed: trainResult.seed,
        datasetHash: trainResult.datasetHash,
        evaluation: trainResult.evaluation,
        featureMeans: trainResult.featureMeans,
        featureStds: trainResult.featureStds,
        history: prevHistory,
        v4Experiment: trainResult.v4Experiment,
        // فاز ۲ — سیاست خروجی و متریک‌های per-class
        obsThresholds: trainResult.obsThresholds,
        holdoutMacroF1: trainResult.holdoutMacroF1,
        holdoutPerClass: trainResult.holdoutPerClass,
        labelSupport: trainResult.labelSupport,
        suppressedLabels: trainResult.suppressedLabels,
        repeatedHoldout: trainResult.repeatedHoldout,
      });
      await markSamplesUsed(trainResult.trainedIds, nextVersion);
      setModelHasWeights(true);
      // فاز ۰٫۵ — بعد از یک آموزش موفق، پشتیبان نسخهٔ قبل موجود است
      setCanRollback(await (await loadLocalModel()).hasModelBackup());
    } catch (err) {
      setTrainError((err as Error).message);
    } finally {
      setTraining(false);
    }
  };

  /** فاز ۰٫۵ — بازگردانی وزن‌های مدل به نسخهٔ قبل از آخرین آموزش */
  const handleRollbackModel = async () => {
    setRollbackBusy(true);
    setTrainError('');
    try {
      const { rollbackLocalModel, hasModelBackup, hasLocalModel } = await loadLocalModel();
      const ok = await rollbackLocalModel();
      if (!ok) {
        setTrainError('نسخهٔ پشتیبانی برای بازگردانی پیدا نشد.');
        setCanRollback(false);
        return;
      }
      // متادیتا را به آخرین نسخهٔ تاریخچه برگردان تا با وزن‌ها هم‌خوان بماند
      const history = modelMetadata?.history ?? [];
      const previous = history[history.length - 1];
      if (previous) {
        await saveModelMetadata({
          ...previous,
          sampleCountBySource: undefined,
          history: history.slice(0, -1),
        });
      }
      setRetrainNotice({
        replaced: true,
        reason: previous
          ? `مدل به نسخهٔ ${previous.version} بازگردانده شد.`
          : 'وزن‌های مدل به نسخهٔ پشتیبان بازگردانده شد.',
      });
      setModelHasWeights(await hasLocalModel());
      setCanRollback(await hasModelBackup());
    } catch (err) {
      setTrainError((err as Error).message);
    } finally {
      setRollbackBusy(false);
    }
  };

  const handleDeleteModel = async () => {
    const { deleteLocalModel } = await loadLocalModel();
    await deleteLocalModel();
    await clearModelMetadata();
    setModelHasWeights(false);
    setCanRollback(false);
    setRetrainNotice(null);
    await updateSettings({ useLocalModel: false });
  };

  const isRtl = settings.language === 'fa';

  const filteredSamples = trainingSamples.filter(s => {
    // ۱. تفکیک محتوایی بر اساس تب فعال
    if (labelingSource === 'client') {
      if (s.clientId === 'system-training-pool') return false;
    } else if (labelingSource === 'pool') {
      if (s.clientId !== 'system-training-pool') return false;
    } else {
      return false; // در تب گالری پات نمایش داده نمی‌شود
    }

    // ۲. منطق صندوق ورودی (Inbox / To-Do List)
    const approved = s.labelSource === 'expert' || s.approvedForTraining === true;
    if (!approved) return true; // همیشه کارهای معلق هوش مصنوعی را نشان بده

    // برای کارهای تایید شده/خبره، فقط نمونه‌های ۲۴ ساعت گذشته را نشان بده تا صفحه شلوغ نشود
    const isRecent = Date.now() - new Date(s.createdAt).getTime() < 24 * 60 * 60 * 1000;
    return isRecent;
  });

  return (
    <div className="space-y-6">
      {labelingSource !== 'poolGallery' && !electronUtils.isElectron && (
        <div className="rounded-2xl bg-yellow-500/10 border border-yellow-500/30 p-6 flex items-center gap-3">
          <WifiOff size={20} className="text-yellow-400" />
          <p className="text-sm">{t('webStorageWarning')}</p>
        </div>
      )}

      {labelingSource !== 'poolGallery' && (
        <DataMaturityPanel
          samples={trainingSamples}
          eligibleCount={stats.eligibleCount}
          modelMetadata={modelMetadata}
        />
      )}

      {labelingSource !== 'poolGallery' && <ModelStatusPanel
        trainingSamples={trainingSamples}
        samplesBySource={stats.samplesBySource}
        untrainedSamplesCount={stats.untrainedSamplesCount}
        eligibleCount={stats.eligibleCount}
        approvedAiCount={stats.approvedAiCount}
        pendingAiCount={stats.pendingAiCount}
        modelMetadata={modelMetadata}
        modelHasWeights={modelHasWeights}
        training={training}
        trainProgress={trainProgress}
        trainError={trainError}
        useLocalModel={!!settings.useLocalModel}
        onTrain={() => handleTrainModel(false)}
        onForceTrain={() => handleTrainModel(true)}
        retrainNotice={retrainNotice}
        canRollback={canRollback}
        onRollback={handleRollbackModel}
        rollbackBusy={rollbackBusy}
        onDeleteModel={handleDeleteModel}
        onToggleLocalModel={checked => updateSettings({ useLocalModel: checked })}
      />}

      {labelingSource !== 'poolGallery' && (
        <ClassMetricsPanel modelMetadata={modelMetadata} />
      )}

      {labelingSource !== 'poolGallery' && (
        <AiAgreementPanel samples={trainingSamples} />
      )}

      {labelingSource !== 'poolGallery' && <EngineComparePanel
        samples={trainingSamples}
        modelReady={modelHasWeights && isUsableModelVersion(modelMetadata?.featureVersion)}
      />}

      {/* منبع تصویر برای برچسب‌گذاری/تحلیل: مشتری واقعی (آرشیو گالری) یا
          استخر تصاویر آموزشی سیستمی (بدون مشتری واقعی) */}
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[.07] to-white/[.02] p-2 shadow-xl">
        <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider opacity-55">{t('labelingSourceTitle')}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            { id: 'client' as const, icon: Users, label: t('selectClientOption'), hint: t('clientGallerySourceHint'), selectedClass: 'border-emerald-300/80 bg-emerald-400/20', iconClass: 'bg-emerald-300 text-slate-900' },
            { id: 'pool' as const, icon: ImageIcon, label: t('trainingGalleryTitle'), hint: t('trainingPoolSourceHint'), selectedClass: 'border-cyan-300/80 bg-cyan-400/20', iconClass: 'bg-cyan-300 text-slate-900' },
            { id: 'poolGallery' as const, icon: Images, label: t('trainingPoolGalleryTitle'), hint: t('trainingPoolGallerySourceHint'), selectedClass: 'border-violet-300/80 bg-violet-400/20', iconClass: 'bg-violet-300 text-slate-900' },
          ]).map(({ id, icon: Icon, label, hint, selectedClass, iconClass }) => {
            const selected = labelingSource === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setLabelingSource(id)}
                className={`relative flex min-h-[76px] items-center gap-3 rounded-xl border px-3 py-3 text-start transition-all ${
                  selected
                    ? `${selectedClass} text-white shadow-lg`
                    : 'border-white/10 bg-black/10 opacity-75 hover:border-white/30 hover:bg-white/10 hover:opacity-100'
                }`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? iconClass : 'bg-white/10'}`}><Icon size={20} /></span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{label}</span><span className="block truncate text-xs opacity-60">{hint}</span></span>
                {selected && <Check size={17} className="absolute end-3 top-3" />}
              </button>
            );
          })}
        </div>
      </div>

      {editingSampleId ? (
        <ExpertLabelingPanel
          panelRef={expertPanelRef}
          clients={clients}
          labelClient={labelClient}
          onLabelClientChange={id => {
            setLabelClient(id);
            if (!editingSampleId) {
              setLabelImage(null);
              setLabelForm({ ...DEFAULT_LABEL_FORM });
            }
          }}
          labelGallery={labelGallery}
          labelImage={labelImage}
          onLabelImageChange={async item => {
            if (!item) {
              setLabelImage(null);
              if (!editingSampleId) {
                setLabelForm(prev => ({ ...prev, lesions: [], observations: [] }));
              }
              return;
            }
            const fullUrl = await resolveGalleryItemUrl(item);
            setLabelImage({ ...item, url: fullUrl });
            if (!editingSampleId) {
              const latestAnalysis = analyses
                .filter(analysis => analysis.clientId === item.clientId && analysis.galleryItemId === item.id && (analysis.aiResults || analysis.offlineResults))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              const analyzedLabel = latestAnalysis ? labelFormFromAnalysis(latestAnalysis) : null;
              setLabelForm(analyzedLabel ?? { ...DEFAULT_LABEL_FORM });
            }
          }}
          labelForm={labelForm}
          onLabelFormChange={setLabelForm}
          labelSaving={labelSaving}
          onSave={handleSaveExpertLabel}
          onSuggest={suggestHeuristicLabel}
          editingSampleId={editingSampleId}
          editingFromAi={editingFromAi}
          onCancelEdit={handleCancelEdit}
          hideClientSelector={labelClient === 'system-training-pool'}
        />
      ) : labelingSource === 'pool' ? (
        <TrainingGalleryTab />
      ) : labelingSource === 'poolGallery' ? (
        <TrainingPoolGalleryTab />
      ) : (
        <ExpertLabelingPanel
          panelRef={expertPanelRef}
          clients={clients}
          labelClient={labelClient}
          onLabelClientChange={id => {
            setLabelClient(id);
            if (!editingSampleId) {
              setLabelImage(null);
              setLabelForm({ ...DEFAULT_LABEL_FORM });
            }
          }}
          labelGallery={labelGallery}
          labelImage={labelImage}
          onLabelImageChange={async item => {
            if (!item) {
              setLabelImage(null);
              if (!editingSampleId) {
                setLabelForm(prev => ({ ...prev, lesions: [], observations: [] }));
              }
              return;
            }
            const fullUrl = await resolveGalleryItemUrl(item);
            setLabelImage({ ...item, url: fullUrl });
            if (!editingSampleId) {
              const latestAnalysis = analyses
                .filter(analysis => analysis.clientId === item.clientId && analysis.galleryItemId === item.id && (analysis.aiResults || analysis.offlineResults))
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              const analyzedLabel = latestAnalysis ? labelFormFromAnalysis(latestAnalysis) : null;
              setLabelForm(analyzedLabel ?? { ...DEFAULT_LABEL_FORM });
            }
          }}
          labelForm={labelForm}
          onLabelFormChange={setLabelForm}
          labelSaving={labelSaving}
          onSave={handleSaveExpertLabel}
          onSuggest={suggestHeuristicLabel}
          editingSampleId={editingSampleId}
          editingFromAi={editingFromAi}
          onCancelEdit={handleCancelEdit}
          hideClientSelector={labelClient === 'system-training-pool'}
        />
      )}

      {labelingSource !== 'poolGallery' && <RecentSamplesPanel
        samples={filteredSamples}
        editingSampleId={editingSampleId}
        onDelete={async id => {
          if (editingSampleId === id) clearEditState();
          await deleteTrainingSample(id);
        }}
        onToggleApproval={(id, approved) => updateSample(id, { approvedForTraining: approved })}
        onEdit={handleEditSample}
        isRtl={isRtl}
      />}
    </div>
  );
}
