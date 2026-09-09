import React, { useState } from "react";
import { Camera, ChevronRight, Layers, Plus, Search, Sparkles } from "lucide-react";
import LuxuryTiltCard from "../LuxuryTiltCard.js";
import TrichologyRadarChart, { RadarMetric } from "../TrichologyRadarChart.js";
import FollicleCaliberWaveform from "../FollicleCaliberWaveform.js";
import type { Patient } from "../../data/dashboard-samples.js";
import type { SectionId } from "../dashboard-sections.js";

export interface PatientListSectionProps {
  /** Full patient roster (API-backed when online, local sample fallback otherwise). */
  patients: Patient[];
  /** Currently selected patient, owned by ClinicalDashboard. */
  selectedPatient: Patient;
  /** Fired with the patient id when a card (or its shortcuts) is activated. */
  onSelectPatient?: (id: string) => void;
  /** Opens the "new clinical record" modal, owned by ClinicalDashboard. */
  onAddPatient?: () => void;
  /** Smooth-scroll navigation to another dashboard section. */
  onNavigate?: (sectionId: SectionId) => void;
}

/**
 * SECTION 1 — Patient directory, 3D tilt cards, holographic radar matrix
 * and the telemetry/quick-action panel.
 *
 * Search state is local to this section (see Phase 3 of
 * docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md — no cross-section state coupling).
 * Radar metrics are derived from `selectedPatient` rather than passed in.
 */
export const PatientListSection: React.FC<PatientListSectionProps> = ({
  patients,
  selectedPatient,
  onSelectPatient,
  onAddPatient,
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPatients = patients.filter(
    (p) =>
      p.firstName.includes(searchQuery) ||
      p.lastName.includes(searchQuery) ||
      p.phone.includes(searchQuery)
  );

  // Dynamic Radar Metrics for Selected Patient
  const radarMetrics: RadarMetric[] = [
    { label: "تراکم تار", value: Math.min(100, Math.round(((selectedPatient.hairDensity || 148) / 180) * 100)), benchmark: 85 },
    { label: "فاز آناژن", value: selectedPatient.anagenRatio || 86, benchmark: 88 },
    { label: "کراتین و کورتکس", value: selectedPatient.keratinHealth || 92, benchmark: 90 },
    { label: "توازن سبوم", value: selectedPatient.sebumBalance || 78, benchmark: 80 },
    { label: "میکروسیرکولاسیون", value: selectedPatient.microcirculation || 84, benchmark: 85 },
    { label: "حیات سلول‌های بنیادی", value: selectedPatient.stemCellVitality || 89, benchmark: 90 },
  ];

  const selectPatient = (id: string) => {
    onSelectPatient?.(id);
  };

  return (
    <section id="section-patients" className="scroll-mt-28 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Patient Directory with 3D Tilt Cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    بخش ۱ از ۴
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    پرونده‌های تریکولوژی و آنالیز هوشمند
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">
                  پایش لحظه‌ای واحدهای فولیکولی، سلامت پوست سر و فرمولاسیون اختصاصی
                </p>
              </div>

              <button
                onClick={() => onAddPatient?.()}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>تشکیل پرونده بالینی جدید</span>
              </button>
            </div>

            {/* Glass Search Bar */}
            <div className="relative mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی نام بیمار، شماره تماس یا پروتکل تشخیصی..."
                className="w-full h-12 pr-12 pl-4 rounded-2xl bg-white/70 focus:bg-white backdrop-blur-xl border border-white/90 focus:border-[oklch(62%_0.09_16)] outline-none text-xs font-medium text-[oklch(20%_0.02_20)] shadow-inner transition-all placeholder:text-[oklch(55%_0.015_20)]"
              />
              <Search className="absolute right-4 top-3.5 w-5 h-5 text-stone-400" />
            </div>

            {/* Patient Cards (3D Tilt) */}
            <div className="space-y-3.5">
              {filteredPatients.map((patient) => {
                const isSelected = selectedPatient.id === patient.id;
                return (
                  <LuxuryTiltCard
                    key={patient.id}
                    maxTilt={4}
                    className="rounded-2xl cursor-pointer"
                  >
                    <div
                      onClick={() => selectPatient(patient.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectPatient(patient.id); }}
                      className={`p-4 md:p-5 rounded-2xl border transition-all flex items-center justify-between backdrop-blur-xl ${
                        isSelected
                          ? "bg-gradient-to-r from-white/95 via-rose-50/70 to-white/95 border-[oklch(62%_0.09_16/0.7)] shadow-lg shadow-[oklch(62%_0.09_16/0.12)] ring-2 ring-[oklch(62%_0.09_16/0.25)]"
                          : "bg-white/55 hover:bg-white/80 border-white/80 shadow-xs"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-2xl grid place-items-center font-bold text-sm shadow-sm ring-1 ${
                            isSelected
                              ? "rose-gold-gradient text-white ring-white/80"
                              : "bg-white/85 text-[oklch(48%_0.095_12)] ring-white/60 border border-[oklch(62%_0.09_16/0.3)]"
                          }`}
                        >
                          {patient.firstName.replace("دکتر ", "")[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[oklch(20%_0.02_20)]">
                              {patient.firstName} {patient.lastName}
                            </h3>
                            <span className="text-[0.65rem] px-2.5 py-0.5 rounded-full bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] font-extrabold border border-[oklch(62%_0.09_16/0.25)]">
                              {patient.scalpCondition || "ارزیابی سلامت مو"}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[0.72rem] text-[oklch(45%_0.02_20)] mt-1">
                            <span>تماس: {patient.phone}</span>
                            <span>•</span>
                            <span>آخرین ویزیت: {patient.lastVisit || "امروز"}</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-bold font-mono">تراکم: {patient.hairDensity || 148} تار/cm²</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectPatient(patient.id);
                            onNavigate?.("gallery");
                          }}
                          className="p-2.5 rounded-xl bg-white/70 hover:bg-white text-[oklch(40%_0.02_20)] border border-white/80 shadow-xs transition-all"
                          title="مشاهده در ویژن تریکوسکوپ 4K"
                        >
                          <Camera className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectPatient(patient.id);
                            onNavigate?.("ai-studio");
                          }}
                          className="p-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.3)] shadow-xs transition-all"
                          title="اسکن هوشمند AI"
                        >
                          <Sparkles className="w-4 h-4 text-amber-600" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-stone-400 mr-1" />
                      </div>
                    </div>
                  </LuxuryTiltCard>
                );
              })}
            </div>
          </div>

          {/* Longitudinal Waveform */}
          <FollicleCaliberWaveform
            currentCaliber="74 µm"
            densityTrend="+۲۱.۴٪ تراکم تجمعی"
          />
        </div>

        {/* Right 1 Col: Holographic Radar Matrix & Patient Biometrics */}
        <div className="space-y-4">
          <TrichologyRadarChart
            metrics={radarMetrics}
            title={`پروفایل هوشمند: ${selectedPatient.firstName} ${selectedPatient.lastName}`}
            subtitle="آنالیز ۶ بُعدی فولیکول و لایه‌های اپیدرم با دقت نورال"
            aiScore={Math.round(
              ((selectedPatient.anagenRatio || 86) + (selectedPatient.keratinHealth || 92)) / 2
            )}
          />

          <LuxuryTiltCard maxTilt={5} className="rounded-[32px]">
            <div className="rounded-[32px] p-6 space-y-4 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <span className="text-[0.7rem] font-mono font-bold tracking-widest uppercase text-[oklch(45%_0.02_20)]">
                  TELEMETRY MATRIX
                </span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-white/80 text-[oklch(35%_0.02_20)] border border-black/5 shadow-xs">
                  ID: {selectedPatient.id}
                </span>
              </div>

              {/* 3 Circular Biometric Gauges */}
              <div className="grid grid-cols-3 gap-2 py-2 text-center bg-white/60 backdrop-blur-md p-3 rounded-2xl border border-white/80 shadow-xs">
                <div>
                  <div className="text-[0.68rem] text-[oklch(45%_0.02_20)] font-medium">تراکم</div>
                  <div className="text-sm font-mono font-black text-[oklch(20%_0.02_20)] mt-0.5">
                    {selectedPatient.hairDensity || 148}
                  </div>
                  <div className="text-[0.6rem] text-stone-500">تار / cm²</div>
                </div>
                <div className="border-x border-black/5">
                  <div className="text-[0.68rem] text-[oklch(45%_0.02_20)] font-medium">فاز آناژن</div>
                  <div className="text-sm font-mono font-black text-emerald-700 mt-0.5">
                    {selectedPatient.anagenRatio || 86}٪
                  </div>
                  <div className="text-[0.6rem] text-emerald-600">رشد بهینه</div>
                </div>
                <div>
                  <div className="text-[0.68rem] text-[oklch(45%_0.02_20)] font-medium">کراتین</div>
                  <div className="text-sm font-mono font-black text-[oklch(48%_0.095_12)] mt-0.5">
                    {selectedPatient.keratinHealth || 92}٪
                  </div>
                  <div className="text-[0.6rem] text-stone-500">استحکام ماتریکس</div>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="pt-2 space-y-2.5">
                <button
                  onClick={() => onNavigate?.("gallery")}
                  className="w-full h-11 rounded-2xl bg-white/70 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-xs font-bold text-[oklch(48%_0.095_12)] flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  <Camera className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                  <span>ورود به ویژن تریکوسکوپ 4K (بخش ۲)</span>
                </button>

                <button
                  onClick={() => onNavigate?.("ai-studio")}
                  className="w-full h-11 rounded-2xl rose-gold-gradient text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>اجرای اسکن و فرمولاسیون پپتیدی (بخش ۳)</span>
                </button>

                <button
                  onClick={() => onNavigate?.("3d-model")}
                  className="w-full h-11 rounded-2xl bg-white/70 hover:bg-white border border-white/90 text-xs font-bold text-[oklch(35%_0.02_20)] flex items-center justify-center gap-2 transition-all shadow-xs"
                >
                  <Layers className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                  <span>مشاهده شبیه‌ساز ۳ بعدی ساقه مو (بخش ۴)</span>
                </button>
              </div>
            </div>
          </LuxuryTiltCard>
        </div>
      </div>
    </section>
  );
};

export default PatientListSection;
