import type { ComponentType } from "react";
import { Users, Camera, Sparkles, Layers, Activity } from "lucide-react";

export type SectionIcon = ComponentType<{ className?: string }>;

/**
 * Single source of truth for the clinical dashboard section map.
 * Kept JSX-free so both DashboardTabs and ClinicalDashboard can import it
 * without a circular dependency.
 */
export const SECTIONS = [
  { id: "patients", label: "پرونده و مراجعین", icon: Users as SectionIcon },
  { id: "scalp-map", label: "نقشه زنده سر (Scalp Map)", icon: Activity as SectionIcon },
  { id: "gallery", label: "ویژن تریکوسکوپی 4K", icon: Camera as SectionIcon },
  { id: "ai-studio", label: "استودیوی محاسباتی AI", icon: Sparkles as SectionIcon },
  { id: "3d-model", label: "هولوگرام ۳ بعدی ساقه مو", icon: Layers as SectionIcon },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
