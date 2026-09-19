import React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUp,
  Award,
  Brain,
  CheckCircle2,
  Dna,
  Download,
  Droplets,
  Flame,
  RefreshCw,
} from "lucide-react";
import LuxuryTiltCard from "../LuxuryTiltCard.js";
import type { SectionId } from "../dashboard-sections.js";
import { faNum } from "../../i18n.js";

/**
 * Server-anchored provenance for an analysis run (P4-B02 / F09, Wave 2).
 *
 * A clinical claim without this is a fabrication: the engine result only
 * reaches the UI when it carries the pixels' hash and the model version the
 * server verified (ADR-0043).
 */
export interface AnalysisProvenance {
  /** sha256 of the analysed pixels, as verified server-side. */
  imageHash: string;
  /** Registered model manifest version (e.g. "heuristic-v0"). */
  modelVersion: string;
  /** ISO timestamp of the analysis run. */
  analyzedAt: string;
  /** Server gallery item id, when the analysis ran on a stored image. */
  galleryItemId?: string;
}

/**
 * Discriminated state of the analytics pipeline — there is no "default"
 * clinical payload anymore: before the first real run the section renders its
 * empty state instead of inventing numbers.
 */
export type AnalyticsData =
  | { readonly state: "empty" }
  | { readonly state: "analyzing" }
  | { readonly state: "error" }
  | { readonly state: "ready"; readonly data: AnalyticsResult; readonly provenance: AnalysisProvenance };

/** Actual engine output — only ever produced by a real engine run. */
export interface AnalyticsResult {
  scores: { redness: number; flakeTexture: number; densityProxy: number };
  severity: number;
  modelVersion: string;
  recommendation: string;
}

export interface AnalyticsSectionProps {
  /** Pipeline state — `ready` requires engine output + provenance by type. */
  data: AnalyticsData;
  /** Display name of the patient the analysis belongs to. */
  patientName: string;
  /** Re-runs the AI scan. */
  onRunAnalysis?: () => void;
  /** Opens the 3D education storyboard mapped to the AI diagnosis. */
  onOpenEducation?: () => void;
  /** Opens the clinical PDF report / prescription modal. */
  onOpenPdfReport?: () => void;
  /** Smooth-scroll navigation to another dashboard section. */
  onNavigate?: (sectionId: SectionId) => void;
  /** Reserved for longitudinal aggregation (Phase 5). */
  dateRange?: [Date, Date];
}

/**
 * SECTION 3 - AI trichology studio: holographic metric dials and the
 * AI-synthesised treatment protocol card.
 *
 * Pure presentational: every metric arrives through `data`, all mutations
 * are delegated to ClinicalDashboard through callbacks.
 *
 * Phase 5: copy resolves through `dashboard.analytics.*`; the percentages are
 * shaped with `faNum()` while the CSS bar widths keep the raw ASCII numbers.
 *
 * Phase B (M5 quality gates): every dial and action carries a `data-testid`, and
 * all four dials now print the same ASCII `%`. The hydration dial used to print
 * the Arabic percent sign, which is a Persian codepoint rendered even in the
 * English UI - and it disagreed with the other three dials in the Persian one.
 */
export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
  data,
  patientName,
  onRunAnalysis,
  onOpenEducation,
  onOpenPdfReport,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const isAnalyzing = data.state === "analyzing";
  const result = data.state === "ready" ? data.data : null;
  const provenance = data.state === "ready" ? data.provenance : null;

  const metricDials =
    result === null ? null : (
      <>
        {/* Metric 1 */}
        <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
          <div
            data-testid="analytics-metric-redness"
            className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">
                {t("dashboard.analytics.metrics.redness")}
              </span>
              <span
                data-testid="analytics-metric-value-redness"
                className="text-xs font-mono font-black text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200"
              >
                {faNum(result.scores.redness)}%
              </span>
            </div>
            <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
              <div
                className="bg-gradient-to-r from-rose-500 to-red-500 h-full rounded-full transition-all duration-700 shadow-xs"
                style={{ width: `${result.scores.redness}%` }}
              />
            </div>
            <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              {t("dashboard.analytics.metrics.rednessHint")}
            </span>
          </div>
        </LuxuryTiltCard>

        {/* Metric 2 */}
        <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
          <div
            data-testid="analytics-metric-flake"
            className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">
                {t("dashboard.analytics.metrics.flake")}
              </span>
              <span
                data-testid="analytics-metric-value-flake"
                className="text-xs font-mono font-black text-amber-800 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200"
              >
                {faNum(result.scores.flakeTexture)}%
              </span>
            </div>
            <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
              <div
                className="bg-gradient-to-r from-amber-400 to-yellow-500 h-full rounded-full transition-all duration-700"
                style={{ width: `${result.scores.flakeTexture}%` }}
              />
            </div>
            <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
              <Droplets className="w-3.5 h-3.5 text-amber-600" />
              {t("dashboard.analytics.metrics.flakeHint")}
            </span>
          </div>
        </LuxuryTiltCard>

        {/* Metric 3 — from the actual engine severity, not an invented anagen value */}
        <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
          <div
            data-testid="analytics-metric-anagen"
            className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">
                {t("dashboard.analytics.metrics.anagen")}
              </span>
              <span
                data-testid="analytics-metric-value-anagen"
                className="text-xs font-mono font-black text-emerald-800 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200"
              >
                {faNum(100 - result.severity)}%
              </span>
            </div>
            <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
              <div
                className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full transition-all duration-700"
                style={{ width: `${100 - result.severity}%` }}
              />
            </div>
            <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              {t("dashboard.analytics.metrics.anagenHint")}
            </span>
          </div>
        </LuxuryTiltCard>

        {/* Metric 4 — scalp health complement, derived from the real severity */}
        <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
          <div
            data-testid="analytics-metric-hydration"
            className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">
                {t("dashboard.analytics.metrics.hydration")}
              </span>
              <span
                data-testid="analytics-metric-value-hydration"
                className="text-xs font-mono font-black text-[oklch(48%_0.095_12)] px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200"
              >
                {faNum(100 - Math.round((result.scores.flakeTexture + result.severity) / 2))}%
              </span>
            </div>
            <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
              <div
                className="rose-gold-gradient h-full rounded-full transition-all duration-700"
                style={{ width: `${100 - Math.round((result.scores.flakeTexture + result.severity) / 2)}%` }}
              />
            </div>
            <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
              <Dna className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
              {t("dashboard.analytics.metrics.hydrationHint")}
            </span>
          </div>
        </LuxuryTiltCard>
      </>
    );

  return (
    <section
      id="section-ai-studio"
      data-testid="analytics-section"
      className="scroll-mt-28 space-y-6"
      aria-label={t("dashboard.analytics.title")}
    >
      <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                data-testid="analytics-badge"
                className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]"
              >
                {t("dashboard.analytics.badge")}
              </span>
              <h2
                data-testid="analytics-heading"
                className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]"
              >
                {t("dashboard.analytics.heading")}
              </h2>
            </div>
            <p data-testid="analytics-subtitle" className="text-xs text-[oklch(45%_0.02_20)]">
              {t("dashboard.analytics.subtitle", { patient: patientName })}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {provenance && (
              <div
                data-testid="analytics-provenance"
                className="px-3 py-1.5 rounded-xl bg-white/80 border border-black/5 text-[0.7rem] font-mono text-[oklch(30%_0.02_20)] flex items-center gap-2 shadow-xs"
                title={`${provenance.imageHash} • ${provenance.analyzedAt}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>
                  {t("dashboard.analytics.provenanceLabel", {
                    model: provenance.modelVersion,
                  })}
                </span>
              </div>
            )}

            <button
              data-testid="analytics-rerun-btn"
              onClick={() => onRunAnalysis?.()}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-md shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 disabled:opacity-60 transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
              <span>
                {isAnalyzing ? t("dashboard.analytics.processing") : t("dashboard.analytics.rerun")}
              </span>
            </button>

            <button
              data-testid="analytics-back-btn"
              onClick={() => onNavigate?.("patients")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
              title={t("dashboard.analytics.backToTopTitle")}
            >
              <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
              <span className="hidden sm:inline">{t("dashboard.analytics.backToTop")}</span>
            </button>
          </div>
        </div>

          {/* Metric dials: only from a provenance-carrying engine result */}
          {result === null ? (
            <div
              data-testid="analytics-empty"
              className="p-8 rounded-3xl bg-white/50 border border-dashed border-stone-300 text-center space-y-2"
            >
              <p className="text-sm font-bold text-[oklch(30%_0.02_20)]">
                {data.state === "error"
                  ? t("dashboard.analytics.errorTitle")
                  : t("dashboard.analytics.emptyTitle")}
              </p>
              <p className="text-xs text-[oklch(45%_0.02_20)] max-w-md mx-auto">
                {t("dashboard.analytics.emptyHint", { patient: patientName })}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">{metricDials}</div>
          )}

          {/* Protocol Prescription Luxury Card */}
          <div className="p-6 md:p-7 rounded-[28px] bg-white/60 border border-white/80 backdrop-blur-xl shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl rose-gold-gradient text-white grid place-items-center shadow-md shadow-[oklch(62%_0.09_16/0.25)]">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4
                    data-testid="analytics-protocol-title"
                    className="text-sm font-bold text-[oklch(20%_0.02_20)]"
                  >
                    {t("dashboard.analytics.protocol.title")}
                  </h4>
                  <span className="text-[0.68rem] text-[oklch(45%_0.02_20)]">
                    {t("dashboard.analytics.protocol.subtitle")}
                  </span>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="analytics-education-btn"
                  onClick={() => onOpenEducation?.()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  title={t("dashboard.analytics.protocol.educationTitle")}
                >
                  <Brain className="w-3.5 h-3.5 text-amber-200" />
                  <span>{t("dashboard.analytics.protocol.education")}</span>
                </button>

                <button
                  type="button"
                  data-testid="analytics-pdf-btn"
                  onClick={() => onOpenPdfReport?.()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-xs text-[oklch(48%_0.095_12)] transition-all shadow-xs cursor-pointer"
                  title={t("dashboard.analytics.protocol.pdfTitle")}
                >
                  <Download className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span>{t("dashboard.analytics.protocol.pdf")}</span>
                </button>
              </div>
            </div>

            <div
              data-testid="analytics-recommendation"
              className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-[oklch(62%_0.09_16/0.2)] leading-relaxed text-xs text-[oklch(20%_0.02_20)] shadow-inner"
            >
              {result?.recommendation ?? t("dashboard.analytics.emptyHint", { patient: patientName })}
            </div>
          </div>
        </div>
    </section>
  );
};

export default AnalyticsSection;
