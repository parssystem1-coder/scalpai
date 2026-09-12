import React from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DashboardDataMode } from "../data/dashboard-data-provider.js";

interface DemoWatermarkProps {
  mode: DashboardDataMode;
  surface: "dashboard" | "overlay";
}

/**
 * Persistent disclosure for non-clinical data. It has no dismiss action and is
 * rendered only when the caller explicitly identifies the surface as demo.
 */
export const DemoWatermark: React.FC<DemoWatermarkProps> = ({ mode, surface }) => {
  const { t } = useTranslation();
  if (mode !== "demo") return null;

  return (
    <div
      role="status"
      aria-label={t("dashboard.demoWatermark.ariaLabel")}
      data-testid={`demo-watermark-${surface}`}
      className="pointer-events-none absolute inset-x-3 top-3 z-40 flex justify-center sm:inset-x-6"
    >
      <div className="flex max-w-full items-center gap-2 rounded-full border-2 border-amber-700/70 bg-amber-100/95 px-3 py-1.5 text-center text-[0.65rem] font-black uppercase tracking-[0.08em] text-amber-950 shadow-lg backdrop-blur-sm sm:px-4 sm:text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("dashboard.demoWatermark.label")}</span>
      </div>
    </div>
  );
};
