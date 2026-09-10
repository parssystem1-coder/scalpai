import React from "react";
import { useTranslation } from "react-i18next";
import { SECTIONS, type SectionId } from "./dashboard-sections.js";
import { faNum } from "../i18n.js";

export interface DashboardTabsProps {
  /** Currently highlighted section (owned by ClinicalDashboard). */
  activeSection: SectionId;
  /** Fired when a tab is clicked; parent performs the smooth scroll. */
  onSectionChange: (sectionId: SectionId) => void;
  /**
   * `desktop` renders the frosted pill nav that lives inside the sticky header.
   * `mobile` renders the horizontally scrollable secondary bar below the header.
   */
  variant?: "desktop" | "mobile";
}

/**
 * Section switcher for the clinical dashboard.
 * Pure presentational: no local state, no data fetching.
 *
 * Phase 5: labels come from `dashboard.tabs.*` and the ordinal badge is
 * rendered through `faNum()` so Persian shows 1..5 shaped and English 1..5.
 *
 * Phase B (M5 quality gates): both variants expose the same structural test
 * hooks - `dashboard-tabs` for the nav landmark and `dashboard-tab-{id}` per
 * tab - so a spec addresses a tab by SECTION ID instead of by its label.
 */
export const DashboardTabs: React.FC<DashboardTabsProps> = ({
  activeSection,
  onSectionChange,
  variant = "desktop",
}) => {
  const { t } = useTranslation();

  if (variant === "mobile") {
    return (
      <div
        data-testid="dashboard-tabs"
        className="lg:hidden sticky top-[61px] sm:top-[65px] z-40 px-3 sm:px-4 py-2 bg-[oklch(98%_0.01_28/0.92)] backdrop-blur-2xl border-b border-white/70 shadow-xs flex items-center gap-2 overflow-x-auto no-scrollbar"
        aria-label={t("dashboard.tabs.navLabelMobile")}
      >
        {SECTIONS.map((sec, idx) => {
          const Icon = sec.icon;
          const isActive = activeSection === sec.id;
          return (
            <button
              key={sec.id}
              data-testid={`dashboard-tab-${sec.id}`}
              onClick={() => onSectionChange(sec.id)}
              aria-current={isActive ? "true" : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300 shrink-0 ${
                isActive
                  ? "rose-gold-gradient text-white shadow-sm scale-[1.02]"
                  : "text-[oklch(40%_0.02_20)] bg-white/70 hover:bg-white"
              }`}
            >
              <span
                data-testid={`dashboard-tab-ordinal-${sec.id}`}
                className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem] font-mono font-black ${
                  isActive ? "bg-white/30 text-white" : "bg-stone-200 text-stone-600"
                }`}
              >
                {faNum(idx + 1)}
              </span>
              <Icon className="w-3.5 h-3.5" />
              <span data-testid={`dashboard-tab-label-${sec.id}`}>{t(sec.labelKey)}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <nav
      data-testid="dashboard-tabs"
      className="hidden lg:flex items-center gap-1.5 mr-6 p-1.5 bg-white/70 backdrop-blur-2xl rounded-2xl border border-white/80 shadow-[0_2px_12px_oklch(30%_0.04_15/0.05)]"
      aria-label={t("dashboard.tabs.navLabel")}
    >
      {SECTIONS.map((sec, idx) => {
        const Icon = sec.icon;
        const isActive = activeSection === sec.id;
        return (
          <button
            key={sec.id}
            data-testid={`dashboard-tab-${sec.id}`}
            onClick={() => onSectionChange(sec.id)}
            aria-current={isActive ? "true" : undefined}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-300 ${
              isActive
                ? "rose-gold-gradient text-white shadow-md shadow-[oklch(62%_0.09_16/0.25)] scale-[1.02]"
                : "text-[oklch(40%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/60"
            }`}
          >
            <span
              data-testid={`dashboard-tab-ordinal-${sec.id}`}
              className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.65rem] font-mono font-black transition-colors ${
                isActive ? "bg-white/30 text-white" : "bg-stone-200/70 text-stone-600"
              }`}
            >
              {faNum(idx + 1)}
            </span>
            <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-[oklch(62%_0.09_16)]"}`} />
            <span data-testid={`dashboard-tab-label-${sec.id}`}>{t(sec.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default DashboardTabs;
