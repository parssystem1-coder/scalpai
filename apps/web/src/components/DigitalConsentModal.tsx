import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiFetch, ApiError } from "../api/client.js";
import { useSync } from "../offline/SyncProvider.js";
import SignatureCanvas, { type SignatureCanvasRef } from "./SignatureCanvas.js";

export interface ConsentRecord {
  id: string;
  patientId: string;
  serviceId?: string | null;
  templateVersion: string;
  signaturePayload: string;
  signedAt: string;
  signedFromIp?: string | null;
}

interface DigitalConsentModalProps {
  patientId: string;
  patientName: string;
  patientPhone: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DigitalConsentModal({
  patientId,
  patientName,
  patientPhone,
  isOpen,
  onClose,
}: DigitalConsentModalProps) {
  const { t } = useTranslation();
  const { isOnline, enqueue } = useSync();
  const qc = useQueryClient();
  const signatureRef = useRef<SignatureCanvasRef>(null);

  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [agreedPhotography, setAgreedPhotography] = useState(false);
  const [agreedAiAnalysis, setAgreedAiAnalysis] = useState(false);
  const [agreedDataPrivacy, setAgreedDataPrivacy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const consentsQuery = useQuery({
    queryKey: ["consents", patientId],
    queryFn: () => apiFetch<ConsentRecord[]>(`/patients/${patientId}/consents`),
    enabled: isOpen,
    retry: false,
  });

  const submitConsentMutation = useMutation({
    mutationFn: async (payload: { signaturePayload: string; templateVersion: string }) => {
      if (!isOnline) {
        await enqueue("consents" as "patients", "create", {
          patientId,
          ...payload,
        });
        return {
          id: `local-${Date.now()}`,
          patientId,
          templateVersion: payload.templateVersion,
          signaturePayload: payload.signaturePayload,
          signedAt: new Date().toISOString(),
        } as ConsentRecord;
      }
      return apiFetch<ConsentRecord>(`/patients/${patientId}/consents`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setSuccessMsg("فرم رضایت‌نامه با موفقیت ثبت و به پرونده بیمار ضمیمه گردید.");
      setErrorMsg(null);
      signatureRef.current?.clear();
      setAgreedPhotography(false);
      setAgreedAiAnalysis(false);
      setAgreedDataPrivacy(false);
      void qc.invalidateQueries({ queryKey: ["consents", patientId] });
      setTimeout(() => {
        setActiveTab("history");
        setSuccessMsg(null);
      }, 1200);
    },
    onError: (err: unknown) => {
      const msg = err instanceof ApiError ? `[${err.code}] ${err.message}` : String(err);
      setErrorMsg(msg);
      setSuccessMsg(null);
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!agreedPhotography || !agreedAiAnalysis || !agreedDataPrivacy) {
      setErrorMsg("لطفاً تمامی بندهای رضایت‌نامه بالینی را تایید فرمایید.");
      return;
    }

    const sigData = signatureRef.current?.toDataURL();
    if (!sigData || signatureRef.current?.isEmpty()) {
      setErrorMsg("ثبت امضای دیجیتال بیمار الزامی است.");
      return;
    }

    submitConsentMutation.mutate({
      signaturePayload: sigData,
      templateVersion: "v1.0-standard-trichology",
    });
  };

  const historyList = consentsQuery.data ?? [];

  return (
    <div
      id="consent-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="consent-modal-container"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#FAF7F2] text-stone-800 shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">
              فرم رضایت دیجیتال بیمار (Digital Consent)
            </h2>
            <p className="text-xs text-stone-500">
              پرونده: <span className="font-medium text-stone-800">{patientName}</span> ({patientPhone})
            </p>
          </div>
          <button
            id="close-consent-modal-btn"
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-stone-200 bg-stone-100/70 px-6 pt-2">
          <button
            id="tab-new-consent"
            type="button"
            onClick={() => setActiveTab("new")}
            className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "new"
                ? "border-[#C9906A] text-[#9A643E]"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            ثبت رضایت‌نامه جدید
          </button>
          <button
            id="tab-history-consent"
            type="button"
            onClick={() => setActiveTab("history")}
            className={`border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "history"
                ? "border-[#C9906A] text-[#9A643E]"
                : "border-transparent text-stone-500 hover:text-stone-800"
            }`}
          >
            تاریخچه رضایت‌نامه‌ها ({historyList.length})
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "new" ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Clinical Clauses */}
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 text-sm leading-relaxed text-stone-700">
                <div className="mb-2 font-bold text-amber-950">
                  مفاد رضایت‌آگاهانه خدمات تریکولوژی و تصویربرداری درماتوسکوپی:
                </div>
                <ul className="list-inside list-disc space-y-1.5 text-xs text-stone-600">
                  <li>
                    اینجانب رضایت خود را جهت انجام تصویربرداری ماکرو و درماتوسکوپی دیجیتال از پوست سر و ساقه مو اعلام می‌دارم.
                  </li>
                  <li>
                    موافقت می‌نمایم داده‌های تصویربرداری جهت پایش روند درمان و آنالیز شدت علائم بالینی (تراکم، قرمزی و پوسته‌ریزی) با حفظ کامل حریم خصوصی پردازش گردند.
                  </li>
                  <li>
                    از برنامه‌های مراقبتی، توصیه‌های بهداشتی و پروتکل‌های پیگیری کلینیک مطلع شده‌ام.
                  </li>
                </ul>
              </div>

              {/* Checkboxes */}
              <div className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-4 text-xs font-medium text-stone-700">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    id="consent-check-photo"
                    type="checkbox"
                    checked={agreedPhotography}
                    onChange={(e) => setAgreedPhotography(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-stone-300 text-[#C9906A] focus:ring-[#C9906A]"
                  />
                  <span>تایید رضایت تصویربرداری تشخیصی تریکوسکوپی و ثبت در پرونده</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    id="consent-check-ai"
                    type="checkbox"
                    checked={agreedAiAnalysis}
                    onChange={(e) => setAgreedAiAnalysis(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-stone-300 text-[#C9906A] focus:ring-[#C9906A]"
                  />
                  <span>موافقت با تحلیل کمکی الگوهای پوست سر و پردازش شاخص‌های تریکولوژی</span>
                </label>

                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    id="consent-check-privacy"
                    type="checkbox"
                    checked={agreedDataPrivacy}
                    onChange={(e) => setAgreedDataPrivacy(e.target.checked)}
                    className="h-4 w-4 rounded-sm border-stone-300 text-[#C9906A] focus:ring-[#C9906A]"
                  />
                  <span>تایید صحت اطلاعات شناسنامه‌ای و آگاهی از شرایط محرمانگی داده‌ها</span>
                </label>
              </div>

              {/* Signature Canvas Area */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-700">
                    امضای الکترونیکی بیمار (Touch / Pen):
                  </span>
                  <button
                    id="clear-signature-btn"
                    type="button"
                    onClick={() => signatureRef.current?.clear()}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-800 underline"
                  >
                    پاک کردن امضا
                  </button>
                </div>
                <SignatureCanvas ref={signatureRef} id="patient-touch-signature" />
              </div>

              {/* Status messages */}
              {errorMsg && (
                <div id="consent-error-box" className="rounded-lg bg-red-50 p-3 text-xs text-red-700" role="alert">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div id="consent-success-box" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">
                  {successMsg}
                </div>
              )}

              {/* Submit button */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                >
                  انصراف
                </button>
                <button
                  id="submit-consent-btn"
                  type="submit"
                  disabled={submitConsentMutation.isPending}
                  className="rounded-xl bg-[#C9906A] px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-[#B37B55] disabled:opacity-50"
                >
                  {submitConsentMutation.isPending ? "در حال ثبت..." : "تایید و ثبت نهایی رضایت‌نامه"}
                </button>
              </div>
            </form>
          ) : (
            /* History Tab */
            <div className="space-y-4">
              {consentsQuery.isLoading ? (
                <p className="text-center text-xs text-stone-500">{t("common.loading")}</p>
              ) : historyList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-xs text-stone-500">
                  هیچ رضایت‌نامه‌ای برای این بیمار ثبت نشده است.
                </div>
              ) : (
                historyList.map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-xs md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          معتبر
                        </span>
                        <span className="text-xs font-semibold text-stone-700">
                          قالب: {c.templateVersion}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-stone-500">
                        زمان ثبت: {new Date(c.signedAt).toLocaleString("fa-IR")}
                      </p>
                    </div>

                    {c.signaturePayload ? (
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-stone-400 mb-1">امضای ثبت شده</span>
                        <img
                          src={c.signaturePayload}
                          alt="امضای بیمار"
                          className="h-14 max-w-[140px] rounded border border-stone-200 bg-stone-50 object-contain p-1"
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
