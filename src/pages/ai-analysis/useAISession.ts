import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useClientsStore,
  useGalleryStore,
  useAnalysesStore,
  useSessionsStore,
  useSettingsStore,
  useTrainingSamplesStore,
} from '../../store';
import { aiUtils, db, resolveGalleryItemUrl } from '../../db';
import type { GalleryItem, AIAnalysisResult, Analysis } from '../../db';
import { buildChartDataFromScores, parseAIAnalysisResult } from '../../lib/analysisSchemas';
import { buildScalpAnalysisPrompt } from '../../lib/analysis-utils';
import {
  AI_RATE_LIMIT_DEFAULT_WAIT_S,
  DEFAULT_AI_CONFIDENCE_THRESHOLD,
  LESION_CONFIDENCE_FLOOR,
} from '../../lib/heuristicConstants';
import { extractImageFeatures, FEATURE_VERSION } from '../../lib/scalpFeatures';
import { renderLesionsToCanvas } from '../../lib/lesionVisualization';
import { buildSessionPhotoViews } from '../../lib/buildSessionPhotoViews';
import {
  readAnalysisAcquisitionContext,
} from '../../lib/analysisAcquisitionContext';
import {
  buildQuestionnaireAiContext,
} from '../../lib/questionnaireAiContext';
import { loadQuestionnaireForSession } from '../../lib/medicalQuestionnaireDraft';
import {
  buildQuestionnaireFeatureVector,
} from '../../lib/questionnaireMlFeatures';
import {
  aggregateVisitResults,
  analysesInSameVisit,
  buildVisitLevelHistory,
  filterClientsEligibleForModule,
  resolveActiveSession,
} from '../../lib/sessionVisit';
import { useLang, usePick, useT } from '../../i18n';
import { aiAnalysisDict } from './strings';
import { type TabId } from './constants';
import type { SessionPhotoView } from './VisualizationTab';

export function useAISession() {
  const { clients, fetchClients } = useClientsStore();
  const { fetchByClient } = useGalleryStore();
  const { analyses, addAnalysis, deleteAnalysis, fetchAnalyses } = useAnalysesStore();
  const { sessions, fetchSessions, updateSession } = useSessionsStore();
  const { settings } = useSettingsStore();
  const { addSample: addTrainingSample } = useTrainingSamplesStore();
  const t = useT(aiAnalysisDict);
  const pick = usePick();
  const { lang } = useLang();

  const [activeTab, setActiveTab] = useState<TabId>('analysis');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClientState] = useState('');
  const [clientGallery, setClientGallery] = useState<GalleryItem[]>([]);
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [viewingAnalysis, setViewingAnalysis] = useState<Analysis | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [sessionPhotos, setSessionPhotos] = useState<SessionPhotoView[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const aiAnalyses = analyses.filter(a => a.type === 'ai');
  const clientHistory = selectedClient
    ? buildVisitLevelHistory(
      aiAnalyses.filter(a => a.clientId === selectedClient),
      'ai',
      'ai',
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

  const eligibleClients = filterClientsEligibleForModule(clients, sessions, analyses, 'ai');
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
    fetchClients();
    fetchSessions();
    fetchAnalyses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedClient) return;
    fetchByClient(selectedClient).then(items => {
      setClientGallery(items.filter(i => i.type === 'photo'));
    });
    // در حالت مشاهدهٔ آرشیو/تاریخچه تصویر و نتیجه را پاک نکن
    if (!isReadOnly) {
      setSelectedImage(null);
      setResult(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient, isReadOnly]);

  // انتخاب تصویر: لیست گالری فقط thumbnail دارد؛ محتوای کامل (برای ارسال به
  // AI، رسم bounding box و استخراج فیچر) on-demand بارگذاری و جایگزین می‌شود.
  const selectImage = async (item: GalleryItem) => {
    setSelectedImage(item);
    setResult(null);
    setZoom(1);
    const fullUrl = await resolveGalleryItemUrl(item);
    setSelectedImage(prev => (prev && prev.id === item.id ? { ...prev, url: fullUrl } : prev));
  };

  const drawBoundingBoxes = useCallback(async (lesions: AIAnalysisResult['lesions'], imageUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await renderLesionsToCanvas(canvas, imageUrl, lesions, { lang });
    } catch (e) {
      console.warn('AI visualization draw failed:', e);
    }
  }, [lang]);

  useEffect(() => {
    if (result && selectedImage && (activeTab === 'analysis' || activeTab === 'visualization')) {
      drawBoundingBoxes(result.lesions, selectedImage.url);
    }
  }, [result, selectedImage, activeTab, drawBoundingBoxes]);

  const processSuccessfulAnalysis = async (analysisResult: AIAnalysisResult, image: GalleryItem) => {
    let annotatedImageBase64: string | undefined;
    try {
      const canvas = document.createElement('canvas');
      await renderLesionsToCanvas(canvas, image.url, analysisResult.lesions, { lang });
      annotatedImageBase64 = canvas.toDataURL('image/jpeg', 0.88);
    } catch (e) {
      console.warn('Saving annotated AI image failed:', e);
    }

    const toSave: AIAnalysisResult = {
      ...analysisResult,
      annotatedImageBase64,
    };

    setResult(toSave);
    drawBoundingBoxes(toSave.lesions, image.url);

    const activeSession = resolveActiveSession(sessions, selectedClient);
    await addAnalysis({
      clientId: selectedClient,
      sessionId: activeSession?.id,
      type: 'ai',
      galleryItemId: image.id,
      observations: toSave.observations,
      aiResults: toSave,
    });

    // نوبت باز می‌ماند تا کاربر صریحاً «پایان مراجعه» بزند —
    // تا ماژول‌های دیگر (آفلاین/پرسشنامه/تریکولوژیست) روی همین نوبت کار کنند.

    await fetchAnalyses();
    await fetchSessions();

    const latest = useAnalysesStore.getState().analyses;
    const seed: Analysis = {
      id: 'temp',
      clientId: selectedClient,
      sessionId: activeSession?.id,
      type: 'ai',
      galleryItemId: image.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiResults: toSave,
    };
    const visit = activeSession?.id
      ? latest.filter(a => a.type === 'ai' && a.clientId === selectedClient && a.sessionId === activeSession.id)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      : analysesInSameVisit(latest.filter(a => a.type === 'ai'), seed);

    const aggregated = aggregateVisitResults(visit, 'ai', clientGallery) as AIAnalysisResult | null;
    if (aggregated) {
      const withCharts: AIAnalysisResult = {
        ...aggregated,
        chartData: aggregated.chartData?.length
          ? aggregated.chartData
          : buildChartDataFromScores(
            {
              densityScore: aggregated.hairDensity.score,
              oiliness: aggregated.scalpCondition.oiliness,
              dryness: aggregated.scalpCondition.dryness,
              dandruff: aggregated.scalpCondition.dandruff,
              redness: aggregated.scalpCondition.redness,
              shine: aggregated.scalpCondition.shine,
              patchiness: aggregated.scalpCondition.patchiness,
              pigmentation: aggregated.scalpCondition.pigmentation,
              hairThickness: aggregated.scalpCondition.hairThickness,
            },
            lang === 'fa',
          ),
      };
      setResult(withCharts);
    }

    const photos = await buildSessionPhotoViews(visit, clientGallery, 'ai', photoLabel);
    setSessionPhotos(photos);

    // حلقهٔ یادگیری: هر تحلیل آنلاین موفق، به‌عنوان یک نمونهٔ آموزشی
    // برچسب‌خورده (label_source='online_ai') برای مدل محلی ذخیره می‌شود.
    try {
      const { metrics } = await extractImageFeatures(await resolveGalleryItemUrl(image));
      let questionnaireFeatures: number[] | undefined;
      if (activeSession) {
        try {
          const client = clients.find(c => c.id === selectedClient);
          const loaded = await loadQuestionnaireForSession(
            selectedClient,
            activeSession.id,
            client,
          );
          questionnaireFeatures = buildQuestionnaireFeatureVector(
            loaded.values,
            loaded.changedFields,
          );
        } catch (qe) {
          console.warn('Encoding questionnaire features for training sample failed:', qe);
        }
      }
      await addTrainingSample({
        clientId: selectedClient,
        galleryItemId: image.id,
        features: metrics,
        label: {
          oiliness: toSave.scalpCondition.oiliness,
          dryness: toSave.scalpCondition.dryness,
          dandruff: toSave.scalpCondition.dandruff ?? 0,
          redness: toSave.scalpCondition.redness ?? 0,
          densityScore: toSave.hairDensity.score,
          hairLossLevel: toSave.hairLoss.level,
          hairDensityLevel: toSave.hairDensity.level,
          lesions: toSave.lesions.map(l => ({ type: l.type, confidence: l.confidence, category: l.category, evidenceLevel: l.evidenceLevel })),
          observations: toSave.observations ?? [],
        },
        labelSource: 'online_ai',
        confidence: settings.aiConfidenceThreshold ?? DEFAULT_AI_CONFIDENCE_THRESHOLD,
        featureVersion: FEATURE_VERSION,
        approvedForTraining: false,
        questionnaireFeatures,
      });
    } catch (e) {
      console.warn('Saving training sample from AI analysis failed:', e);
    }

    setAnalyzing(false);
    abortControllerRef.current = null;
    setActiveTab('visualization');
  };

  const cancelAnalysis = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAnalyzing(false);
    setError(t('analysisCancelled'));
  }, [t]);

  const analyzeWithGemini = async () => {
    if (!selectedImage) {
      setError(t('selectImageFirst'));
      return;
    }
    if (!settings.hasApiKey && !settings.aiApiKey) {
      setError(t('configureApiKey'));
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setAnalyzing(true);
    setError('');
    setResult(null);

    abortControllerRef.current = new AbortController();
    const imageForAnalysis = selectedImage;

    try {
      const client = clients.find(c => c.id === selectedClient);
      const imageUrl = await resolveGalleryItemUrl(imageForAnalysis);

      const base64Image = imageUrl.includes('base64,')
        ? imageUrl.split('base64,')[1]
        : imageUrl;
      const acquisitionContext = readAnalysisAcquisitionContext(imageForAnalysis.metadata);

      // پرسشنامهٔ نوبت فعال — برای Prompt (در صورت رضایت) و snapshot نتیجه
      const activeSession = resolveActiveSession(sessions, selectedClient);
      const includeMedical = Boolean(settings.includeMedicalDataInAi);
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
            includedInPrompt: includeMedical,
          });
        } catch (e) {
          console.warn('Loading questionnaire for AI prompt failed:', e);
        }
      }

      const prompt = buildScalpAnalysisPrompt({
        acquisitionContext,
        questionnaireContext,
        includeMedical,
        client,
      });

      const mimeMatch = imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      // یک فراخوانی یکپارچه: در Electron از طریق IPC (بدون CORS، با پروکسی سیستم اگر تنظیم شده)
      // و در وب مستقیم از مرورگر انجام می‌شود.
      // در Electron کلید API عمداً خالی فرستاده می‌شود — main از DB می‌خواند.
      const { resolveAiRuntimeConfig } = await import('../../lib/aiProvider');
      const latest = useSettingsStore.getState().settings;
      const runtime = resolveAiRuntimeConfig({
        provider: latest.aiProvider || 'gemini',
        apiKey: latest.aiApiKey || '',
        baseUrl: latest.aiBaseUrl,
        model: latest.aiModelName,
        proxyUrl: latest.aiProxyUrl,
      });

      // اگر مسیر به‌خاطر کلید OpenRouter اصلاح شد، تنظیمات را هم همگام کن
      if (
        runtime.provider !== (latest.aiProvider || 'gemini') ||
        runtime.baseUrl !== (latest.aiBaseUrl || '') ||
        runtime.model !== (latest.aiModelName || '')
      ) {
        const { detectAiPresetId } = await import('../../lib/aiProvider');
        await useSettingsStore.getState().updateSettings({
          aiProvider: runtime.provider,
          aiBaseUrl: runtime.baseUrl,
          aiModelName: runtime.model,
          aiPresetId: detectAiPresetId({
            aiProvider: runtime.provider,
            aiBaseUrl: runtime.baseUrl,
            aiPresetId: latest.aiPresetId,
          }),
        });
      }

      const apiResult = await aiUtils.analyze(
        runtime,
        base64Image,
        mimeType,
        prompt,
        { signal: abortControllerRef.current.signal }
      );

      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      if (!apiResult.success || !apiResult.text) {
        const errorMsg = apiResult.error || t('unknownError');

        if (apiResult.aborted || errorMsg === 'Aborted') {
          // cancelAnalysis قبلاً پیام را ست کرده؛ اینجا فقط خارج شو
          setAnalyzing(false);
          abortControllerRef.current = null;
          return;
        }

        if (apiResult.status === 429 || errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
          const quotaMatch = errorMsg.match(/retry in ([\d.]+)s/i);
          const waitTime = quotaMatch ? parseFloat(quotaMatch[1]) : AI_RATE_LIMIT_DEFAULT_WAIT_S;
          const minutes = Math.floor(waitTime / 60);
          const seconds = Math.floor(waitTime % 60);
          const timeStr = minutes > 0 ? `${minutes} دقیقه و ${seconds} ثانیه` : `${seconds} ثانیه`;
          setError(pick(
            `محدودیت نرخ API: لطفاً ${timeStr} صبر کنید.`,
            `API Rate Limit: Please wait ${timeStr}.`
          ));
        } else if (
          errorMsg.toLowerCase().includes('failed to fetch') ||
          errorMsg.toLowerCase().includes('network') ||
          errorMsg === 'Timeout'
        ) {
          setError(pick(
            `خطای شبکه: ${aiUtils.isElectron ? 'لطفاً تنظیمات پروکسی را در منوی تنظیمات > پروکسی بررسی کنید' : 'اتصال مستقیم به سرویس هوش مصنوعی برقرار نشد. اگر در ایران هستید، از نسخهٔ دسکتاپ (که پروکسی سیستم را پشتیبانی می‌کند) استفاده کنید یا در تنظیمات > هوش مصنوعی یک پراکسی مورد اعتماد شخصی وارد کنید.'}`,
            `Network Error: ${aiUtils.isElectron ? 'Check proxy settings in Settings > Proxy' : 'Could not reach the AI service directly. Use the desktop app (which supports a system proxy) or set your own trusted proxy in Settings > AI.'}`
          ));
        } else {
          setError(pick(`خطا در تحلیل: ${errorMsg}`, `Analysis Error: ${errorMsg}`));
        }
        setAnalyzing(false);
        abortControllerRef.current = null;
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(apiResult.text);
      } catch {
        throw new Error(pick(
          'پاسخ AI قابل تبدیل به JSON نبود. لطفاً دوباره تلاش کنید.',
          'AI response was not valid JSON. Please try again.',
        ));
      }
      const parsed = parseAIAnalysisResult(
        parsedJson,
        Math.min(settings.aiConfidenceThreshold ?? DEFAULT_AI_CONFIDENCE_THRESHOLD, LESION_CONFIDENCE_FLOOR + 0.1),
      );
      const analysisResult: AIAnalysisResult = {
        ...parsed,
        acquisitionContext,
        questionnaireContext,
        chartData: parsed.chartData?.length
          ? parsed.chartData
          : buildChartDataFromScores(
            {
              densityScore: parsed.hairDensity.score,
              oiliness: parsed.scalpCondition.oiliness,
              dryness: parsed.scalpCondition.dryness,
              dandruff: parsed.scalpCondition.dandruff,
              redness: parsed.scalpCondition.redness,
              shine: parsed.scalpCondition.shine,
              patchiness: parsed.scalpCondition.patchiness,
              pigmentation: parsed.scalpCondition.pigmentation,
              hairThickness: parsed.scalpCondition.hairThickness,
            },
            lang === 'fa',
          ),
      };
      await processSuccessfulAnalysis(analysisResult, { ...imageForAnalysis, url: imageUrl });
    } catch (err) {
      const e = err as Error;
      console.error('AI Analysis Error:', e);
      if (e.name !== 'AbortError') {
        setError(e.message || t('imageAnalysisError'));
      }
      setAnalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const loadAnalysisForView = async (analysis: Analysis) => {
    // اول حالت مشاهده را فعال کن تا effect پاک‌سازی تصویر را اجرا نکند
    setIsReadOnly(true);
    setSelectedClientState(analysis.clientId);
    setError('');
    setZoom(1);

    const visit = analysesInSameVisit(aiAnalyses, analysis);
    setViewingAnalysis(visit[visit.length - 1] ?? analysis);

    const aggregated = aggregateVisitResults(visit.length ? visit : [analysis], 'ai', clientGallery) as AIAnalysisResult | null;
    if (aggregated) {
      const withCharts: AIAnalysisResult = {
        ...aggregated,
        chartData: aggregated.chartData?.length
          ? aggregated.chartData
          : buildChartDataFromScores(
            {
              densityScore: aggregated.hairDensity.score,
              oiliness: aggregated.scalpCondition.oiliness,
              dryness: aggregated.scalpCondition.dryness,
              dandruff: aggregated.scalpCondition.dandruff,
              redness: aggregated.scalpCondition.redness,
              shine: aggregated.scalpCondition.shine,
              patchiness: aggregated.scalpCondition.patchiness,
              pigmentation: aggregated.scalpCondition.pigmentation,
              hairThickness: aggregated.scalpCondition.hairThickness,
            },
            lang === 'fa',
          ),
      };
      setResult(withCharts);
    }

    try {
      const items = await fetchByClient(analysis.clientId);
      const photos = items.filter(i => i.type === 'photo');
      setClientGallery(photos);
      const withRegionSummary = aggregateVisitResults(visit.length ? visit : [analysis], 'ai', photos) as AIAnalysisResult | null;
      if (withRegionSummary) {
        setResult({
          ...withRegionSummary,
          chartData: withRegionSummary.chartData?.length
            ? withRegionSummary.chartData
            : buildChartDataFromScores({
              densityScore: withRegionSummary.hairDensity.score,
              oiliness: withRegionSummary.scalpCondition.oiliness,
              dryness: withRegionSummary.scalpCondition.dryness,
              dandruff: withRegionSummary.scalpCondition.dandruff,
              redness: withRegionSummary.scalpCondition.redness,
              shine: withRegionSummary.scalpCondition.shine,
              patchiness: withRegionSummary.scalpCondition.patchiness,
              pigmentation: withRegionSummary.scalpCondition.pigmentation,
              hairThickness: withRegionSummary.scalpCondition.hairThickness,
            }, lang === 'fa'),
        });
      }

      const sessionViews = await buildSessionPhotoViews(
        visit.length ? visit : [analysis],
        photos,
        'ai',
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
          filename: 'archived-visualization.jpg',
          createdAt: primary.createdAt,
        });
      } else {
        setSelectedImage(null);
      }
    } catch (e) {
      console.warn('Restoring archived AI image failed:', e);
    }

    setActiveTab(
      (aggregated?.lesions?.length || aggregated?.annotatedImageBase64 || aggregated?.hasAnnotatedImage || visit.length > 1)
        ? 'visualization'
        : 'results',
    );
  };

  const handleDelete = async (analysisId: string) => {
    if (!confirm(t('deleteConfirm'))) return;
    const seed = analyses.find(a => a.id === analysisId) || viewingAnalysis;
    const visit = seed ? analysesInSameVisit(aiAnalyses, seed) : [];
    const ids = visit.length ? visit.map(a => a.id) : [analysisId];
    for (const id of ids) {
      await deleteAnalysis(id);
    }
    await fetchAnalyses();
    setViewingAnalysis(null);
    setResult(null);
    setSessionPhotos([]);
    setIsReadOnly(false);
    setActiveTab('analysis');
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

  const downloadResult = async () => {
    if (!result) return;
    // نتیجهٔ بازیابی‌شده از آرشیو تصویر annotate را همراه ندارد (payload سبک)؛
    // اگر پرچمش روشن است و تصویر دیگری نداریم، on-demand می‌گیریم.
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
      // اگر تصویر ذخیره‌شدهٔ دارای کادر موجود است، همان را دانلود کن
      if (archivedAnnotated && (!selectedImage?.url || imageUrl === archivedAnnotated)) {
        const link = document.createElement('a');
        link.download = `ai-analysis-${selectedClient}-${Date.now()}.jpg`;
        link.href = archivedAnnotated;
        link.click();
        return;
      }
      const canvas = document.createElement('canvas');
      await renderLesionsToCanvas(canvas, imageUrl, result.lesions, { lang });
      const link = document.createElement('a');
      link.download = `ai-analysis-${selectedClient}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `ai-analysis-${selectedClient}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }
  };

  const getSelectedClient = () => clients.find(c => c.id === selectedClient);

  return {
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    selectedClient,
    setSelectedClient,
    clientGallery,
    selectedImage,
    analyzing,
    result,
    error,
    zoom,
    setZoom,
    viewingAnalysis,
    isReadOnly,
    filteredClients,
    clientHistory,
    analysesForSelectedClient,
    aiAnalyses,
    clients,
    sessionPhotos,
    hasApiKey: Boolean(settings.hasApiKey || settings.aiApiKey),
    canvasRef,
    imgRef,
    selectImage,
    analyzeWithGemini,
    cancelAnalysis,
    loadAnalysisForView,
    handleDelete,
    resetForm,
    downloadResult,
    getSelectedClient,
    activeVisitSession,
    endingVisit,
    endVisit,
  };
}
