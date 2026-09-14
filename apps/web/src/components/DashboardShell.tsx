import React from "react";
import { DemoWatermark } from "./DemoWatermark";
import { AmberOrbs } from "./AmberOrbs";
import { HairCanvas } from "./HairCanvas";
import DashboardHeader from "./DashboardHeader";
import DashboardTabs from "./DashboardTabs";
import type { DashboardShellProps } from "./dashboard-contracts";

/**
 * Shared dashboard chrome and composition boundary.
 *
 * Domain state and section markup stay in the caller. This shell owns only the
 * stable page frame: provenance disclosure, visual background, navigation and
 * the content stacking context.
 */
export const DashboardShell: React.FC<DashboardShellProps> = ({
  userEmail,
  isOnline,
  pendingCount,
  activeSection,
  onSectionChange,
  dataMode,
  onOpenSyncInspector,
  onOpenLicenseDiagnostics,
  onOpenEducation,
  onOpenGuidedCapture,
  onOpenPdfReport,
  onOpenConsent,
  onLogout,
  children,
}) => (
  <div className="min-h-screen flex flex-col font-sans relative text-[oklch(20%_0.02_20)] bg-[oklch(85%_0.03_28)] antialiased select-none">
    {import.meta.env.DEV && <DemoWatermark mode={dataMode} surface="dashboard" />}
    <div
      className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat filter contrast-[1.02] saturate-[1.04] pointer-events-none"
      style={{ backgroundImage: "url('/images/scalp-bg.jpg')" }}
    />
    <AmberOrbs />
    <HairCanvas />
    <DashboardHeader
      userEmail={userEmail}
      isOnline={isOnline}
      pendingCount={pendingCount}
      activeSection={activeSection}
      onSectionChange={onSectionChange}
      onOpenSyncInspector={onOpenSyncInspector}
      onOpenLicenseDiagnostics={onOpenLicenseDiagnostics}
      onOpenEducation={onOpenEducation}
      onOpenGuidedCapture={onOpenGuidedCapture}
      onOpenPdfReport={onOpenPdfReport}
      onOpenConsent={onOpenConsent}
      onLogout={onLogout}
    />
    <DashboardTabs variant="mobile" activeSection={activeSection} onSectionChange={onSectionChange} />
    {children}
  </div>
);

export default DashboardShell;
