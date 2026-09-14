import React, { useCallback, type ReactNode } from "react";
import { HeartHandshake } from "lucide-react";
import DashboardShell from "../DashboardShell";
import { clearAccessToken } from "../../api/client";
import LicenseDiagnosticsModal from "../modals/LicenseDiagnosticsModal.js";
import SyncInspectorModal from "../modals/SyncInspectorModal.js";
import type { DashboardDataProvider } from "../../data/dashboard-data-types";
import type { SectionId } from "../dashboard-sections";

export interface EmptyRosterSectionProps {
  dataProvider: DashboardDataProvider;
  userEmail: string;
  isOnline: boolean;
  pendingCount: number;
  activeSection: SectionId;
  scrollToSection: (sectionId: SectionId) => void;
  openSync: () => void;
  openLicense: () => void;
  openAddPatient: () => void;
  onLogout: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  addPatientModal: ReactNode;
  isLicenseOpen: boolean;
  closeLicense: () => void;
  isSyncOpen: boolean;
  closeSync: () => void;
}

function EmptyRosterSection({
  dataProvider,
  userEmail,
  isOnline,
  pendingCount,
  activeSection,
  scrollToSection,
  openSync,
  openLicense,
  openAddPatient,
  onLogout,
  t,
  addPatientModal,
  isLicenseOpen,
  closeLicense,
  isSyncOpen,
  closeSync,
}: EmptyRosterSectionProps) {
  const handleLogout = useCallback(() => {
    clearAccessToken();
    onLogout();
  }, [onLogout]);

  return (
    <DashboardShell
      dataMode={dataProvider.mode}
      userEmail={userEmail}
      isOnline={isOnline}
      pendingCount={pendingCount}
      activeSection={activeSection}
      onSectionChange={scrollToSection}
      onOpenSyncInspector={openSync}
      onOpenLicenseDiagnostics={openLicense}
      onOpenEducation={openAddPatient}
      onOpenGuidedCapture={openAddPatient}
      onOpenPdfReport={openAddPatient}
      onOpenConsent={openAddPatient}
      onLogout={handleLogout}
    >
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 relative z-10">
        <section id="section-patients" className="scroll-mt-28">
          <div className="rounded-[32px] p-8 md:p-12 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)] flex flex-col items-center text-center gap-4">
            <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
              {t("dashboard.emptyState.badge")}
            </span>
            <div className="w-14 h-14 rounded-2xl bg-white/80 border border-white text-[oklch(62%_0.09_16)] grid place-items-center shadow-xs">
              <HeartHandshake className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">{t("dashboard.emptyState.title")}</h2>
            <p className="text-xs text-[oklch(45%_0.02_20)] max-w-md">{t("dashboard.emptyState.hint")}</p>
            <button type="button" onClick={openAddPatient} className="mt-2 px-5 py-3 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all cursor-pointer">
              {t("dashboard.emptyState.addPatient")}
            </button>
          </div>
        </section>
      </main>
      {addPatientModal}
      {isLicenseOpen && <LicenseDiagnosticsModal isOpen={isLicenseOpen} onClose={closeLicense} />}
      {isSyncOpen && <SyncInspectorModal isOpen={isSyncOpen} onClose={closeSync} />}
    </DashboardShell>
  );
}

export default React.memo(EmptyRosterSection);
