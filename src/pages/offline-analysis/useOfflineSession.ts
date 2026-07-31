/**
 * useOfflineSession — state مشترک صفحهٔ تحلیل آفلاین
 * انتخاب تصویر، اجرای تحلیل (مدل محلی / Python / مرورگر)، بارگذاری/حذف/ریست، تصویرسازی
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useClientsStore, useGalleryStore, useAnalysesStore, useSessionsStore, useSettingsStore, useTrainingSamplesStore } from '../../store';
import { db, offlineUtils, resolveGalleryItemUrl } from '../../db';
import type { GalleryItem, OfflineAnalysisResult, Analysis } from '../../db';
import { parseOfflineAnalysisResult } from '../../lib/analysisSchemas';
import { extractImageFeatures, composeOfflineResult, FEATURE_VERSION } from '../../lib/scalpFeatures';
import {
  calibrateScoresForAcquisition,
  readAnalysisAcquisitionContext,
} from '../../lib/analysisAcquisitionContext';
import {
  buildQuestionnaireAiContext,
} from '../../lib/questionnaireAiContext';
import { applyQuestionnaireToOfflineResult } from '../../lib/questionnaireOfflineInterpretation';
import { loadQuestionnaireForSession } from '../../lib/medicalQuestionnaireDraft';
import {
  FEATURE_VERSION_WITH_QUESTIONNAIRE,
  buildQuestionnaireFeatureVector,
} from '../../lib/questionnaireMlFeatures';
import { renderLesionsToCanvas } from '../../lib/lesionVisualization';
import { buildSessionPhotoViews } from '../../lib/buildSessionPhotoViews';
import {
  aggregateVisitResults,
  analysesInSameVisit,
  buildVisitLevelHistory,
  filterClientsEligibleForModule,
  resolveActiveSession,
} from '../../lib/sessionVisit';
import { useLang, useT, usePick } from '../../i18n';
import { offlineDict } from './strings';
import type { TabId } from './constants';
import type { SessionPhotoView } from '../ai-analysis/VisualizationTab';

/** TensorFlow فقط وقتی تحلیل با مدل محلی واقعاً نیاز باشد بارگذاری می‌شود */
async function loadLocalModel() {
  return import('../../lib/localModel');
}

export function useOfflineSession() {
  const { clients, fetchClients } = useClientsStore();
  const { fetchByClient } = useGalleryStore();
  const { analyses, addAnalysis, deleteAnalysis, fetchAnalyses } = useAnalysesStore();
  const { sessions, fetchSessions, updateSession } = useSessionsStore();
  const { settings } = useSettingsStore();
  const { modelMetadata, fetchModelMetadata } = useTrainingSamplesStore();
  const t = useT(offlineDict);
  const pick = usePick();
  const { lang } = useLang();

  const [activeTab, setActiveTab] = useState<TabId>('analysis');
  const [searchQuery, setSearchQuery] = useState('');
  const [allAnalysesSearchQuery, setAllAnalysesSearchQuery] = useState('');
  const [selectedClient, setSelectedClientState] = useState('');
  const [clientGallery, setClientGallery] = useState<GalleryItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<OfflineAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [engineInfo, setEngineInfo] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewingAnalysis, setViewingAnalysis] = useState<Analysis | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [sessionPhotos, setSessionPhotos] = useState<SessionPhotoView[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // انتخاب تصویر: لیست گالری فقط thumbnail دارد؛ محتوای کامل on-demand بارگذاری می‌شود
  const selectImage = async (item: GalleryItem) => {
    setSelectedImage(item);
    setResult(null);
    setZoom(1);
    const fullUrl = await resolveGalleryItemUrl(item);
    setSelectedImage(prev => (prev && prev.id === item.id ? { ...prev, url: fullUrl } : prev));
  };

  const offlineAnalyses = analyses.filter(a => a.type === 'offline');
  const clientHistory = selectedClient
    ? buildVisitLevelHistory(
      offlineAnalyses.filter(a => a.clientId === selectedClient),
      'offline',
      'offline',
    )
    : [];
  const analysesForSelectedClient = selectedClient
    ? analyses
        .filter(a => a.clientId === selectedClient)
        .map(a => ({ galleryItemId: a.galleryItemId, createdAt: a.createdAt }))
    : [];

  const photoLabel = useCallback(
    (index: number) => pick(`عکس ${index + 1}`, `Photo ${index + 1}`),
    [pick],
  );

  const [endingVisit, setEndingVisit] = useState(false);

  const setSelectedClient = useCallback((id: string) => {
    setSelectedClientState(id);
    if (!id) setSessionPhotos([]);
  }, []);

  const filteredAllAnalyses = offlineAnalyses.filter(a => {
    const client = clients.find(c => c.id === a.clientId);
    if (!client) return false;
    return `${client.firstName} ${client.lastName}`.toLowerCase().includes(allAnalysesSearchQuery.toLowerCase());
  });

  const analysesGroupedByClient = filteredAllAnalyses.reduce((acc, analysis) => {
    if (!acc[analysis.clientId]) acc[analysis.clientId] = [];
    acc[analysis.clientId].push(analysis);
    return acc;
  }, {} as Record<string, Analysis[]>);

  useEffect(() => {
    fetchClients();
    fetchSessions();
    fetchAnalyses();
    fetchModelMetadata();
    offlineUtils.checkPython().then(info => {
      if (info.scriptExists) {
        setEngineInfo(offlineDict.enginePython[lang]);
      } else {
        setEngineInfo(offlineDict.engineBrowser[lang]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eligibleClients = filterClientsEligibleForModule(clients, sessions, analyses, 'offline');

  const filteredClients = eligibleClients.filter(c =>
    `${c.firstName} ${c.lastName} ${c.phone}`.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const activeVisitSession = selectedClient
    ? resolveActiveSession(sessions, selectedClient)
    : undefined;

  const endVisit = useCallback(async () => {
    if (!selectedClient || isReadOnly) return;
    const session = resolveActiveSession(sessions, selectedClient);
    if (!session) return;
    setEndingVisit(true);
    try {
      await updateSession(session.id, { status: 'completed' });
      await fetchSessions();
      setSelectedClientState('');
      setSelectedImage(null);
      setResult(null);
      setSessionPhotos([]);
    } finally {
      setEndingVisit(false);
    }
  }, [selectedClient, isReadOnly, sessions, updateSession, fetchSessions]);

  useEffect(() => {
    if (!selectedClient) return;

    fetchByClient(selectedClient).then(items => {
      setClientGallery(items.filter(i => i.type === 'photo'));
    });

    // در حالت مشاهدهٔ آرشیو/تاریخچه نباید result پاک شود —
    // وگرنه با اولین کلیک (تغییر مشتری) نتیجه بلافاصله null می‌شود.
    if (!isReadOnly) {
      setSelectedImage(null);
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, isReadOnly]);

  const drawVisualization = useCallback(async (analysisResult: OfflineAnalysisResult, imageUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await renderLesionsToCanvas(canvas, imageUrl, analysisResult.lesions, { lang });
    } catch (e) {
      console.warn('Offline visualization draw failed:', e);
    }
  }, [lang]);

  useEffect(() => {
    if (result && selectedImage && activeTab === 'analysis') {
      drawVisualization(result, selectedImage.url);
    }
  }, [result, selectedImage, activeTab, drawVisualization]);

  const loadAnalysisForView = async (analysis: Analysis) => {
    // اول حالت مشاهده را فعال کن تا effect پاک‌سازی نتیجه را اجرا نکند
    setIsReadOnly(true);
    setSelectedClientState(analysis.clientId);
    setError('');
    setZoom(1);

    const visit = analysesInSameVisit(offlineAnalyses, analysis);
    setViewingAnalysis(visit[visit.length - 1] ?? analysis);

    const aggregated = aggregateVisitResults(visit.length ? visit : [analysis], 'offline', clientGallery) as OfflineAnalysisResult | null;
    if (aggregated) setResult(aggregated);

    try {
      const items = await fetchByClient(analysis.clientId);
      const photos = items.filter(i => i.type === 'photo');
      setClientGallery(photos);
      const withRegionSummary = aggregateVisitResults(visit.length ? visit : [analysis], 'offline', photos) as OfflineAnalysisResult | null;
      if (withRegionSummary) setResult(withRegionSummary);

      const sessionViews = await buildSessionPhotoViews(
        visit.length ? visit : [analysis],
        photos,
        'offline',
        photoLabel,
      );
      setSessionPhotos(sessionViews);

      const primary = visit[visit.length - 1] ?? analysis;
      const galleryItem = primary.galleryItemId
        ? photos.find(i => i.id === primary.galleryItemId) ?? null
        : null;

      if (galleryItem) {
        const fullUrl = await resolveGalleryItemUrl(galleryItem);
        setSelectedImage({ ...galleryItem, url: fullUrl });
      } else if (sessionViews[0]?.imageUrl) {
        setSelectedImage({
          id: primary.galleryItemId || `archived-${primary.id}`,
          clientId: analysis.clientId,
          type: 'photo',
          url: sessionViews[0].imageUrl,
          filename: 'archived-visualization.png',
          createdAt: primary.createdAt,
        });
      } else {
        setSelectedImage(null);
      }
    } catch (e) {
      console.warn('Restoring archived offline image failed:', e);
    }

    setActiveTab('results');
  };

  const resetForm = async () => {
    setSelectedClientState('');
    setSelectedImage(null);
    setResult(null);
    setSessionPhotos([]);
    setViewingAnalysis(null);
    setIsReadOnly(false);
    setError('');
    setActiveTab('analysis');
  };

  const handleDelete = async (analysisId: string) => {
    if (!confirm(t('deleteConfirm'))) return;
    const seed = analyses.find(a => a.id === analysisId) || viewingAnalysis;
    const visit = seed ? analysesInSameVisit(offlineAnalyses, seed) : [];
    const ids = visit.length ? visit.map(a => a.id) : [analysisId];
    for (const id of ids) {
      await deleteAnalysis(id);
    }
    await fetchAnalyses();
    await resetForm();
  };

  const runOfflineAnalysis = async () => {
    if (!selectedImage) {
      setError(t('selectImageError'));
      return;
    }

    setAnalyzing(true);
    setError('');
    setResult(null);

    try {
      let parsed: OfflineAnalysisResult | null = null;
      const imageUrl = await resolveGalleryItemUrl(selectedImage);
      const acquisitionContext = readAnalysisAcquisitionContext(selectedImage.metadata);

      // اگر مدل محلی فعال و سازگار باشد، ابتدا با آن؛ وگرنه heuristic (Python/مرورگر)
      const modelVersionOk = modelMetadata?.featureVersion === FEATURE_VERSION
        || modelMetadata?.featureVersion === FEATURE_VERSION_WITH_QUESTIONNAIRE;
      if (settings.useLocalModel && modelVersionOk) {
        try {
          const {
            hasLocalModel,
            predictWithLocalModel,
            setCachedFeatureNorm,
            setCachedObsPolicy,
            setCachedModelTemperature,
          } = await loadLocalModel();
          if (modelMetadata.featureMeans?.length && modelMetadata.featureStds?.length) {
            setCachedFeatureNorm({
              means: modelMetadata.featureMeans,
              stds: modelMetadata.featureStds,
            });
          }
          // فاز ۲ — آستانهٔ کالیبره و سرکوب برچسب‌های کم‌داده
          setCachedObsPolicy({
            thresholds: modelMetadata.obsThresholds,
            suppressedLabels: modelMetadata.suppressedLabels,
          });
          // موج ۴ (D3) — دمای کالیبراسیونِ پذیرفته‌شده (بدون مقدار → ۱ = بدون دما)
          setCachedModelTemperature(modelMetadata.calibrationTemperature);
          const modelReady = await hasLocalModel();
          if (modelReady) {
            const extracted = await extractImageFeatures(imageUrl);
            let questionnaireFeatures: number[] | undefined;
            if (modelMetadata.featureVersion === FEATURE_VERSION_WITH_QUESTIONNAIRE) {
              const activeSessionForMl = resolveActiveSession(sessions, selectedClient);
              if (activeSessionForMl) {
                try {
                  const client = clients.find(c => c.id === selectedClient);
                  const loaded = await loadQuestionnaireForSession(
                    selectedClient,
                    activeSessionForMl.id,
                    client,
                  );
                  questionnaireFeatures = buildQuestionnaireFeatureVector(
                    loaded.values,
                    loaded.changedFields,
                  );
                } catch (qe) {
                  console.warn('Loading questionnaire for local model predict failed:', qe);
                }
              }
            }
            const prediction = await predictWithLocalModel(
              extracted.metrics,
              questionnaireFeatures,
            );
            if (prediction) {
              parsed = {
                ...composeOfflineResult(
                  extracted,
                  calibrateScoresForAcquisition(prediction.scores, acquisitionContext),
                  lang === 'fa',
                  'model',
                  undefined,
                  prediction.observations,
                ),
                acquisitionContext,
                // فاز ۴٫۳ — اگر تصویر خارج از توزیع آموزشی باشد، در UI هشدار داده می‌شود
                ood: prediction.ood,
                // موج ۱ (W1-1) — نمرهٔ عدم‌قطعیت MC-Dropout برای نمایش به پزشک
                modelUncertainty: prediction.uncertainty,
              };
              setEngineInfo(t('engineLocalModel'));
            }
          }
        } catch (modelErr) {
          console.warn('Local model analysis failed, falling back to heuristic engine:', modelErr);
        }
      }

      if (!parsed) {
        const response = await offlineUtils.analyze(imageUrl, lang);
        if (!response.success) {
          throw new Error(response.error || t('analysisFailed'));
        }
        const rawResult = parseOfflineAnalysisResult(response.data, settings.aiConfidenceThreshold);
        // همهٔ موتورهای Python/Browser از یک مرحلهٔ عملی تنظیم بر اساس نور و
        // ناحیه عبور می‌کنند؛ بنابراین context واقعاً امتیازها و کادرها را تغییر می‌دهد.
        const extracted = await extractImageFeatures(imageUrl);
        const calibratedScores = calibrateScoresForAcquisition(
          {
            oiliness: rawResult.scalpCondition.oiliness,
            dryness: rawResult.scalpCondition.dryness,
            dandruff: rawResult.scalpCondition.dandruff ?? 0,
            redness: rawResult.scalpCondition.redness ?? 0,
            densityScore: rawResult.hairDensity.score,
            shine: rawResult.scalpCondition.shine ?? 0,
            patchiness: rawResult.scalpCondition.patchiness ?? 0,
            pigmentation: rawResult.scalpCondition.pigmentation ?? 0,
            hairThickness: rawResult.scalpCondition.hairThickness ?? 50,
          },
          acquisitionContext,
        );
        const rebuilt = composeOfflineResult(
          extracted,
          calibratedScores,
          lang === 'fa',
          rawResult.engine === 'model' ? 'model' : 'browser',
          rawResult.hairLoss.pattern,
          rawResult.observations as import('../../lib/diagnosisCatalog').ObservationId[] | undefined,
        );
        parsed = {
          ...rawResult,
          ...rebuilt,
          engine: rawResult.engine ?? rebuilt.engine,
          acquisitionContext,
        };
        if ('fallback' in response && response.fallback) {
          setEngineInfo(t('enginePythonFallback'));
        }
      }

      // لایهٔ تفسیر پرسشنامه: فقط پرچم/توصیه/برچسب اطمینان — نه امتیازهای عددی
      const activeSession = resolveActiveSession(sessions, selectedClient);
      const client = clients.find(c => c.id === selectedClient);
      let questionnaireContext = buildQuestionnaireAiContext({
        revision: null,
        includedInPrompt: false,
      });
      if (activeSession) {
        try {
          const loaded = await loadQuestionnaireForSession(
            selectedClient,
            activeSession.id,
            client,
          );
          questionnaireContext = buildQuestionnaireAiContext({
            revision: loaded.revision,
            values: loaded.values,
            changedFields: loaded.changedFields,
            includedInPrompt: false,
          });
        } catch (e) {
          console.warn('Loading questionnaire for offline interpretation failed:', e);
        }
      }
      parsed = applyQuestionnaireToOfflineResult(parsed, questionnaireContext, lang === 'fa');

      setResult(parsed);
      setActiveTab('visualization');

      await addAnalysis({
        clientId: selectedClient,
        sessionId: activeSession?.id,
        type: 'offline',
        galleryItemId: selectedImage.id,
        observations: parsed.observations,
        offlineResults: parsed,
        recommendations: parsed.recommendations.join('\n'),
      });

      // نوبت باز می‌ماند تا «پایان مراجعه»؛ مشتری فقط از فهرست همین ماژول
      // (چون برای این نوبت تحلیل آفلاین دارد) حذف می‌شود.

      await fetchAnalyses();
      await fetchSessions();

      const latest = useAnalysesStore.getState().analyses;
      const seed: Analysis = {
        id: 'temp',
        clientId: selectedClient,
        sessionId: activeSession?.id,
        type: 'offline',
        galleryItemId: selectedImage.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        offlineResults: parsed,
      };
      const visit = activeSession?.id
        ? latest
            .filter(a => a.type === 'offline' && a.clientId === selectedClient && a.sessionId === activeSession.id)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        : analysesInSameVisit(latest.filter(a => a.type === 'offline'), seed);

      const aggregated = aggregateVisitResults(visit, 'offline', clientGallery) as OfflineAnalysisResult | null;
      if (aggregated) setResult(aggregated);

      const photos = await buildSessionPhotoViews(visit, clientGallery, 'offline', photoLabel);
      setSessionPhotos(photos);
    } catch (err) {
      const e = err as Error;
      setError(e.message || t('offlineError'));
    }

    setAnalyzing(false);
  };

  const downloadResult = async () => {
    if (!result) return;
    // نتیجهٔ آرشیو تصویر annotate را همراه ندارد — در صورت نیاز on-demand
    let archivedAnnotated = result.annotatedImageBase64;
    if (!archivedAnnotated && result.hasAnnotatedImage && !selectedImage?.url && viewingAnalysis) {
      try {
        archivedAnnotated = (await db.getAnalysisAnnotatedImage(viewingAnalysis.id)) || undefined;
      } catch (err) {
        console.warn('Loading annotated analysis image failed:', err);
      }
    }
    const imageUrl = selectedImage?.url || archivedAnnotated;
    if (!imageUrl) return;
    try {
      const canvas = document.createElement('canvas');
      await renderLesionsToCanvas(canvas, imageUrl, result.lesions, { lang });
      const link = document.createElement('a');
      link.download = `offline-analysis-${selectedClient}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      if (archivedAnnotated) {
        const link = document.createElement('a');
        link.download = `offline-analysis-${selectedClient}-${Date.now()}.png`;
        link.href = archivedAnnotated;
        link.click();
      }
    }
  };

  return {
    activeTab, setActiveTab,
    searchQuery, setSearchQuery,
    allAnalysesSearchQuery, setAllAnalysesSearchQuery,
    selectedClient, setSelectedClient,
    clientGallery, selectedImage,
    analyzing, result, error, engineInfo,
    zoom, setZoom,
    viewingAnalysis, isReadOnly,
    canvasRef,
    clients, filteredClients,
    offlineAnalyses, clientHistory, analysesForSelectedClient, analysesGroupedByClient,
    sessionPhotos,
    settings,
    selectImage, runOfflineAnalysis, loadAnalysisForView,
    handleDelete, resetForm, downloadResult,
    activeVisitSession, endingVisit, endVisit,
  };
}
