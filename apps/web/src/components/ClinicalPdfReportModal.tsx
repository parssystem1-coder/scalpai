import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Printer,
  Download,
  FileText,
  ShieldCheck,
  Award,
  QrCode,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import { formatToJalali } from "@scalpai/shared";
import { faNum } from "../i18n.js";

interface ClinicalPdfReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName?: string;
  patientPhone?: string;
  patientId?: string;
  doctorName?: string;
  clinicName?: string;
  density?: number;
  miniaturization?: number;
  erythema?: number;
  sebum?: number;
  diagnosis?: string;
}

export default function ClinicalPdfReportModal({
  isOpen,
  onClose,
  patientName,
  patientPhone = "09129876543",
  patientId = "PAT-2026-9811",
  doctorName,
  clinicName,
  density = 112,
  miniaturization = 32,
  erythema = 45,
  sebum = 68,
  diagnosis,
}: ClinicalPdfReportModalProps) {
  const { t, i18n } = useTranslation();
  const isFa = i18n.language === "fa";
  const reportRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  // M5: the sample header/footer copy used to be hard-coded Persian in the
  // default parameters; it now falls back to the active catalogue instead.
  const shownPatientName = patientName ?? t("pdf.demo.patientName");
  const shownDoctorName = doctorName ?? t("pdf.demo.doctorName");
  const shownClinicName = clinicName ?? t("pdf.demo.clinicName");
  const shownDiagnosis = diagnosis ?? t("pdf.demo.diagnosis");

  const now = new Date();
  const jalaliDate = formatToJalali(now);
  const gregorianDate = now.toISOString().split("T")[0];
  const reportId = `REP-${patientId.replace(/[^0-9]/g, "") || "8877"}-${Math.floor(1000 + Math.random() * 9000)}`;
  const portalUrl = `https://scalpai.clinic/portal?token=jwt_${reportId.toLowerCase()}`;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // In browser, trigger window.print to Save as PDF
    window.print();
  };

  return (
    <div
      id="pdf-report-backdrop"
      className="fixed inset-0 z-[75] flex items-center justify-center bg-stone-950/80 p-2 md:p-6 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        id="pdf-report-modal"
        className="relative my-auto w-full max-w-4xl rounded-3xl bg-white text-stone-900 shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[94vh]"
        dir={isFa ? "rtl" : "ltr"}
      >
        {/* Top Floating Action Bar (Hidden on Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-b border-stone-200 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[oklch(62%_0.09_16)]" />
            <h3 className="font-bold text-sm text-stone-800">{t("pdf.previewTitle")}</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              RTL READY
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-stone-300 text-stone-700 hover:bg-stone-100 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t("pdf.print")}</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[oklch(62%_0.09_16)] text-white hover:brightness-110 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("pdf.download")}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t("pdf.closeAria")}
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
                  {shownClinicName}
                </h1>
              </div>
              <p className="text-xs text-stone-600 font-medium">{t("pdf.systemLine")}</p>
            </div>

            <div className="text-left sm:text-left text-xs font-mono space-y-0.5 bg-stone-50 p-3 rounded-xl border border-stone-200">
              <div><strong className="text-stone-700">{t("pdf.fileNo")}</strong> {patientId}</div>
              <div><strong className="text-stone-700">{t("pdf.reportNo")}</strong> {reportId}</div>
              <div className="flex items-center gap-1 mt-1 text-emerald-700 font-bold">
                <Calendar className="w-3.5 h-3.5" />
                <span>{jalaliDate} ({gregorianDate})</span>
              </div>
            </div>
          </div>

          {/* Patient Demographics & Doctor Info Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs">
            <div className="space-y-1.5">
              <div><span className="text-stone-500">{t("pdf.patientNameLabel")}</span> <strong className="text-stone-900 text-sm">{shownPatientName}</strong></div>
              <div><span className="text-stone-500">{t("pdf.patientPhoneLabel")}</span> <span className="font-mono text-stone-800">{patientPhone}</span></div>
              <div><span className="text-stone-500">{t("pdf.doctorLabel")}</span> <strong className="text-stone-800">{shownDoctorName}</strong></div>
            </div>
            <div className="space-y-1.5 sm:text-left">
              <div><span className="text-stone-500">{t("pdf.areasLabel")}</span> <span className="text-stone-800 font-medium">{t("pdf.areasValue")}</span></div>
              <div><span className="text-stone-500">{t("pdf.magLabel")}</span> <span className="text-stone-800 font-mono">{t("pdf.magValue")}</span></div>
              <div><span className="text-stone-500">{t("pdf.licenseLabel")}</span> <span className="font-mono text-stone-800">{t("pdf.licenseValue")}</span></div>
            </div>
          </div>

          {/* Trichometric Biometric Measurements Grid */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
              <span>{t("pdf.metricsTitle")}</span>
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("pdf.densityLabel")}</div>
                <div className="text-xl font-black text-stone-900 mt-1">
                  {faNum(density)} <span className="text-xs font-normal text-stone-500">{t("pdf.densityUnit")}</span>
                </div>
                <div className="text-[10px] text-amber-700 font-medium mt-1">{t("pdf.densityNote")}</div>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("pdf.miniLabel")}</div>
                <div className="text-xl font-black text-amber-600 mt-1">
                  {faNum(miniaturization)}% <span className="text-xs font-normal text-stone-500">{t("pdf.miniUnit")}</span>
                </div>
                <div className="text-[10px] text-amber-700 font-medium mt-1">{t("pdf.miniNote")}</div>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("pdf.erythemaLabel")}</div>
                <div className="text-xl font-black text-red-600 mt-1">
                  {faNum(erythema)} <span className="text-xs font-normal text-stone-500">{t("pdf.outOf100")}</span>
                </div>
                <div className="text-[10px] text-stone-500 mt-1">{t("pdf.erythemaNote")}</div>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-stone-50">
                <div className="text-stone-500 font-medium">{t("pdf.sebumLabel")}</div>
                <div className="text-xl font-black text-stone-900 mt-1">
                  {faNum(sebum)} <span className="text-xs font-normal text-stone-500">{t("pdf.outOf100")}</span>
                </div>
                <div className="text-[10px] text-stone-500 mt-1">{t("pdf.sebumNote")}</div>
              </div>
            </div>
          </div>

          {/* Clinical Findings & Formal Diagnosis */}
          <div className="p-4 rounded-2xl border-2 border-stone-300 bg-stone-50/60 space-y-2">
            <h4 className="text-xs font-bold text-stone-900 uppercase">{t("pdf.diagnosisTitle")}</h4>
            <p className="text-sm font-bold text-stone-950 leading-relaxed">
              {shownDiagnosis}
            </p>
            <p className="text-xs text-stone-600 leading-relaxed">{t("pdf.findings")}</p>
          </div>

          {/* Actionable Treatment Plan */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{t("pdf.planTitle")}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-stone-200 bg-white space-y-1">
                <strong className="block text-stone-800">{t("pdf.plan1Title")}</strong>
                <p className="text-stone-600 text-[11px] leading-relaxed">{t("pdf.plan1Body")}</p>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-white space-y-1">
                <strong className="block text-stone-800">{t("pdf.plan2Title")}</strong>
                <p className="text-stone-600 text-[11px] leading-relaxed">{t("pdf.plan2Body")}</p>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-white space-y-1">
                <strong className="block text-stone-800">{t("pdf.plan3Title")}</strong>
                <p className="text-stone-600 text-[11px] leading-relaxed">{t("pdf.plan3Body")}</p>
              </div>

              <div className="p-3.5 rounded-xl border border-stone-200 bg-white space-y-1">
                <strong className="block text-stone-800">{t("pdf.plan4Title")}</strong>
                <p className="text-stone-600 text-[11px] leading-relaxed">{t("pdf.plan4Body")}</p>
              </div>
            </div>
          </div>

          {/* Legal Disclaimer & Doctor Stamp Box */}
          <div className="pt-4 border-t border-stone-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8 text-[10px] text-stone-500 leading-relaxed space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-stone-700">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t("pdf.authTitle")}</span>
              </div>
              <p>{t("pdf.authBody")}</p>
              <div className="flex items-center gap-2 text-stone-400 font-mono text-[9px] pt-1">
                <QrCode className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                <span className="truncate">{t("pdf.portalLabel")} {portalUrl}</span>
              </div>
              <div className="text-stone-400 font-mono text-[9px]">
                SHA256: 7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069
              </div>
            </div>

            {/* Doctor Seal & Stamp */}
            <div className="md:col-span-4 p-3 rounded-2xl border border-dashed border-stone-300 text-center space-y-1 bg-stone-50">
              <div className="text-[10px] text-stone-500 font-medium">{t("pdf.sealTitle")}</div>
              <div className="text-xs font-bold text-stone-900 mt-1">{shownDoctorName}</div>
              <div className="text-[10px] text-emerald-700 font-semibold">{t("pdf.sealVerified")}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
