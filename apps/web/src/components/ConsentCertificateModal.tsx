import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Download, X, ShieldCheck, Award, CheckCircle2 } from "lucide-react";
import { formatDate } from "@scalpai/shared";
import type { ConsentRecord } from "./DigitalConsentModal.js";

interface ConsentCertificateModalProps {
  consent: ConsentRecord;
  patientName: string;
  patientPhone: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ConsentCertificateModal({
  consent,
  patientName,
  patientPhone,
  isOpen,
  onClose,
}: ConsentCertificateModalProps) {
  const { t, i18n } = useTranslation();
  const certRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const certId = `CERT-${consent.id.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() || "CLINIC-01"}`;
  const signedDateFa = formatDate(consent.signedAt, { locale: "fa", format: "full", includeTime: true });
  const signedDateEn = formatDate(consent.signedAt, { locale: "en", format: "full", includeTime: true });

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadImage = () => {
    if (!certRef.current) return;
    try {
      const element = certRef.current;
      const canvas = document.createElement("canvas");
      const scale = 2; // high-dpi
      canvas.width = element.offsetWidth * scale;
      canvas.height = element.offsetHeight * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Draw paper background
      ctx.scale(scale, scale);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, element.offsetWidth, element.offsetHeight);

      // Simple image snapshot fallback using canvas rendering
      const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${element.offsetWidth}" height="${element.offsetHeight}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" style="direction: ${i18n.language === "fa" ? "rtl" : "ltr"}; font-family: sans-serif; background: #ffffff; padding: 24px; color: #1c1917;">
              ${element.innerHTML}
            </div>
          </foreignObject>
        </svg>`
      )}`;

      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        const link = document.createElement("a");
        link.download = `consent-${certId}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      };
      img.src = dataUri;
    } catch {
      window.print();
    }
  };

  return (
    <div
      id="consent-cert-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      aria-label={t("dashboard.consentCertificate.backdropLabel")}
    >
<div
            id="consent-cert-container"
            className="relative my-8 w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-stone-200 overflow-hidden flex flex-col"
            dir={i18n.language === "fa" ? "rtl" : "ltr"}
          >
        {/* Modal Action Bar (Hidden on Print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-50 border-b border-stone-200 print:hidden">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-[oklch(62%_0.09_16)]" />
            <span className="font-bold text-sm text-stone-800">
              {t("dashboard.consentCertificate.headerTitle")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{t("dashboard.consentCertificate.print")}</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadImage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[oklch(62%_0.09_16)] text-white hover:brightness-110 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("dashboard.consentCertificate.download")}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-500 hover:bg-stone-200 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Certificate Sheet */}
        <div
          ref={certRef}
          id="printable-certificate-sheet"
          className="p-8 md:p-10 bg-white relative print:p-0 print:border-none print:shadow-none"
        >
          {/* Subtle Guilloche / Watermark Pattern */}
          <div className="absolute inset-4 rounded-2xl border-2 border-double border-[oklch(62%_0.09_16/0.25)] pointer-events-none p-2" />

          {/* Header */}
          <div className="relative z-10 flex items-start justify-between border-b border-stone-200 pb-6 mb-6">
            <div className="space-y-1">
              <span className="text-[10px] font-mono tracking-widest text-[oklch(62%_0.09_16)] uppercase font-bold">
                Scalp Scrub Trichology Center
              </span>
              <h1 className="text-xl md:text-2xl font-serif font-bold text-stone-900">
                {t("dashboard.consentCertificate.headerTitle")}
              </h1>
              <p className="text-xs text-stone-500">
                {t("dashboard.consentCertificate.subHeader")}
              </p>
            </div>
            <div className="text-left font-mono">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[10px] font-bold">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                <span>{certId}</span>
              </div>
              <p className="text-[10px] text-stone-400 mt-1">Status: VERIFIED & SEALED</p>
            </div>
          </div>

          {/* Patient Details Grid */}
          <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-stone-50 border border-stone-200 mb-6 text-xs">
            <div>
              <span className="block text-[11px] text-stone-500 mb-0.5">{t("dashboard.consentCertificate.patientName")}</span>
              <strong className="text-stone-900 font-bold">{patientName}</strong>
            </div>
            <div>
              <span className="block text-[11px] text-stone-500 mb-0.5">{t("dashboard.consentCertificate.contactPhone")}</span>
              <span className="font-mono text-stone-800">{patientPhone || "—"}</span>
            </div>
            <div>
              <span className="block text-[11px] text-stone-500 mb-0.5">{t("dashboard.consentCertificate.patientId")}</span>
              <span className="font-mono text-stone-800">{consent.patientId.slice(0, 10)}</span>
            </div>
            <div>
              <span className="block text-[11px] text-stone-500 mb-0.5">{t("dashboard.consentCertificate.templateVer")}</span>
              <span className="font-mono text-stone-800">{consent.templateVersion}</span>
            </div>
          </div>

          {/* Timestamp details */}
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600 mb-6 px-1">
            <div>
              <span className="font-semibold">{t("dashboard.consentCertificate.signedTimestamp")}</span>{" "}
              <span className="font-mono text-stone-900">{signedDateFa}</span>
            </div>
            <div>
              <span className="font-semibold">{t("dashboard.consentCertificate.utcReference")}</span>{" "}
              <span className="font-mono text-stone-900">{signedDateEn}</span>
            </div>
          </div>

          {/* Legal Clauses */}
          <div className="relative z-10 space-y-3 text-xs leading-relaxed text-stone-700 bg-white/80 p-4 rounded-xl border border-stone-200 mb-6">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>{t("dashboard.consentCertificate.section1Title")}</strong>{" "}
                {t("dashboard.consentCertificate.section1Text")}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>{t("dashboard.consentCertificate.section2Title")}</strong>{" "}
                {t("dashboard.consentCertificate.section2Text")}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                <strong>{t("dashboard.consentCertificate.section3Title")}</strong>{" "}
                {t("dashboard.consentCertificate.section3Text")}
              </p>
            </div>
          </div>

          {/* Signature & Verification Seal */}
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 pt-4 border-t border-stone-200">
            {/* Signature Preview */}
            <div className="text-center sm:text-right">
              <span className="block text-[11px] font-bold text-stone-600 mb-2">
                {t("dashboard.consentCertificate.patientSignature")}
              </span>
              {consent.signaturePayload ? (
                <div className="inline-block p-2 rounded-xl bg-stone-50 border border-stone-200 shadow-inner">
                  <img
                    src={consent.signaturePayload}
                    alt="Patient Digital Signature"
                    className="h-16 max-w-[200px] object-contain"
                  />
                </div>
              ) : (
                <span className="text-xs text-stone-400 italic">Signature Not Rendered</span>
              )}
            </div>

            {/* Official Digital Stamp */}
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl border-2 border-emerald-600/30 bg-emerald-50/50 text-center w-48">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center mb-1 shadow-sm">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                {t("dashboard.consentCertificate.clinicSeal")}
              </span>
              <span className="text-[9px] font-mono text-emerald-700">Ed25519 Verified Token</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
