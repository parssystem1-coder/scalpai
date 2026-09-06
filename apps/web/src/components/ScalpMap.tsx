import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Layers,
  Sparkles,
  Search,
  Flame,
  Droplets,
  Eye,
  Info,
} from "lucide-react";
import type { ConditionKey, SeverityLevel } from "@scalpai/education";

export type ScalpZoneKey = "frontal" | "vertex" | "temporal_left" | "temporal_right" | "occiput";
export type HeatmapMetric = "density" | "erythema" | "sebum";

export interface ZoneClinicalData {
  key: ScalpZoneKey;
  name: { fa: string; en: string };
  density: number; // hairs/cm2 (normal ~150-220)
  diameterDiversity: number; // % (normal <20%)
  erythemaScore: number; // 0-100
  sebumScore: number; // 0-100
  primaryCondition: ConditionKey;
  severity: SeverityLevel;
}

interface ScalpMapProps {
  patientName?: string;
  onDiveUnderSkin?: (zone: ZoneClinicalData) => void;
  customData?: Partial<Record<ScalpZoneKey, Partial<ZoneClinicalData>>>;
}

const DEFAULT_ZONE_DATA: Record<ScalpZoneKey, ZoneClinicalData> = {
  frontal: {
    key: "frontal",
    name: { fa: "خط رویش قدامی (Frontal)", en: "Frontal Hairline" },
    density: 125,
    diameterDiversity: 28,
    erythemaScore: 35,
    sebumScore: 65,
    primaryCondition: "androgenetic_alopecia",
    severity: "moderate",
  },
  vertex: {
    key: "vertex",
    name: { fa: "فرق سر و ورتکس (Vertex)", en: "Vertex / Crown" },
    density: 98,
    diameterDiversity: 38,
    erythemaScore: 52,
    sebumScore: 78,
    primaryCondition: "androgenetic_alopecia",
    severity: "severe",
  },
  temporal_left: {
    key: "temporal_left",
    name: { fa: "گیجگاهی چپ (Left Temple)", en: "Left Temporal" },
    density: 140,
    diameterDiversity: 22,
    erythemaScore: 28,
    sebumScore: 50,
    primaryCondition: "telogen_effluvium",
    severity: "mild",
  },
  temporal_right: {
    key: "temporal_right",
    name: { fa: "گیجگاهی راست (Right Temple)", en: "Right Temporal" },
    density: 135,
    diameterDiversity: 25,
    erythemaScore: 30,
    sebumScore: 55,
    primaryCondition: "telogen_effluvium",
    severity: "mild",
  },
  occiput: {
    key: "occiput",
    name: { fa: "پس‌سر و بانک مو (Occiput)", en: "Occiput / Donor Area" },
    density: 195,
    diameterDiversity: 12,
    erythemaScore: 18,
    sebumScore: 40,
    primaryCondition: "scalp_dryness",
    severity: "mild",
  },
};

export default function ScalpMap({
  patientName = "بیمار",
  onDiveUnderSkin,
  customData,
}: ScalpMapProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language === "fa";

  const [activeMetric, setActiveMetric] = useState<HeatmapMetric>("density");
  const [selectedZoneKey, setSelectedZoneKey] = useState<ScalpZoneKey>("vertex");
  const [isDiving, setIsDiving] = useState(false);

  // Merge custom data if provided
  const zoneData: Record<ScalpZoneKey, ZoneClinicalData> = {
    frontal: { ...DEFAULT_ZONE_DATA.frontal, ...customData?.frontal },
    vertex: { ...DEFAULT_ZONE_DATA.vertex, ...customData?.vertex },
    temporal_left: { ...DEFAULT_ZONE_DATA.temporal_left, ...customData?.temporal_left },
    temporal_right: { ...DEFAULT_ZONE_DATA.temporal_right, ...customData?.temporal_right },
    occiput: { ...DEFAULT_ZONE_DATA.occiput, ...customData?.occiput },
  };

  const selectedZone = zoneData[selectedZoneKey];

  // Heatmap color generator
  const getZoneFill = (zone: ZoneClinicalData) => {
    if (activeMetric === "density") {
      // High density = green/teal, Low density = red/crimson
      if (zone.density < 110) return "#dc2626"; // severe thinning
      if (zone.density < 150) return "#f59e0b"; // moderate thinning
      return "#10b981"; // healthy density
    }
    if (activeMetric === "erythema") {
      // High redness = crimson red, Low redness = calm cyan/gray
      if (zone.erythemaScore > 50) return "#ef4444";
      if (zone.erythemaScore > 30) return "#f97316";
      return "#06b6d4";
    }
    // sebum metric
    if (zone.sebumScore > 70) return "#eab308"; // oily yellow
    if (zone.sebumScore < 25) return "#3b82f6"; // dry blue
    return "#10b981"; // balanced
  };

  // Signature transition trigger: "ورود به زیر پوست"
  const handleTriggerDive = () => {
    setIsDiving(true);
    setTimeout(() => {
      setIsDiving(false);
      onDiveUnderSkin?.(selectedZone);
    }, 850);
  };

  return (
    <div
      id="scalp-map-card"
      className="relative rounded-3xl bg-[#0e1318] border border-stone-800 text-stone-100 shadow-xl overflow-hidden p-5 md:p-7 space-y-6"
      dir={isFa ? "rtl" : "ltr"}
    >
      {/* Cinematic Dive Transition Overlay */}
      {isDiving && (
        <div className="absolute inset-0 z-50 bg-stone-950 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-50 duration-700 backdrop-blur-xl">
          <div className="w-16 h-16 rounded-full border-4 border-t-[oklch(62%_0.09_16)] border-stone-700 animate-spin flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-[oklch(75%_0.14_25)] animate-pulse" />
          </div>
          <h4 className="text-lg font-bold text-white tracking-wide">
            {isFa ? "ترنزیشن اختصاصی: نفوذ به زیر پوست سر..." : "Signature Transition: Penetrating Subcutaneous Layer..."}
          </h4>
          <p className="text-xs text-stone-400 mt-1 max-w-sm">
            {isFa
              ? `زوم میکروسکوپیک به بستر فولیکولی ناحیه: ${selectedZone.name.fa}`
              : `Microscopic zoom into follicular bed of: ${selectedZone.name.en}`}
          </p>
        </div>
      )}

      {/* Scalp Map Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              {isFa ? "نقشه زنده پوست سر (Scalp Map Hero)" : "Scalp Map Live Dashboard"}
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[oklch(62%_0.09_16/0.2)] text-[oklch(75%_0.14_25)] border border-[oklch(62%_0.09_16/0.4)]">
              DESIGN-V2 §12
            </span>
          </div>
          <p className="text-xs text-stone-400 mt-0.5">
            {isFa
              ? `توزیع هیت‌مپ نواحی ۵ گانه تریکوسکوپی برای پرونده: ${patientName}`
              : `5-zone trichoscopy heatmap distribution for: ${patientName}`}
          </p>
        </div>

        {/* Heatmap Layer Selector */}
        <div className="flex items-center gap-1.5 bg-stone-900 p-1 rounded-2xl border border-stone-800">
          <button
            type="button"
            onClick={() => setActiveMetric("density")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeMetric === "density"
                ? "bg-[oklch(62%_0.09_16)] text-white shadow-xs font-bold"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{isFa ? "تراکم (Density)" : "Density"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMetric("erythema")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeMetric === "erythema"
                ? "bg-red-600 text-white shadow-xs font-bold"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>{isFa ? "قرمزی (Erythema)" : "Erythema"}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMetric("sebum")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeMetric === "sebum"
                ? "bg-amber-600 text-white shadow-xs font-bold"
                : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>{isFa ? "چربی (Sebum)" : "Sebum"}</span>
          </button>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG Scalp Anatomy Diagram (6 cols) */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center relative p-4 rounded-2xl bg-stone-950/60 border border-stone-800/80">
          <div className="text-[11px] font-mono text-stone-400 absolute top-3 left-4 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-stone-500" />
            <span>ANTERIOR (جلو)</span>
          </div>

          <svg
            viewBox="0 0 400 440"
            className="w-full max-w-[340px] aspect-square select-none drop-shadow-xl"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer Head Contour */}
            <path
              d="M 200 40 C 290 40, 350 110, 350 220 C 350 330, 290 400, 200 400 C 110 400, 50 330, 50 220 C 50 110, 110 40, 200 40 Z"
              fill="#18181b"
              stroke="#3f3f46"
              strokeWidth="2.5"
            />

            {/* Nose indicator (Top / Anterior) */}
            <path d="M 190 38 Q 200 20 210 38" fill="none" stroke="#71717a" strokeWidth="2.5" />

            {/* Ears (Left & Right) */}
            <path d="M 46 195 Q 30 220 46 245" fill="none" stroke="#52525b" strokeWidth="2" />
            <path d="M 354 195 Q 370 220 354 245" fill="none" stroke="#52525b" strokeWidth="2" />

            {/* Zone 1: Frontal Hairline */}
            <g
              onClick={() => setSelectedZoneKey("frontal")}
              className="cursor-pointer transition-transform hover:opacity-90"
            >
              <path
                d="M 115 100 Q 200 65 285 100 Q 250 145 200 145 Q 150 145 115 100 Z"
                fill={getZoneFill(zoneData.frontal)}
                opacity={selectedZoneKey === "frontal" ? "0.95" : "0.65"}
                stroke={selectedZoneKey === "frontal" ? "#ffffff" : "#27272a"}
                strokeWidth={selectedZoneKey === "frontal" ? "2.5" : "1"}
              />
              <text x="200" y="115" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">
                Frontal (قدامی)
              </text>
            </g>

            {/* Zone 2: Vertex / Crown (Center) */}
            <g
              onClick={() => setSelectedZoneKey("vertex")}
              className="cursor-pointer transition-transform hover:opacity-90"
            >
              <ellipse
                cx="200"
                cy="210"
                rx="65"
                ry="55"
                fill={getZoneFill(zoneData.vertex)}
                opacity={selectedZoneKey === "vertex" ? "0.95" : "0.65"}
                stroke={selectedZoneKey === "vertex" ? "#ffffff" : "#27272a"}
                strokeWidth={selectedZoneKey === "vertex" ? "3" : "1"}
              />
              <text x="200" y="214" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="bold">
                Vertex (فرق سر)
              </text>
            </g>

            {/* Zone 3: Left Temporal */}
            <g
              onClick={() => setSelectedZoneKey("temporal_left")}
              className="cursor-pointer transition-transform hover:opacity-90"
            >
              <path
                d="M 75 140 Q 125 145 130 210 Q 95 240 70 210 Q 65 170 75 140 Z"
                fill={getZoneFill(zoneData.temporal_left)}
                opacity={selectedZoneKey === "temporal_left" ? "0.95" : "0.65"}
                stroke={selectedZoneKey === "temporal_left" ? "#ffffff" : "#27272a"}
                strokeWidth={selectedZoneKey === "temporal_left" ? "2.5" : "1"}
              />
              <text x="100" y="185" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                گیجگاهی چپ
              </text>
            </g>

            {/* Zone 4: Right Temporal */}
            <g
              onClick={() => setSelectedZoneKey("temporal_right")}
              className="cursor-pointer transition-transform hover:opacity-90"
            >
              <path
                d="M 325 140 Q 275 145 270 210 Q 305 240 330 210 Q 335 170 325 140 Z"
                fill={getZoneFill(zoneData.temporal_right)}
                opacity={selectedZoneKey === "temporal_right" ? "0.95" : "0.65"}
                stroke={selectedZoneKey === "temporal_right" ? "#ffffff" : "#27272a"}
                strokeWidth={selectedZoneKey === "temporal_right" ? "2.5" : "1"}
              />
              <text x="300" y="185" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold">
                گیجگاهی راست
              </text>
            </g>

            {/* Zone 5: Occipital (Donor / Posterior) */}
            <g
              onClick={() => setSelectedZoneKey("occiput")}
              className="cursor-pointer transition-transform hover:opacity-90"
            >
              <path
                d="M 120 285 Q 200 270 280 285 Q 260 375 200 380 Q 140 375 120 285 Z"
                fill={getZoneFill(zoneData.occiput)}
                opacity={selectedZoneKey === "occiput" ? "0.95" : "0.65"}
                stroke={selectedZoneKey === "occiput" ? "#ffffff" : "#27272a"}
                strokeWidth={selectedZoneKey === "occiput" ? "2.5" : "1"}
              />
              <text x="200" y="335" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold">
                Occiput (بانک مو)
              </text>
            </g>
          </svg>

          <div className="text-[11px] font-mono text-stone-400 absolute bottom-3 left-4 flex items-center gap-1.5">
            <span>POSTERIOR (پشت سر)</span>
          </div>
        </div>

        {/* Selected Zone Trichometric Insights (6 cols) */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-4">
          <div className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase text-[oklch(75%_0.14_25)] font-bold">
                  ACTIVE REGION ANALYSIS
                </span>
                <h4 className="text-base font-bold text-white mt-0.5">
                  {isFa ? selectedZone.name.fa : selectedZone.name.en}
                </h4>
              </div>

              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                  selectedZone.severity === "mild"
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    : selectedZone.severity === "moderate"
                    ? "bg-amber-950 text-amber-300 border border-amber-800"
                    : "bg-red-950 text-red-300 border border-red-800"
                }`}
              >
                {selectedZone.severity.toUpperCase()} ALERT
              </span>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
                <div className="text-[11px] text-stone-400 font-medium">{isFa ? "تراکم مو:" : "Density:"}</div>
                <div className="text-lg font-bold text-white mt-0.5 flex items-baseline gap-1">
                  <span>{selectedZone.density}</span>
                  <span className="text-[10px] text-stone-500 font-normal">hairs/cm²</span>
                </div>
                <div className="text-[10px] text-stone-500 mt-1">نرمال: ۱۸۰-۲۲۰</div>
              </div>

              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
                <div className="text-[11px] text-stone-400 font-medium">{isFa ? "تنوع قطر مو:" : "Anisotrichosis:"}</div>
                <div className="text-lg font-bold text-white mt-0.5 flex items-baseline gap-1">
                  <span>{selectedZone.diameterDiversity}%</span>
                  <span className="text-[10px] text-stone-500 font-normal">diversity</span>
                </div>
                <div className="text-[10px] text-stone-500 mt-1">&gt;۲۰٪ = نشانه مینیاتوریزه</div>
              </div>

              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
                <div className="text-[11px] text-stone-400 font-medium">{isFa ? "شاخص قرمزی/التهاب:" : "Erythema:"}</div>
                <div className="text-lg font-bold text-red-400 mt-0.5">{selectedZone.erythemaScore}/100</div>
                <div className="text-[10px] text-stone-500 mt-1">احتقان عروق مویرگی</div>
              </div>

              <div className="p-3 rounded-xl bg-stone-950 border border-stone-800">
                <div className="text-[11px] text-stone-400 font-medium">{isFa ? "ترشح سبوم سطحی:" : "Sebum:"}</div>
                <div className="text-lg font-bold text-amber-400 mt-0.5">{selectedZone.sebumScore}/100</div>
                <div className="text-[10px] text-stone-500 mt-1">وضعیت لیپید و غدد</div>
              </div>
            </div>

            {/* Pathological Correlation */}
            <div className="p-3.5 rounded-xl bg-stone-950/80 border border-stone-800 flex items-start gap-2.5 text-xs text-stone-300">
              <Info className="w-4 h-4 text-[oklch(62%_0.09_16)] shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                {isFa
                  ? `یافته غالب در این ناحیه نشان‌دهنده الگوی ${selectedZone.primaryCondition.replace(/_/g, " ")} است. شدت عارضه در این مقطع بالینی ${selectedZone.severity === "severe" ? "شدید" : selectedZone.severity === "moderate" ? "متوسط" : "خفیف"} برآورد شده است.`
                  : `Primary trichoscopic finding correlates with ${selectedZone.primaryCondition.replace(/_/g, " ")} (${selectedZone.severity} severity).`}
              </p>
            </div>
          </div>

          {/* SIGNATURE MOMENT BUTTON: "ورود به زیر پوست" (Penetrate to Subcutaneous Follicular Layer) */}
          <button
            type="button"
            onClick={handleTriggerDive}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-2xl font-bold text-xs md:text-sm rose-gold-gradient text-white hover:brightness-110 shadow-lg transition-all cursor-pointer group"
          >
            <Sparkles className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            <span>
              {isFa
                ? `ترنزیشن سینمایی: ورود به زیر پوست سر (${selectedZone.name.fa.split(" ")[0]})`
                : `Signature Dive: Penetrate Under Scalp Skin`}
            </span>
            <Eye className="w-4 h-4 opacity-80" />
          </button>
        </div>
      </div>
    </div>
  );
}
