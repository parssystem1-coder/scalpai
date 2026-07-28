import { useCallback, useEffect, useRef, useState } from 'react';
import { useClientsStore, useAnalysesStore, useSessionsStore } from '../../store';
import type { Analysis } from '../../db';
import { useT } from '../../i18n';
import { parseStoredJson } from '../../lib/safeJson';
import {
  flushMedicalQuestionnaireDrafts,
  loadQuestionnaireForSession,
  saveMedicalQuestionnaireDraft,
} from '../../lib/medicalQuestionnaireDraft';
import {
  normalizeQuestionnaireValues,
  toQuestionnaireRecord,
  type QuestionnaireFieldKey,
} from '../../lib/medicalQuestionnaireSchema';
import { resolveActiveSession } from '../../lib/sessionVisit';
import { trichoDict } from './strings';
import { tabs, type TabId } from './constants';
import type { TreatmentStep } from './types';

export function useTrichoSession(initialTab: TabId = 'basic') {
  const { clients, fetchClients } = useClientsStore();
  const { analyses, addAnalysis, updateAnalysis, deleteAnalysis, fetchAnalyses } = useAnalysesStore();
  const { sessions, fetchSessions, updateSession } = useSessionsStore();
  const t = useT(trichoDict);

  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedImage, setSelectedImage] = useState('');
  const [treatmentSteps, setTreatmentSteps] = useState<TreatmentStep[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<Partial<Analysis>>({
    medicalQuestionnaire: {},
    observations: [],
    recommendations: '',
    treatmentPlan: '',
  });
  const [questionnaireChangedFields, setQuestionnaireChangedFields] = useState<QuestionnaireFieldKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [viewingAnalysis, setViewingAnalysis] = useState<Analysis | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const [endingVisit, setEndingVisit] = useState(false);

  const editingAnalysisIdRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const handleSaveRef = useRef<(auto?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    editingAnalysisIdRef.current = editingAnalysisId;
  }, [editingAnalysisId]);

  const trichologistAnalyses = analyses.filter(a => a.type === 'trichologist');
  const clientHistory = selectedClient
    ? trichologistAnalyses.filter(a => a.clientId === selectedClient)
    : [];
  const activeVisitSession = selectedClient
    ? resolveActiveSession(sessions, selectedClient)
    : undefined;

  useEffect(() => {
    fetchClients();
    fetchSessions();
    fetchAnalyses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectClient = useCallback((clientId: string) => {
    setSelectedClient(clientId);
    setQuestionnaireChangedFields([]);
    if (!clientId) return;
    const session = resolveActiveSession(sessions, clientId);
    setCurrentAnalysis(previous => ({ ...previous, medicalQuestionnaire: {} }));
    if (!session) return;
    const client = clients.find(item => item.id === clientId);
    void loadQuestionnaireForSession(clientId, session.id, client).then(loaded => {
      setSelectedClient(current => {
        if (current !== clientId) return current;
        setCurrentAnalysis(previous => ({
          ...previous,
          medicalQuestionnaire: loaded.values as Record<string, unknown>,
        }));
        setQuestionnaireChangedFields(
          (loaded.status === 'final' ? loaded.changedFields : loaded.changedFields || []) as QuestionnaireFieldKey[],
        );
        return current;
      });
    });
  }, [sessions, clients]);

  // هنگام ترک صفحه، تغییرات معلق پرسشنامه در صف debounce فوری نوشته می‌شوند
  useEffect(() => () => {
    void flushMedicalQuestionnaireDrafts();
  }, []);

  const handleSave = useCallback(async (auto = false) => {
    if (!selectedClient || isReadOnly) return;
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const treatmentPlanJson = JSON.stringify(treatmentSteps);
      const existingId = editingAnalysisIdRef.current;
      const clientSession = resolveActiveSession(sessions, selectedClient);

      if (existingId) {
        await updateAnalysis(existingId, {
          ...currentAnalysis,
          treatmentPlan: treatmentPlanJson,
        });
      } else {
        const created = await addAnalysis({
          clientId: selectedClient,
          sessionId: clientSession?.id,
          type: 'trichologist',
          galleryItemId: selectedImage,
          ...currentAnalysis,
          treatmentPlan: treatmentPlanJson,
        });

        // بعد از اولین ذخیره (حتی auto)، ادامهٔ ذخیره باید update باشد نه create تکراری
        editingAnalysisIdRef.current = created.id;
        setEditingAnalysisId(created.id);
        setViewingAnalysis(created);
      }

      setLastSaved(new Date());

      if (!auto) {
        // ذخیرهٔ دستی نهایی فقط وقتی به نوبت فعال همین مراجعه لینک است
        if (clientSession?.status === 'scheduled') {
          const linkedSessionId = existingId
            ? (analyses.find(a => a.id === existingId)?.sessionId
              ?? viewingAnalysis?.sessionId
              ?? clientSession.id)
            : clientSession.id;
          if (linkedSessionId === clientSession.id) {
            await updateSession(clientSession.id, { status: 'completed' });
          }
        }
        // ذخیرهٔ دستی برای تحلیل جدید: فرم را پاک می‌کنیم؛ ویرایش فرم را نگه می‌دارد
        if (!existingId) {
          setSelectedClient('');
          setSelectedImage('');
          setTreatmentSteps([]);
          setCurrentAnalysis({
            medicalQuestionnaire: {},
            observations: [],
            recommendations: '',
            treatmentPlan: '',
          });
          editingAnalysisIdRef.current = null;
          setEditingAnalysisId(null);
          setIsReadOnly(false);
          setViewingAnalysis(null);
        }
        await fetchAnalyses();
        await fetchSessions();
      }
    } catch (e) {
      console.error(e);
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }, [
    selectedClient,
    isReadOnly,
    treatmentSteps,
    currentAnalysis,
    selectedImage,
    sessions,
    analyses,
    viewingAnalysis,
    updateAnalysis,
    addAnalysis,
    updateSession,
    fetchAnalyses,
    fetchSessions,
  ]);

  handleSaveRef.current = handleSave;

  // Auto-save: تایمر فقط با تغییر محتوا ریست می‌شود، نه با تغییر هویت handleSave
  useEffect(() => {
    if (isReadOnly || !selectedClient) return;
    const hasContent = Boolean(
      currentAnalysis.observations?.length ||
        currentAnalysis.recommendations ||
        treatmentSteps.length > 0
    );
    if (!hasContent) return;

    const timer = setTimeout(() => {
      void handleSaveRef.current(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [currentAnalysis, treatmentSteps, isReadOnly, selectedClient]);

  const resetForm = useCallback(() => {
    setSelectedClient('');
    setSelectedImage('');
    setTreatmentSteps([]);
    setQuestionnaireChangedFields([]);
    setCurrentAnalysis({
      medicalQuestionnaire: {},
      observations: [],
      recommendations: '',
      treatmentPlan: '',
    });
    editingAnalysisIdRef.current = null;
    setEditingAnalysisId(null);
    setIsReadOnly(false);
    setViewingAnalysis(null);
  }, []);

  const loadAnalysisForView = useCallback((analysis: Analysis, readOnly = true) => {
    setSelectedClient(analysis.clientId);
    setCurrentAnalysis({
      medicalQuestionnaire: analysis.medicalQuestionnaire || {},
      observations: analysis.observations || [],
      recommendations: analysis.recommendations || '',
      treatmentPlan: analysis.treatmentPlan || '',
    });
    const steps = parseStoredJson<unknown>(analysis.treatmentPlan || '[]', []);
      setTreatmentSteps(Array.isArray(steps) ? steps : []);
    setViewingAnalysis(analysis);
    setIsReadOnly(readOnly);
    const editId = readOnly ? null : analysis.id;
    editingAnalysisIdRef.current = editId;
    setEditingAnalysisId(editId);
    setActiveTab('basic');
  }, []);

  const handleEdit = useCallback(() => {
    if (viewingAnalysis) {
      setIsReadOnly(false);
      editingAnalysisIdRef.current = viewingAnalysis.id;
      setEditingAnalysisId(viewingAnalysis.id);
    }
  }, [viewingAnalysis]);

  const handleDelete = useCallback(
    async (analysisId: string) => {
      if (!confirm(t('deleteConfirm'))) return;
      await deleteAnalysis(analysisId);
      await fetchAnalyses();
      resetForm();
    },
    [t, deleteAnalysis, fetchAnalyses, resetForm]
  );

  const updateQuestionnaire = useCallback(
    (key: string, value: unknown) => {
      if (isReadOnly) return;
      setCurrentAnalysis(prev => {
        const medicalQuestionnaire = toQuestionnaireRecord(normalizeQuestionnaireValues({
          ...prev.medicalQuestionnaire,
          [key]: value,
        }));
        const session = resolveActiveSession(sessions, selectedClient);
        if (session && selectedClient) {
          saveMedicalQuestionnaireDraft(selectedClient, session.id, medicalQuestionnaire);
        }
        return { ...prev, medicalQuestionnaire };
      });
    },
    [isReadOnly, selectedClient, sessions]
  );

  const endVisit = useCallback(async () => {
    if (!selectedClient || isReadOnly) return;
    const session = resolveActiveSession(sessions, selectedClient);
    if (!session) return;
    setEndingVisit(true);
    try {
      // قبل از بستن، آخرین وضعیت را ذخیره کن (بدون بستن دوباره در handleSave)
      await handleSaveRef.current(true);
      await updateSession(session.id, { status: 'completed' });
      await fetchSessions();
      await fetchAnalyses();
      setSelectedClient('');
      setSelectedImage('');
      setTreatmentSteps([]);
      setCurrentAnalysis({
        medicalQuestionnaire: {},
        observations: [],
        recommendations: '',
        treatmentPlan: '',
      });
      editingAnalysisIdRef.current = null;
      setEditingAnalysisId(null);
      setIsReadOnly(false);
      setViewingAnalysis(null);
      setLastSaved(null);
    } finally {
      setEndingVisit(false);
    }
  }, [selectedClient, isReadOnly, sessions, updateSession, fetchSessions, fetchAnalyses]);

  const toggleObservation = useCallback(
    (id: string) => {
      if (isReadOnly) return;
      setCurrentAnalysis(prev => ({
        ...prev,
        observations: prev.observations?.includes(id)
          ? prev.observations.filter(o => o !== id)
          : [...(prev.observations || []), id],
      }));
    },
    [isReadOnly]
  );

  const setRecommendations = useCallback(
    (value: string) => {
      if (isReadOnly) return;
      setCurrentAnalysis(prev => ({ ...prev, recommendations: value }));
    },
    [isReadOnly]
  );

  const addTreatmentStep = useCallback(() => {
    if (isReadOnly) return;
    setTreatmentSteps(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: '',
        description: '',
        duration: '',
        products: '',
        cost: '',
      },
    ]);
  }, [isReadOnly]);

  const updateTreatmentStep = useCallback(
    (id: string, field: keyof TreatmentStep, value: string) => {
      if (isReadOnly) return;
      setTreatmentSteps(prev =>
        prev.map(step => (step.id === id ? { ...step, [field]: value } : step))
      );
    },
    [isReadOnly]
  );

  const removeTreatmentStep = useCallback(
    (id: string) => {
      if (isReadOnly) return;
      setTreatmentSteps(prev => prev.filter(step => step.id !== id));
    },
    [isReadOnly]
  );

  const getSelectedClient = useCallback(
    () => clients.find(c => c.id === selectedClient),
    [clients, selectedClient]
  );

  const currentTabIndex = tabs.findIndex(tab => tab.id === activeTab);
  const canPrev = currentTabIndex > 0;
  const canNext = currentTabIndex < tabs.length - 1;

  const goPrev = () => {
    if (canPrev) setActiveTab(tabs[currentTabIndex - 1].id);
  };

  const goNext = () => {
    if (canNext) setActiveTab(tabs[currentTabIndex + 1].id);
  };

  return {
    activeTab,
    setActiveTab,
    selectedClient,
    setSelectedClient: selectClient,
    selectedImage,
    setSelectedImage,
    treatmentSteps,
    currentAnalysis,
    saving,
    lastSaved,
    viewingAnalysis,
    isReadOnly,
    editingAnalysisId,
    clients,
    trichologistAnalyses,
    clientHistory,
    handleSave,
    resetForm,
    loadAnalysisForView,
    handleEdit,
    handleDelete,
    updateQuestionnaire,
    questionnaireChangedFields,
    toggleObservation,
    setRecommendations,
    addTreatmentStep,
    updateTreatmentStep,
    removeTreatmentStep,
    getSelectedClient,
    canPrev,
    canNext,
    goPrev,
    goNext,
    activeVisitSession,
    endingVisit,
    endVisit,
  };
}
