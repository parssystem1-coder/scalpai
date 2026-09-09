import React from "react";
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

/** Neural-engine output rendered by this section. */
export interface AnalyticsData {
  scores: { redness: number; flakeTexture: number; densityProxy: number };
  severity: number;
  anagenRatio: number;
  hairCaliber: string;
  recommendation: string;
  matrixHydration: number;
  tensorConfidence: number;
  follicularUnits: { single: number; double: number; triple: number };
}

export interface AnalyticsSectionProps {
  /** Aggregated clinical metrics + prescribed protocol. */
  data: AnalyticsData;
  /** Display name of the patient the analysis belongs to. */
  patientName: string;
  /** True while the neural engine is crunching the matrix. */
  isAnalyzing?: boolean;
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
 * SECTION 3 — AI trichology studio: holographic metric dials and the
 * AI-synthesised treatment protocol card.
 *
 * Pure presentational: every metric arrives through `data`, all mutations
 * are delegated to ClinicalDashboard through callbacks.
 */
export const AnalyticsSection: React.FC<AnalyticsSectionProps> = ({
  data,
  patientName,
  isAnalyzing = false,
  onRunAnalysis,
  onOpenEducation,
  onOpenPdfReport,
  onNavigate,
}) => {
  return (
    <section id="section-ai-studio" className="scroll-mt-28 space-y-6">
      <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                بخش ۳ از ۴
              </span>
              <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                استودیوی آنالیز عمیق تریکولوژی (Neural Engine Vision)
              </h2>
            </div>
            <p className="text-xs text-[oklch(45%_0.02_20)]">
              محاسبه شاخص‌های لایه‌های بیولوژیک و تدوین پروتکل مزوتراپی / پپتید برای {patientName}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-white/80 border border-black/5 text-[0.7rem] font-mono text-[oklch(30%_0.02_20)] flex items-center gap-2 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Tensor Confidence: {data.tensorConfidence}%</span>
            </div>

            <button
              onClick={() => onRunAnalysis?.()}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-md shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 disabled:opacity-60 transition-all active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? "animate-spin" : ""}`} />
              <span>{isAnalyzing ? "پردازش ماتریس..." : "اجرای مجدد اسکن AI"}</span>
            </button>

            <button
              onClick={() => onNavigate?.("patients")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
              title="بازگشت به ابتدای پرونده"
            >
              <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
              <span className="hidden sm:inline">ابتدای پرونده</span>
            </button>
          </div>
        </div>

          {/* 4 Holographic 3D Metric Dials */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            {/* Metric 1 */}
            <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
              <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">اریتم و التهاب پوست سر</span>
                  <span className="text-xs font-mono font-black text-rose-700 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200">
                    {data.scores.redness}%
                  </span>
                </div>
                <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                  <div
                    className="bg-gradient-to-r from-rose-500 to-red-500 h-full rounded-full transition-all duration-700 shadow-xs"
                    style={{ width: `${data.scores.redness}%` }}
                  />
                </div>
                <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                  <Flame className="w-3.5 h-3.5 text-rose-500" />
                  وضعیت: میکروالتهاب فولیکولی ملایم
                </span>
              </div>
            </LuxuryTiltCard>

            {/* Metric 2 */}
            <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
              <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">تجمع سبوم و پوسته لایه شاخی</span>
                  <span className="text-xs font-mono font-black text-amber-800 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200">
                    {data.scores.flakeTexture}%
                  </span>
                </div>
                <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                  <div
                    className="bg-gradient-to-r from-amber-400 to-yellow-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${data.scores.flakeTexture}%` }}
                  />
                </div>
                <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                  <Droplets className="w-3.5 h-3.5 text-amber-600" />
                  نیازمند اسکراب لایه‌بردار AHA/BHA
                </span>
              </div>
            </LuxuryTiltCard>

            {/* Metric 3 */}
            <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
              <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">فاز رشد فعال (آناژن)</span>
                  <span className="text-xs font-mono font-black text-emerald-800 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
                    {data.anagenRatio}%
                  </span>
                </div>
                <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                  <div
                    className="bg-gradient-to-r from-emerald-400 to-teal-500 h-full rounded-full transition-all duration-700"
                    style={{ width: `${data.anagenRatio}%` }}
                  />
                </div>
                <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  توازن متابولیک مطلوب پیاز مو
                </span>
              </div>
            </LuxuryTiltCard>

            {/* Metric 4 */}
            <LuxuryTiltCard maxTilt={6} className="rounded-3xl">
              <div className="p-5 rounded-3xl bg-white/60 border border-white/80 backdrop-blur-xl shadow-md flex flex-col justify-between h-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">هیدراتاسیون ماتریکس مو</span>
                  <span className="text-xs font-mono font-black text-[oklch(48%_0.095_12)] px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200">
                    {data.matrixHydration}٪
                  </span>
                </div>
                <div className="my-4 w-full bg-stone-200/70 h-2.5 rounded-full overflow-hidden border border-white/60">
                  <div
                    className="rose-gold-gradient h-full rounded-full transition-all duration-700"
                    style={{ width: `${data.matrixHydration}%` }}
                  />
                </div>
                <span className="text-[0.68rem] text-[oklch(45%_0.02_20)] flex items-center gap-1 font-medium">
                  <Dna className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  کوتیکول صاف و ساختار کورتکس محکم
                </span>
              </div>
            </LuxuryTiltCard>
          </div>

          {/* Protocol Prescription Luxury Card */}
          <div className="p-6 md:p-7 rounded-[28px] bg-white/60 border border-white/80 backdrop-blur-xl shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl rose-gold-gradient text-white grid place-items-center shadow-md shadow-[oklch(62%_0.09_16/0.25)]">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[oklch(20%_0.02_20)]">
                    پروتکل تجویزی و روتین درمانی اختصاصی (AI Clinical Formulation)
                  </h4>
                  <span className="text-[0.68rem] text-[oklch(45%_0.02_20)]">
                    سنتز شده توسط هوش مصنوعی بر پایه وزن مولکولی پپتیدها و وضعیت بیوشیمیایی اسکالپ
                  </span>
                </div>
              </div>

              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onOpenEducation?.()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                  title="مشاهده شبیه‌ساز سه‌بعدی متناسب با تشخیص AI"
                >
                  <Brain className="w-3.5 h-3.5 text-amber-200" />
                  <span>شبیه‌ساز ۳ بعدی و توجیه بیمار</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenPdfReport?.()}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white border border-[oklch(62%_0.09_16/0.4)] text-xs text-[oklch(48%_0.095_12)] transition-all shadow-xs cursor-pointer"
                  title="صدور گزارش رسمی تریکوسکوپی با سربرگ و نسخه"
                >
                  <Download className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span>صدور نسخه و گزارش PDF</span>
                </button>
              </div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-[oklch(62%_0.09_16/0.2)] leading-relaxed text-xs text-[oklch(20%_0.02_20)] shadow-inner">
              {data.recommendation}
            </div>
          </div>
        </div>
    </section>
  );
};

export default AnalyticsSection;
