import React, { Suspense, lazy } from "react";
import { ArrowUp, HeartHandshake } from "lucide-react";
import { useTranslation } from "react-i18next";
import FeatureErrorBoundary from "../FeatureErrorBoundary";
import type { Patient } from "../../data/dashboard-types";
const LuxuryScalp3D = lazy(() => import("../LuxuryScalp3D"));

export default function HologramSection({ selectedPatient, onBackToPatients }: { selectedPatient: Patient; onBackToPatients: () => void }) {
  const { t } = useTranslation();
  return (
        <section id="section-3d-model" className="scroll-mt-28 space-y-6">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    {t("dashboard.hologram.badge")}
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    {t("dashboard.hologram.heading")}
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">{t("dashboard.hologram.subtitle")}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs bg-white/80 px-4 py-2 rounded-2xl border border-white/80 shadow-xs">
                  <HeartHandshake className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                  <span className="font-bold text-[oklch(20%_0.02_20)]">
                    {t("dashboard.hologram.patient", {
                      patient: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
                    })}
                  </span>
                </div>

                <button
                  onClick={() => onBackToPatients()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
                  title={t("dashboard.hologram.backToTopTitle")}
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span className="hidden sm:inline">{t("dashboard.hologram.backToTop")}</span>
                </button>
              </div>
            </div>

            {/* Embed 3D Scalp Stage */}
            <div
              className="w-full rounded-[28px] overflow-hidden border border-white/80 shadow-2xl bg-white/40 backdrop-blur-xl"
              style={{ contain: "layout paint", contentVisibility: "auto" }}
            >
              <FeatureErrorBoundary
                title={t("dashboard.hologram.errorTitle")}
                description={t("dashboard.hologram.errorDescription")}
                resetLabel={t("dashboard.hologram.retry")}
              >
                <Suspense
                  fallback={
                    <div
                      role="status"
                      aria-label={t("dashboard.hologram.loading")}
                      className="h-[450px] flex items-center justify-center text-xs font-bold text-stone-500"
                    >
                      {t("dashboard.hologram.loading")}
                    </div>
                  }
                >
                  <LuxuryScalp3D />
                </Suspense>
              </FeatureErrorBoundary>
            </div>
          </div>
        </section>
  );
}
