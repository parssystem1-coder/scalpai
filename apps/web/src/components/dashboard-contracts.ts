import type { ReactNode } from "react";
import type { DashboardDataMode } from "../data/dashboard-data-types";
import type { SectionId } from "./dashboard-sections";

/** Stable navigation callbacks shared by dashboard chrome and section hosts. */
export interface DashboardNavigationContract {
  activeSection: SectionId;
  onSectionChange: (sectionId: SectionId) => void;
}

/** Stable shell contract; domain state remains owned by the dashboard composition root. */
export interface DashboardShellProps extends DashboardNavigationContract {
  userEmail: string;
  isOnline: boolean;
  pendingCount: number;
  dataMode: DashboardDataMode;
  onOpenSyncInspector: () => void;
  onOpenLicenseDiagnostics: () => void;
  onOpenEducation: () => void;
  onOpenGuidedCapture: () => void;
  onOpenPdfReport: () => void;
  onOpenConsent: () => void;
  onLogout: () => void;
  children: ReactNode;
}
