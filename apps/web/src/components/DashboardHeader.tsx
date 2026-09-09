import React from "react";
import { useTranslation } from "react-i18next";
import {
  Brain,
  Cpu,
  ShieldCheck,
  Sparkles,
  Camera,
  FileText,
  FileSignature,
  LogOut,
} from "lucide-react";
import DashboardTabs from "./DashboardTabs.js";
import type { SectionId } from "./dashboard-sections.js";
import { faNum } from "../i18n.js";

export interface DashboardHeaderProps {
  /** Signed-in trichologist email; only the local part is displayed. */
  userEmail: string;
  isOnline: boolean;
  pendingCount: number;
  activeSection: SectionId;
  onSectionChange: (sectionId: SectionId) => void;
  onOpenSyncInspector: () => void;
  onOpenLicenseDiagnostics: () => void;
  onOpenEducation: () => void;
  onOpenGuidedCapture: () => void;
  onOpenPdfReport: () => void;
  onOpenConsent: () => void;
  /** Caller is responsible for clearing the access token. */
  onLogout: () => void;
}

/**
 * Sticky frosted-glass top bar of the clinical dashboard.
 * Pure presentational: every piece of state and every side effect is passed in.
 *
 * Phase 5: every string resolves through `dashboard.header.*` and the outbox
 * counter is rendered with `faNum()` (Persian digits in the fa UI).
 */
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userEmail,
  isOnline,
  pendingCount,
  activeSection,
  onSectionChange,
  onOpenSyncInspector,
  onOpenLicenseDiagnostics,
  onOpenEducation,
  onOpenGuidedCapture,
  onOpenPdfReport,
  onOpenConsent,
  onLogout,
}) => {
  const { t } = useTranslation();

  return (
    <header className="sticky top-0 z-50 w-full px-4 sm:px-6 md:px-10 py-3 flex items-center justify-between border-b border-white/60 bg-[oklch(98%_0.01_28/0.75)] backdrop-blur-2xl shadow-[0_4px_24px_oklch(30%_0.04_15/0.08)]">
      <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-2xl rose-gold-gradient grid place-items-center text-white shadow-md shadow-[oklch(62%_0.09_16/0.25)] ring-1 ring-white/60 shrink-0">
            <Brain className="w-5 h-5 drop-shadow-sm text-white" />
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-base sm:text-lg font-bold tracking-tight text-[oklch(20%_0.02_20)] drop-shadow-xs">
                {t("dashboard.header.clinicName")}
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[0.6rem] sm:text-[0.62rem] font-mono font-extrabold bg-white/80 text-[oklch(40%_0.02_20)] border border-black/5 flex items-center gap-1 shadow-xs">
                <Cpu className="w-3 h-3 text-[oklch(62%_0.09_16)]" />
                {t("dashboard.header.version")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[0.68rem] sm:text-[0.72rem] text-[oklch(45%_0.02_20)] flex-wrap">
              <span className="font-medium text-[oklch(30%_0.02_20)]">
                {t("dashboard.header.trichologist")} {userEmail.split("@")[0]}
              </span>
              <span className="w-1 h-1 rounded-full bg-[oklch(62%_0.09_16/0.4)]" />
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {isOnline ? t("dashboard.header.online") : t("dashboard.header.offline")}
              </span>
              {pendingCount > 0 && (
                <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[0.65rem] px-2 py-0.5 rounded-full font-bold shadow-xs">
                  {faNum(pendingCount)} {t("dashboard.header.syncPending")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Module Tabs (Luxury Frosted Glass Pills with Smooth Scroll) */}
        <DashboardTabs variant="desktop" activeSection={activeSection} onSectionChange={onSectionChange} />
      </div>

      {/* User profile & actions */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Sync & Offline Inspector Trigger */}
        <button
          type="button"
          onClick={onOpenSyncInspector}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shadow-2xs ${
            isOnline
              ? "bg-emerald-50/90 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
              : "bg-amber-50/90 text-amber-800 border-amber-300 hover:bg-amber-100"
          }`}
          title={t("dashboard.header.syncTitle")}
        >
          <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
          <span className="hidden sm:inline">
            {isOnline ? t("dashboard.header.sync") : t("dashboard.header.offlineMode")}
          </span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-mono">
              {faNum(pendingCount)}
            </span>
          )}
        </button>

        {/* License & Anti-Tamper Diagnostics Trigger */}
        <button
          type="button"
          onClick={onOpenLicenseDiagnostics}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/80 hover:bg-white border border-stone-200 text-stone-700 shadow-2xs transition-all"
          title={t("dashboard.header.licenseTitle")}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span className="hidden md:inline">{t("dashboard.header.license")}</span>
        </button>

        {/* Education E1 3D Layer Trigger */}
        <button
          type="button"
          onClick={onOpenEducation}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[oklch(62%_0.09_16/0.15)] hover:bg-[oklch(62%_0.09_16/0.25)] border border-[oklch(62%_0.09_16/0.4)] text-[oklch(48%_0.095_12)] shadow-2xs transition-all"
          title={t("dashboard.header.education3DTitle")}
        >
          <Sparkles className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
          <span className="hidden xl:inline">{t("dashboard.header.education3D")}</span>
        </button>

        {/* Guided Capture Trigger */}
        <button
          type="button"
          onClick={onOpenGuidedCapture}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/80 hover:bg-white border border-stone-200 text-stone-700 shadow-2xs transition-all"
          title={t("dashboard.header.guidedCaptureTitle")}
        >
          <Camera className="w-4 h-4 text-cyan-600" />
          <span className="hidden lg:inline">{t("dashboard.header.guidedCapture")}</span>
        </button>

        {/* PDF Report Trigger */}
        <button
          type="button"
          onClick={onOpenPdfReport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white/80 hover:bg-white border border-stone-200 text-stone-700 shadow-2xs transition-all"
          title={t("dashboard.header.pdfReportTitle")}
        >
          <FileText className="w-4 h-4 text-stone-700" />
          <span className="hidden sm:inline">{t("dashboard.header.pdfReport")}</span>
        </button>

        <button
          onClick={onOpenConsent}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-white/80 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-[oklch(48%_0.095_12)] shadow-xs backdrop-blur-sm transition-all"
        >
          <FileSignature className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
          <span className="hidden sm:inline">{t("dashboard.header.consent")}</span>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-white/70 text-stone-600 hover:text-red-700 hover:bg-white border border-white/80 transition-all shadow-xs"
          title={t("dashboard.header.logoutTitle")}
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">{t("dashboard.header.logout")}</span>
        </button>
      </div>
    </header>
  );
};

export default DashboardHeader;
