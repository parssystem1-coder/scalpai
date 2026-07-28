import { useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, Edit2, FileText, Loader, Search, User } from 'lucide-react';
import type { Analysis, Session } from '../db';
import { useClientsStore, useSessionsStore } from '../store';
import { useLang, useT } from '../i18n';
import EndVisitButton from '../components/EndVisitButton';
import {
  finalizeQuestionnaireRevision,
  flushMedicalQuestionnaireDrafts,
  loadQuestionnaireForSession,
  reopenQuestionnaireForEdit,
  saveMedicalQuestionnaireDraft,
} from '../lib/medicalQuestionnaireDraft';
import {
  normalizeQuestionnaireValues,
  toQuestionnaireRecord,
  type MedicalQuestionnaireStructured,
  type QuestionnaireFieldKey,
} from '../lib/medicalQuestionnaireSchema';
import { resolveActiveSession } from '../lib/sessionVisit';
import QuestionnaireTab from './trichologist-analysis/QuestionnaireTab';
import { trichoDict } from './trichologist-analysis/strings';

export default function MedicalQuestionnaire() {
  const { clients, fetchClients } = useClientsStore();
  const { sessions, fetchSessions, updateSession } = useSessionsStore();
  const { isRtl } = useLang();
  const t = useT(trichoDict);
  const [search, setSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [questionnaire, setQuestionnaire] = useState<MedicalQuestionnaireStructured>(
    normalizeQuestionnaireValues({}),
  );
  const [status, setStatus] = useState<'draft' | 'final'>('draft');
  const [changedFields, setChangedFields] = useState<QuestionnaireFieldKey[]>([]);
  const [seededFromPrevious, setSeededFromPrevious] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [everFinalized, setEverFinalized] = useState(false);
  const [endingVisit, setEndingVisit] = useState(false);

  useEffect(() => {
    void fetchClients();
    void fetchSessions();
  }, [fetchClients, fetchSessions]);

  useEffect(() => () => {
    void flushMedicalQuestionnaireDrafts();
  }, []);

  const scheduledByClient = useMemo(() => {
    const map = new Map<string, Session>();
    for (const client of clients) {
      const session = resolveActiveSession(sessions, client.id);
      if (session) map.set(client.id, session);
    }
    return map;
  }, [clients, sessions]);

  const eligibleClients = useMemo(() => {
    const query = search.trim().toLowerCase();
    return clients.filter(client => {
      if (!scheduledByClient.has(client.id)) return false;
      return !query || `${client.firstName} ${client.lastName} ${client.phone}`.toLowerCase().includes(query);
    });
  }, [clients, scheduledByClient, search]);

  const selectedClient = clients.find(client => client.id === selectedClientId);
  const selectedSession = scheduledByClient.get(selectedClientId);
  const isFinal = status === 'final';

  const selectClient = (clientId: string) => {
    const session = scheduledByClient.get(clientId);
    const client = clients.find(item => item.id === clientId);
    setSelectedClientId(clientId);
    setSavedAt(null);
    setQuestionnaire(normalizeQuestionnaireValues({}));
    setStatus('draft');
    setChangedFields([]);
    setSeededFromPrevious(false);
    setEverFinalized(false);
    if (!session) return;
    setLoadingForm(true);
    void loadQuestionnaireForSession(clientId, session.id, client).then(loaded => {
      setSelectedClientId(current => {
        if (current !== clientId) return current;
        setQuestionnaire(loaded.values);
        setStatus(loaded.status);
        setChangedFields((loaded.changedFields || []) as QuestionnaireFieldKey[]);
        setSeededFromPrevious(loaded.seededFromPrevious);
        setEverFinalized(loaded.status === 'final' || (loaded.changedFields || []).length > 0);
        setLoadingForm(false);
        return current;
      });
    }).catch(() => setLoadingForm(false));
  };

  const updateQuestionnaire = (key: string, value: unknown) => {
    if (!selectedSession || isFinal) return;
    setQuestionnaire(previous => {
      const next = normalizeQuestionnaireValues({ ...previous, [key]: value });
      saveMedicalQuestionnaireDraft(selectedClientId, selectedSession.id, next);
      return next;
    });
    setSavedAt(new Date());
    setSeededFromPrevious(false);
  };

  const handleFinalize = async () => {
    if (!selectedSession || busy) return;
    setBusy(true);
    try {
      const revision = await finalizeQuestionnaireRevision(
        selectedClientId,
        selectedSession.id,
        questionnaire,
      );
      setStatus('final');
      setChangedFields((revision.changedFields || []) as QuestionnaireFieldKey[]);
      setQuestionnaire(normalizeQuestionnaireValues(revision.values));
      setSeededFromPrevious(false);
      setEverFinalized(true);
      setSavedAt(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  const handleReopenEdit = async () => {
    if (!selectedSession || busy) return;
    setBusy(true);
    try {
      await reopenQuestionnaireForEdit(selectedClientId, selectedSession.id, questionnaire);
      setStatus('draft');
      setSavedAt(new Date());
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  const handleEndVisit = async () => {
    if (!selectedSession || endingVisit) return;
    setEndingVisit(true);
    try {
      await updateSession(selectedSession.id, { status: 'completed' });
      await fetchSessions();
      setSelectedClientId('');
      setQuestionnaire(normalizeQuestionnaireValues({}));
      setStatus('draft');
      setChangedFields([]);
      setSeededFromPrevious(false);
      setEverFinalized(false);
      setSavedAt(null);
    } finally {
      setEndingVisit(false);
    }
  };

  const currentAnalysis: Partial<Analysis> = {
    clientId: selectedClientId,
    medicalQuestionnaire: toQuestionnaireRecord(questionnaire),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-3 rounded-xl bg-blue-500/15 text-blue-300">
          <FileText size={24} />
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {isRtl ? 'پرسشنامه پزشکی' : 'Medical Questionnaire'}
          </h1>
          <p className="text-sm opacity-55 mt-1">
            {isRtl
              ? 'مراجعه‌کننده دارای نوبت را انتخاب کنید؛ پس از تکمیل، ثبت نهایی کنید تا در تحلیل تریکولوژیست در دسترس باشد.'
              : 'Select a client with an appointment. Finalize when done so Trichologist Analysis can use it.'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-4">
        <div className="relative">
          <Search className="absolute top-1/2 -translate-y-1/2 start-4 opacity-45" size={19} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={isRtl ? 'جستجوی مراجعه‌کننده دارای نوبت...' : 'Search clients with appointments...'}
            className="w-full ps-11 pe-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {eligibleClients.length === 0 ? (
          <div className="py-8 text-center opacity-50">
            <User size={32} className="mx-auto mb-2 opacity-40" />
            {isRtl ? 'مراجعه‌کننده‌ای با نوبت فعال وجود ندارد' : 'No client has an active appointment'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-52 overflow-y-auto">
            {eligibleClients.map(client => {
              const session = scheduledByClient.get(client.id)!;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => selectClient(client.id)}
                  className={`p-3 rounded-xl text-start border transition ${
                    selectedClientId === client.id
                      ? 'bg-blue-500/20 border-blue-400'
                      : 'bg-white/5 border-transparent hover:bg-white/10'
                  }`}
                >
                  <p className="font-medium">{client.firstName} {client.lastName}</p>
                  <p className="text-xs opacity-55 mt-1 flex items-center gap-1.5">
                    <Calendar size={13} />
                    {session.date} · {session.time}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedClient && selectedSession ? (
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-5">
          <EndVisitButton
            visible
            busy={endingVisit}
            label={t('endVisit')}
            hint={t('endVisitHint')}
            onEnd={handleEndVisit}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="font-semibold">{selectedClient.firstName} {selectedClient.lastName}</p>
              <p className="text-xs opacity-50 mt-1">{selectedClient.phone}</p>
              {seededFromPrevious && !isFinal && (
                <p className="text-xs text-amber-300/90 mt-2">{t('seededFromPreviousHint')}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`text-xs px-2.5 py-1 rounded-lg border ${
                  isFinal
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                    : 'bg-white/5 text-white/70 border-white/10'
                }`}
              >
                {isFinal ? t('statusFinal') : t('statusDraft')}
              </span>
              <p className="text-xs text-emerald-300/80">
                {savedAt
                  ? (isRtl ? `ذخیره: ${savedAt.toLocaleTimeString('fa-IR')}` : `Saved: ${savedAt.toLocaleTimeString()}`)
                  : (isRtl ? 'ذخیره خودکار پیش‌نویس فعال است' : 'Draft auto-save is active')}
              </p>
              {isFinal ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleReopenEdit()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/20 text-blue-200 hover:bg-blue-500/30 text-sm disabled:opacity-50"
                >
                  <Edit2 size={15} />
                  {t('reopenEdit')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleFinalize()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm disabled:opacity-50"
                >
                  {busy ? <Loader size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {busy ? t('finalizing') : (everFinalized ? t('updateFinal') : t('finalize'))}
                </button>
              )}
            </div>
          </div>

          {loadingForm ? (
            <div className="py-10 text-center opacity-50">
              <Loader className="animate-spin mx-auto mb-3" size={28} />
              <p className="text-sm">{isRtl ? 'در حال بارگذاری...' : 'Loading...'}</p>
            </div>
          ) : (
            <QuestionnaireTab
              currentAnalysis={currentAnalysis}
              isReadOnly={isFinal}
              updateQuestionnaire={updateQuestionnaire}
              changedFields={changedFields}
              showDemographics
            />
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 py-12 text-center opacity-45">
          {isRtl ? 'برای تکمیل پرسشنامه، ابتدا مراجعه‌کننده را انتخاب کنید' : 'Select a client to complete the questionnaire'}
        </div>
      )}
    </div>
  );
}
