import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, ApiError } from "../api/client.js";
import "./aftercare.i18n.js";

/**
 * موج ۴ (D12) — UI aftercare: دو پنل، دنباله‌ها و ثبت‌نام‌ها.
 *
 * همه‌ی endpointها از قبل موجودند و پشت `@RequireFeature("aftercare")` و
 * `@Quota("messages")` هستند — این صفحه فقط وب است. قیدهای سرویس (فعالِ
 * بی‌گام ممنوع، trigger=session_completed نیازمند serviceId، گام‌های
 * صعودی بی‌تکرار) را UI هم رعایت می‌کند تا ۴۰۰ بی‌دلیل رد نشود.
 */

interface StepRow {
  offsetHours: number;
  channel: string;
  templateKey: string;
  vars?: Record<string, string>;
}

interface SequenceRow {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  serviceId: string | null;
  locale: string;
  steps: StepRow[];
  active: boolean;
}

interface EnrollmentRow {
  id: string;
  sequenceId: string;
  patientId: string;
  state: string;
  currentStep: number;
  stepsSnapshot: StepRow[];
  nextRunAt: string | null;
}

interface ServiceRow {
  id: string;
  name: string;
}

interface PatientRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
}

const TEMPLATE_KEYS = [
  "aftercare.day1",
  "aftercare.day3",
  "aftercare.week2",
  "aftercare.month1",
  "session.reminder",
  "invoice.issued",
  "invoice.paid",
] as const;

const CHANNELS = ["kavenegar", "smsir", "bale"] as const;
const TRIGGERS = ["manual", "session_completed", "analysis_created", "invoice_paid"] as const;

export const AftercarePage: React.FC = () => {
  const { t } = useTranslation();

  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [busy, setBusy] = useState(false);

  // فرم دنباله: نام + trigger (+ serviceId برای session_completed) + یک گام اول.
  const [seqName, setSeqName] = useState("");
  const [seqTrigger, setSeqTrigger] = useState("manual");
  const [seqServiceId, setSeqServiceId] = useState("");
  const [seqOffset, setSeqOffset] = useState("24");
  const [seqChannel, setSeqChannel] = useState("kavenegar");
  const [seqTemplate, setSeqTemplate] = useState("aftercare.day1");

  // فرم ثبت‌نام.
  const [enrollSequence, setEnrollSequence] = useState("");
  const [enrollPatient, setEnrollPatient] = useState("");

  const seqNameFor = useCallback(
    (id: string) => sequences.find((s) => s.id === id)?.name ?? t("aftercare.unknownSequence"),
    [sequences, t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [seqs, enrolls, svcs, pats] = await Promise.all([
        apiFetch<SequenceRow[]>("/aftercare/sequences?limit=50"),
        apiFetch<EnrollmentRow[]>("/aftercare/enrollments?limit=50"),
        apiFetch<ServiceRow[]>("/services"),
        apiFetch<PatientRow[]>("/patients?limit=100"),
      ]);
      setSequences(Array.isArray(seqs) ? seqs : []);
      setEnrollments(Array.isArray(enrolls) ? enrolls : []);
      setServices(Array.isArray(svcs) ? svcs : []);
      setPatients(Array.isArray(pats) ? pats : []);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setQuotaExceeded(true);
      // خطای خام ممکن است داده‌ی حساس داشته باشد: پیام عمومی، بدون لاگ.
      setError(t("aftercare.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.code === "QUOTA_EXCEEDED") {
        setQuotaExceeded(true);
      } else {
        setActionError(t("aftercare.actionFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  const createSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    const offset = Number(seqOffset);
    const steps =
      Number.isFinite(offset) && offset >= 0
        ? [{ offsetHours: offset, channel: seqChannel, templateKey: seqTemplate }]
        : [];
    await run(() =>
      apiFetch("/aftercare/sequences", {
        method: "POST",
        body: JSON.stringify({
          name: seqName,
          trigger: seqTrigger,
          ...(seqTrigger === "session_completed" && seqServiceId ? { serviceId: seqServiceId } : {}),
          steps,
          active: steps.length > 0,
        }),
      }),
    );
    setSeqName("");
  };

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(() =>
      apiFetch("/aftercare/enrollments", {
        method: "POST",
        body: JSON.stringify({ sequenceId: enrollSequence, patientId: enrollPatient }),
      }),
    );
    setEnrollPatient("");
  };

  const act = (id: string, action: string) =>
    run(() =>
      apiFetch(`/aftercare/enrollments/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    );

  return (
    <main
      className="min-h-screen bg-[oklch(85%_0.03_28)] p-4 md:p-8"
      aria-labelledby="aftercare-title"
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-6">
          <h1 id="aftercare-title" className="text-2xl font-black">{t("aftercare.title")}</h1>
          <p className="mt-1 text-sm opacity-65">{t("aftercare.subtitle")}</p>
        </header>

        {quotaExceeded && (
          <div
            role="alert"
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"
            data-testid="aftercare-quota-cta"
          >
            <p className="text-sm font-bold text-amber-900">{t("aftercare.quotaExceeded")}</p>
            <a
              href="/usage"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
            >
              {t("aftercare.upgradeCta")}
            </a>
          </div>
        )}

        {loading && <p className="text-sm opacity-60">{t("aftercare.loading")}</p>}
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {actionError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── پنل ۱: دنباله‌ها ─────────────────────────────── */}
          <section aria-labelledby="seq-title" className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm">
            <h2 id="seq-title" className="mb-3 text-lg font-black">{t("aftercare.sequencesTitle")}</h2>

            <form
              onSubmit={(e) => void createSequence(e)}
              className="mb-4 rounded-xl border border-white bg-white/80 p-3"
              data-testid="seq-form"
            >
              <label className="block text-sm font-bold">
                {t("aftercare.name")}
                <input
                  required
                  value={seqName}
                  onChange={(e) => setSeqName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="mt-2 block text-sm font-bold">
                {t("aftercare.triggerLabel")}
                <select
                  value={seqTrigger}
                  onChange={(e) => setSeqTrigger(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  data-testid="seq-trigger"
                >
                  {TRIGGERS.map((tr) => (
                    <option key={tr} value={tr}>{t(`aftercare.trigger.${tr}`)}</option>
                  ))}
                </select>
              </label>
              {seqTrigger === "session_completed" && (
                <label className="mt-2 block text-sm font-bold">
                  {t("aftercare.service")}
                  <select
                    required
                    value={seqServiceId}
                    onChange={(e) => setSeqServiceId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{t("aftercare.pick")}</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <fieldset className="mt-2">
                <legend className="text-sm font-bold">{t("aftercare.firstStep")}</legend>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs">
                    {t("aftercare.offsetHours")}
                    <input
                      type="number"
                      min="0"
                      value={seqOffset}
                      onChange={(e) => setSeqOffset(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                      dir="ltr"
                    />
                  </label>
                  <label className="text-xs">
                    {t("aftercare.channel")}
                    <select
                      value={seqChannel}
                      onChange={(e) => setSeqChannel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                    >
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    {t("aftercare.template")}
                    <select
                      value={seqTemplate}
                      onChange={(e) => setSeqTemplate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                    >
                      {TEMPLATE_KEYS.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="mt-1 text-xs opacity-60">{t("aftercare.offsetNote")}</p>
              </fieldset>
              <button
                type="submit"
                disabled={busy || seqName.trim().length === 0}
                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {t("aftercare.createSequence")}
              </button>
            </form>

            {sequences.length === 0 && !loading && (
              <p className="text-sm opacity-60">{t("aftercare.noSequences")}</p>
            )}
            <ul className="space-y-2">
              {sequences.map((s) => (
                <li key={s.id} className="rounded-xl border border-white bg-white/80 p-3" data-testid={`seq-${s.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{s.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${s.active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {s.active ? t("aftercare.active") : t("aftercare.inactive")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-70">
                    {t(`aftercare.trigger.${s.trigger}`)} · {t("aftercare.stepsCount", { count: s.steps.length })}
                  </p>
                  <ol className="mt-1 space-y-0.5 text-xs opacity-80">
                    {s.steps.map((st, i) => (
                      <li key={i} dir="ltr">
                        +{st.offsetHours}h · {st.channel} · {st.templateKey}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </section>

          {/* ── پنل ۲: ثبت‌نام‌ها ────────────────────────────── */}
          <section aria-labelledby="enroll-title" className="rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm">
            <h2 id="enroll-title" className="mb-3 text-lg font-black">{t("aftercare.enrollmentsTitle")}</h2>

            <form
              onSubmit={(e) => void enroll(e)}
              className="mb-4 rounded-xl border border-white bg-white/80 p-3"
              data-testid="enroll-form"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  {t("aftercare.sequence")}
                  <select
                    required
                    value={enrollSequence}
                    onChange={(e) => setEnrollSequence(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{t("aftercare.pick")}</option>
                    {sequences.filter((s) => s.active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold">
                  {t("aftercare.patient")}
                  <select
                    required
                    value={enrollPatient}
                    onChange={(e) => setEnrollPatient(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{t("aftercare.pick")}</option>
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName} — {p.phone}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="submit"
                disabled={busy || !enrollSequence || !enrollPatient}
                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {t("aftercare.enroll")}
              </button>
            </form>

            {enrollments.length === 0 && !loading && (
              <p className="text-sm opacity-60">{t("aftercare.noEnrollments")}</p>
            )}
            <ul className="space-y-2">
              {enrollments.map((en) => (
                <li key={en.id} className="rounded-xl border border-white bg-white/80 p-3" data-testid={`enroll-${en.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">{seqNameFor(en.sequenceId)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      en.state === "active" ? "bg-emerald-100 text-emerald-800"
                      : en.state === "paused" ? "bg-amber-100 text-amber-800"
                      : "bg-slate-200 text-slate-700"
                    }`}>
                      {t(`aftercare.enrollState.${en.state}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs opacity-70">
                    {t("aftercare.stepProgress", { current: en.currentStep, total: en.stepsSnapshot.length })}
                  </p>
                  {en.state === "active" || en.state === "paused" ? (
                    <div className="mt-2 flex gap-2">
                      {en.state === "active" ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(en.id, "pause")}
                          className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-bold text-amber-800 disabled:opacity-40"
                        >
                          {t("aftercare.pause")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void act(en.id, "resume")}
                          className="rounded-lg border border-emerald-300 px-3 py-1 text-xs font-bold text-emerald-800 disabled:opacity-40"
                        >
                          {t("aftercare.resume")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act(en.id, "cancel")}
                        className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-700 disabled:opacity-40"
                      >
                        {t("aftercare.cancel")}
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
};

export default AftercarePage;
