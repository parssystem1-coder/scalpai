import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Printer,
  Download,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Award,
  Calendar,
} from "lucide-react";
import { formatToJalali } from "@scalpai/shared";
import DialogPrimitive from "./DialogPrimitive";

export interface ReportProvenance {
  /** Server-issued report id — present only when a sealed report exists. */
  reportId?: string;
  /** Server-side Ed25519 seal. Without it the report must claim nothing. */
  signature?: string;
  contentHash?: string;
  sealedAt?: string;
  /** Intake metadata as actually recorded by the server. */
  areas?: string;
  lens?: string;
  medicalLicense?: string;
  doctorName?: string;
  clinicName?: string;
}

interface ClinicalPdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName?: string;
  patientPhone?: string;
  patientId?: string;
  /** Clinical values come from the caller's data — there are no defaults. */
  density?: number;
  miniaturization?: number;
  erythema?: number;
  sebum?: number;
  diagnosis?: string;
  /** Server provenance. `undefined` forces the explicit unverified state. */
  provenance?: ReportProvenance;
}

const NOT_PROVIDED = "dashboard.pdfReport.notProvided";

/**
 * Renders `label: value`, or the explicit not-provided placeholder.
 * This replaces the old default-props pattern: a half-wired caller must never
 * print a fictional patient on a clinical artifact.
 */
function Field({
  labelKey,
  value,
  mono = false,
  notProvided,
}: {
  labelKey: string;
  value: string | number | undefined;
  mono?: boolean;
  notProvided: string;
}) {
  const empty = value === undefined || value === "";
  return (
    <div>
      <span className="text-stone-500">{labelKey}</span>{" "}
      {empty ? (
        <span className="italic text-stone-400">{notProvided}</span>
      ) : (
        <span className={mono ? "font-mono text-stone-800" : "text-stone-800"}>{value}</span>
      )}
    </div>
  );
}

/**
 * Clinical report modal (P4-B02 / F19 remediation — Phase 4 Wave 1).
 *
 * This artifact used to fabricate its own authenticity: a Math.random report
 * id, a literal fake SHA-256, a fake portal URL with a made-up token, a
 * hardcoded licence/lens/areas block, fictional default PHI and an
 * unconditional "VERIFIED" stamp — while the backend already issues real
 * Ed25519 report seals. All of it is gone:
 *
 *  - No default PHI and no client-side identity: every unset field renders the
 *    not-provided placeholder; ids and hashes come only from `provenance`.
 *  - No authenticity claim without a server seal: the footer flips to an
 *    explicit UNVERIFIED state unless reportId + signature are present.
 */
export default function ClinicalPdfReportModal({
  isOpen,
  onClose,
  patientName,
  patientPhone,
  patientId,
  density,
  miniaturization,
  erythema,
  sebum,
  diagnosis,
  provenance,
}: ClinicalPdfReportModalProps) {
  const { t, i18n } = useTranslation();
  const reportRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const jalaliDate = formatToJalali(now);
  const gregorianDate = now.toISOString().split("T")[0];
  const isFa = i18n.language === "fa";
  const notProvided = t(NOT_PROVIDED);
  const reportId = provenance?.reportId;
  const isSealed = Boolean(provenance?.reportId && provenance?.signature);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // In browser, trigger window.print to Save as PDF
    window.print();
  };

  return (
    <DialogPrimitive
      isOpen={isOpen}
      onClose={onClose}
      aria-label={t("dashboard.pdfReport.previewTitle")}
      className="relative my-auto w-full max-w-4xl rounded-3xl bg-white text-stone-900 shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[94vh]"
      backdropClassName="bg-stone-950/80 p-2 md:p-6 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
    >
      <div id="pdf-report-modal" dir={isFa ? "rtl" : "ltr"}>
        {/* Top Floating Action Bar (Hidden on Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-b border-stone-200 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[oklch(62%_0.09_16)]" />
            <h3 className="font-bold text-sm text-stone-800">
              {t("dashboard.pdfReport.previewTitle")}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t("dashboard.pdfReport.print")}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[oklch(62%_0.09_16)] text-white hover:brightness-110 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("dashboard.pdfReport.download")}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-stone-300 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* The Formal Document Sheet (Optimized for A4 Print) */}
        <div
          ref={reportRef}
          className="p-6 md:p-10 overflow-y-auto flex-1 bg-white print:p-0 print:overflow-visible space-y-6 text-stone-900 font-sans"
        >
          {/* Document Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b-2 border-stone-900">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[oklch(62%_0.09_16)] text-white flex items-center justify-center font-bold text-sm">
                  S
                </div>
                <h1 className="text-xl font-bold tracking-tight text-stone-950">
                  {provenance?.clinicName ?? notProvided}
                </h1>
              </div>
              <p className="text-xs text-stone-600 font-medium">
                {t("dashboard.pdfReport.subtitle")}
              </p>
            </div>

            <div className="text-left sm:text-left text-xs font-mono space-y-0.5 bg-stone-50 p-3 rounded-xl border border-stone-200">
              <Field
                labelKey={t("dashboard.pdfReport.fileNumber")}
                value={patientId}
                mono
                notProvided={notProvided}
              />
              <Field
                labelKey={t("dashboard.pdfReport.reportId")}
                value={reportId}
                mono
                notProvided={notProvided}
              />
              <div className="flex items-center gap-1 mt-1 text-emerald-700 font-bold">
                <Calendar className="w-3.5 h-3.5" />
                <span>{jalaliDate} ({gregorianDate})</span>
              </div>
            </div>
          </div>

          {/* Patient Demographics & Doctor Info Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
            <div className="space-y-1.5">
              <Field
                labelKey={t("dashboard.pdfReport.patientNameLabel")}
                value={patientName}
                notProvided={notProvided}
              />
              <Field
                labelKey={t("dashboard.pdfReport.phoneLabel")}
                value={patientPhone}
                mono
                notProvided={notProvided}
              />
              <Field
                labelKey={t("dashboard.pdfReport.doctorLabel")}
                value={provenance?.doctorName}
                notProvided={notProvided}
              />
            </div>
            <div className="space-y-1.5 sm:text-left">
              <Field
                labelKey={t("dashboard.pdfReport.areasLabel")}
                value={provenance?.areas}
                notProvided={notProvided}
              />
              <Field
                labelKey={t("dashboard.pdfReport.lensLabel")}
                value={provenance?.lens}
                mono
                notProvided={notProvided}
              />
              <Field
                labelKey={t("dashboard.pdfReport.medicalLicense")}
                value={provenance?.medicalLicense}
                mono
                notProvided={notProvided}
              />
            </div>
          </div>

          {/* Trichometric Biometric Measurements Grid */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
              <span>{t("dashboard.pdfReport.metricsTitle")}</span>
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("dashboard.pdfReport.densityLabel")}</div>
                <div className="text-xl font-black text-stone-900 mt-1">
                  {density ?? <span className="italic text-stone-400">{notProvided}</span>}{" "}
                  <span className="text-xs font-normal text-stone-500">{t("dashboard.pdfReport.densityUnit")}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("dashboard.pdfReport.anisotrichosis")}</div>
                <div className="text-xl font-black text-amber-600 mt-1">
                  {miniaturization === undefined ? (
                    <span className="italic text-stone-400">{notProvided}</span>
                  ) : (
                    `${miniaturization}%`
                  )}{" "}
                  <span className="text-xs font-normal text-stone-500">{t("dashboard.pdfReport.diameterVar")}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("dashboard.pdfReport.erythemaLabel")}</div>
                <div className="text-xl font-black text-red-600 mt-1">
                  {erythema ?? <span className="italic text-stone-400">{notProvided}</span>}{" "}
                  <span className="text-xs font-normal text-stone-500">{t("dashboard.pdfReport.outOf")}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("dashboard.pdfReport.sebumLabel")}</div>
                <div className="text-xl font-black text-stone-900 mt-1">
                  {sebum ?? <span className="italic text-stone-400">{notProvided}</span>}{" "}
                  <span className="text-xs font-normal text-stone-500">{t("dashboard.pdfReport.outOf")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Clinical Findings & Formal Diagnosis */}
          <div className="p-4 rounded-2xl border-2 border-stone-300 bg-stone-50/60 space-y-2">
            <h4 className="text-xs font-bold text-stone-900 uppercase">{t("dashboard.pdfReport.diagnosisTitle")}</h4>
            <p className="text-sm font-bold text-stone-950 leading-relaxed">
              {diagnosis ?? <span className="italic text-stone-400">{notProvided}</span>}
            </p>
          </div>

          {/* Provenance footer — the only place an authenticity claim may live */}
          <div className="pt-4 border-t border-stone-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8 text-[10px] text-stone-500 leading-relaxed space-y-1">
              {isSealed ? (
                <>
                  <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{t("dashboard.pdfReport.sealedTitle")}</span>
                  </div>
                  <p>{t("dashboard.pdfReport.sealedText")}</p>
                  <div className="font-mono text-[9px] pt-1 break-all text-stone-400">
                    SHA256: {provenance?.contentHash}
                  </div>
                  <div className="font-mono text-[9px] break-all text-stone-400">
                    {t("dashboard.pdfReport.sealedAt")}: {provenance?.sealedAt}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1.5 font-bold text-amber-700">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{t("dashboard.pdfReport.unverifiedTitle")}</span>
                  </div>
                  <p>{t("dashboard.pdfReport.unverifiedText")}</p>
                </>
              )}
            </div>

            {/* Doctor Seal & Stamp */}
            <div className="md:col-span-4 p-3 rounded-2xl border border-dashed border-stone-300 text-center space-y-1 bg-stone-50">
              <div className="text-[10px] font-medium text-stone-500">{t("dashboard.pdfReport.doctorStamp")}</div>
              <div className="mt-1 text-xs font-bold text-stone-900">
                {provenance?.doctorName ?? notProvided}
              </div>
              {isSealed ? (
                <div className="text-[10px] font-semibold text-emerald-700">
                  {t("dashboard.pdfReport.sealedBadge")}
                </div>
              ) : (
                <div className="text-[10px] font-semibold text-amber-700">
                  {t("dashboard.pdfReport.unverifiedBadge")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DialogPrimitive>
  );
}
