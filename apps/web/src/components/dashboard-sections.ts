import type { ComponentType } from "react";
import { Users, Camera, Sparkles, Layers, Activity } from "lucide-react";

export type SectionIcon = ComponentType<{ className?: string }>;

/**
 * Single source of truth for the clinical dashboard section map.
 * Kept JSX-free so both DashboardTabs and ClinicalDashboard can import it
 * without a circular dependency.
 *
 * Phase 5 (i18n): entries carry a translation KEY rather than a literal label.
 * Resolving it with `t()` at render time is what lets the tab bar follow the
 * active language instead of shipping hard-coded Persian.
 */
export const SECTIONS = [
  { id: "patients", labelKey: "dashboard.tabs.patients", icon: Users as SectionIcon },
  { id: "scalp-map", labelKey: "dashboard.tabs.scalpMap", icon: Activity as SectionIcon },
  { id: "gallery", labelKey: "dashboard.tabs.gallery", icon: Camera as SectionIcon },
  { id: "ai-studio", labelKey: "dashboard.tabs.aiStudio", icon: Sparkles as SectionIcon },
  { id: "3d-model", labelKey: "dashboard.tabs.hologram", icon: Layers as SectionIcon },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
