import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Award,
  Layers,
  Info,
  ChevronRight,
  Eye,
  Sliders,
} from "lucide-react";
import {
  CLINICAL_STORYBOARDS,
  type ConditionKey,
  type SeverityLevel,
  type MappedStoryboard,
  getStoryboardWithSeverity,
} from "@scalpai/education";

interface EducationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCondition?: ConditionKey;
  initialSeverity?: SeverityLevel;
  patientName?: string;
}

export default function EducationModal({
  isOpen,
  onClose,
  initialCondition = "androgenetic_alopecia",
  initialSeverity = "moderate",
  patientName = "بیمار",
}: EducationModalProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language === "fa";

  const [selectedCondition, setSelectedCondition] = useState<ConditionKey>(initialCondition);
  const [severity, setSeverity] = useState<SeverityLevel>(initialSeverity);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [reducedMotion, setReducedMotion] = useState(false);
  const [activeCameraStep, setActiveCameraStep] = useState(0);

  // Detect system prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, []);

  // Update selection if props change
  useEffect(() => {
    setSelectedCondition(initialCondition);
    setSeverity(initialSeverity);
  }, [initialCondition, initialSeverity]);

  // Storyboard animation playback loop (simulation of Rive state machine ticks)
  useEffect(() => {
    if (!isOpen || !isPlaying || reducedMotion) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 0; // Loop or cycle
        }
        return prev + 1;
      });
    }, 60);

    return () => clearInterval(interval);
  }, [isOpen, isPlaying, reducedMotion]);

  // Camera steps synced to progress
  useEffect(() => {
    if (progress < 33) setActiveCameraStep(0);
    else if (progress < 66) setActiveCameraStep(1);
    else setActiveCameraStep(2);
  }, [progress]);

  if (!isOpen) return null;

  const currentStoryboard: MappedStoryboard = getStoryboardWithSeverity(selectedCondition, severity);
  const def = currentStoryboard.definition;
  const conditionList = Object.keys(CLINICAL_STORYBOARDS) as ConditionKey[];

  return (
    <div
      id="education-modal-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/75 p-3 md:p-6 backdrop-blur-lg animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        id="education-modal-container"
        className="relative my-auto w-full max-w-5xl rounded-3xl bg-[#0d1217] text-stone-100 shadow-2xl border border-stone-800 overflow-hidden flex flex-col max-h-[92vh]"
        dir={isFa ? "rtl" : "ltr"}
      >
        {/* Top Clinical Header & §11 Always Skippable Controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-900/80 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[oklch(62%_0.09_16/0.2)] border border-[oklch(62%_0.09_16/0.4)] flex items-center justify-center text-[oklch(75%_0.14_25)] shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm md:text-base font-bold text-white">
                  {isFa ? "لایه آموزش تعاملی سه بعدی (Education E1)" : "Clinical 3D Education Layer (E1)"}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
                  DESIGN-V2 §11
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {isFa
                  ? `انیمیشن میکروسکوپیک آسیب‌شناسی پوست سر برای: ${patientName}`
                  : `Pathophysiological trichoscopy simulation for: ${patientName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Reduced motion toggle */}
            <button
              type="button"
              onClick={() => setReducedMotion(!reducedMotion)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                reducedMotion
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-stone-800/60 text-stone-400 border-stone-700 hover:text-stone-200"
              }`}
              title={isFa ? "تغییر به حالت بدون حرکت (ایستا)" : "Toggle Reduced Motion mode"}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {reducedMotion ? (isFa ? "حالت ایستا فعال" : "Reduced Motion: ON") : (isFa ? "حالت متحرک" : "Motion: ON")}
              </span>
            </button>

            {/* §11 Strict Rule: Skip is ALWAYS available */}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors shadow-xs cursor-pointer"
            >
              <span>{isFa ? "رد کردن (Skip)" : "Skip"}</span>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Condition Selector Tabs (All 8 Conditions) */}
        <div className="flex items-center gap-1.5 px-6 py-2 bg-stone-900/40 border-b border-stone-800/80 overflow-x-auto scrollbar-none shrink-0">
          <span className="text-[11px] text-stone-400 font-bold whitespace-nowrap pl-2">
            {isFa ? "عارضه‌های ۸ گانه بالینی:" : "Conditions:"}
          </span>
          {conditionList.map((cond) => {
            const isSelected = selectedCondition === cond;
            const sb = CLINICAL_STORYBOARDS[cond];
            return (
              <button
                key={cond}
                type="button"
                onClick={() => {
                  setSelectedCondition(cond);
                  setProgress(0);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? "bg-[oklch(62%_0.09_16)] text-white shadow-xs font-bold"
                    : "bg-stone-800/50 text-stone-400 hover:bg-stone-800 hover:text-stone-200"
                }`}
              >
                <span>{isFa ? sb.title.fa : sb.title.en}</span>
              </button>
            );
          })}
        </div>

        {/* Main Stage Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1">
          {/* Canvas / SVG Animated State Machine Visualizer (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="relative aspect-4/3 sm:aspect-16/10 rounded-2xl bg-stone-950 border border-stone-800 overflow-hidden flex items-center justify-center p-4 group">
              {/* Grid backdrop */}
              <div className="absolute inset-0 bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />

              {/* Rive / Procedural Medical Vector Visualizer */}
              <svg
                viewBox="0 0 600 400"
                className="w-full h-full relative z-10 select-none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  {/* Epidermis gradient */}
                  <linearGradient id="epidermisGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fca5a5" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#f87171" stopOpacity="0.4" />
                  </linearGradient>
                  {/* Dermis gradient */}
                  <linearGradient id="dermisGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#451a03" stopOpacity="0.7" />
                    <stop offset="100%" stopColor="#1c1917" stopOpacity="0.9" />
                  </linearGradient>
                  {/* Hair shaft gradient */}
                  <linearGradient id="shaftGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="50%" stopColor="#334155" />
                    <stop offset="100%" stopColor="#0f172a" />
                  </linearGradient>
                </defs>

                {/* Layer 1: Scalp Surface & Stratum Corneum (y: 100 to 120) */}
                <rect x="50" y="100" width="500" height="25" rx="4" fill="url(#epidermisGrad)" />
                <text x="60" y="116" fill="#fecaca" fontSize="10" fontFamily="sans-serif" fontWeight="bold">
                  Epidermis (لایه اپیدرم سطحی)
                </text>

                {/* Layer 2: Deep Dermis (y: 125 to 340) */}
                <rect x="50" y="125" width="500" height="215" rx="6" fill="url(#dermisGrad)" stroke="#78350f" strokeWidth="1" />
                <text x="60" y="145" fill="#fed7aa" fontSize="10" fontFamily="sans-serif">
                  Dermis & Subcutis (بستر درم و چربی عمقی)
                </text>

                {/* Blood Microvessels / Capillary loops at bottom */}
                <path
                  d="M 80 320 Q 150 280 220 320 T 360 320 T 500 320"
                  fill="none"
                  stroke={selectedCondition === "erythema" ? "#ef4444" : "#991b1b"}
                  strokeWidth={selectedCondition === "erythema" ? (severity === "severe" ? "6" : "4") : "2"}
                  strokeDasharray={isPlaying && !reducedMotion ? "6 3" : undefined}
                  className={selectedCondition === "erythema" ? "animate-pulse" : ""}
                />
                <text x="420" y="335" fill="#f87171" fontSize="9" fontFamily="sans-serif">
                  Capillary loops (شبکه مویرگی)
                </text>

                {/* Follicular Canal & Hair Shaft */}
                {/* Hair shaft width varies by condition & severity (Miniaturization demonstration) */}
                {(() => {
                  let shaftWidth = 24;
                  if (selectedCondition === "androgenetic_alopecia") {
                    shaftWidth = severity === "mild" ? 18 : severity === "moderate" ? 10 : 4;
                  }
                  const shaftX = 300 - shaftWidth / 2;
                  const isMiniaturized = selectedCondition === "androgenetic_alopecia" && severity === "severe";

                  return (
                    <g>
                      {/* Follicular sheath boundary */}
                      <path
                        d="M 270 100 L 270 260 Q 300 295 330 260 L 330 100 Z"
                        fill="#292524"
                        stroke="#57534e"
                        strokeWidth="2"
                      />

                      {/* Hair Bulb & Dermal Papilla at bottom */}
                      <ellipse
                        cx="300"
                        cy="270"
                        rx={isMiniaturized ? "14" : "24"}
                        ry={isMiniaturized ? "12" : "20"}
                        fill={selectedCondition === "folliculitis" ? "#b91c1c" : "#e11d48"}
                        opacity="0.8"
                      />
                      <circle
                        cx="300"
                        cy="275"
                        r={isMiniaturized ? "5" : "10"}
                        fill="#fef08a"
                        opacity="0.9"
                      />

                      {/* Hair Shaft emerging from bulb */}
                      <rect
                        x={shaftX}
                        y={selectedCondition === "telogen_effluvium" && severity === "severe" ? "130" : "50"}
                        width={shaftWidth}
                        height={selectedCondition === "telogen_effluvium" && severity === "severe" ? "140" : "220"}
                        rx={shaftWidth / 4}
                        fill="url(#shaftGrad)"
                        stroke="#64748b"
                        strokeWidth="1"
                      />

                      {/* Telogen Club Hair indication */}
                      {selectedCondition === "telogen_effluvium" && (
                        <circle
                          cx="300"
                          cy={severity === "severe" ? "265" : "268"}
                          r="10"
                          fill="#facc15"
                          stroke="#eab308"
                          strokeWidth="2"
                        />
                      )}
                    </g>
                  );
                })()}

                {/* Sebaceous Gland (Left side of follicle: x: 230 to 270, y: 160 to 195) */}
                {(() => {
                  const isHyper = selectedCondition === "hyperseborrhea";
                  const glandScale = isHyper ? (severity === "severe" ? 1.6 : 1.3) : 1;
                  return (
                    <g transform={`translate(245, 175) scale(${glandScale}) translate(-245, -175)`}>
                      <ellipse cx="245" cy="175" rx="20" ry="15" fill="#eab308" opacity="0.85" />
                      <ellipse cx="235" cy="182" rx="14" ry="11" fill="#facc15" opacity="0.9" />
                      <ellipse cx="255" cy="180" rx="12" ry="9" fill="#fde047" opacity="0.9" />
                      <path d="M 255 175 L 270 178" stroke="#ca8a04" strokeWidth="3" strokeLinecap="round" />
                    </g>
                  );
                })()}

                {/* Condition-specific Pathological Overlays */}
                {/* 1. Hyperseborrhea: Sebum lake in ostium */}
                {selectedCondition === "hyperseborrhea" && (
                  <ellipse
                    cx="300"
                    cy="100"
                    rx={severity === "severe" ? "40" : "25"}
                    ry="8"
                    fill="#facc15"
                    opacity={severity === "severe" ? "0.9" : "0.7"}
                    stroke="#ca8a04"
                    strokeWidth="1.5"
                  />
                )}

                {/* 2. Seborrheic Dermatitis: Yellowish Parakeratotic Flakes on surface */}
                {selectedCondition === "seborrheic_dermatitis" && (
                  <g>
                    <path
                      d="M 180 96 Q 220 85 260 98 Q 240 92 200 97 Z"
                      fill="#fef08a"
                      stroke="#eab308"
                      strokeWidth="1"
                    />
                    <path
                      d="M 330 95 Q 380 82 430 96 Q 390 90 350 97 Z"
                      fill="#fef08a"
                      stroke="#eab308"
                      strokeWidth="1"
                    />
                    {severity === "severe" && (
                      <path
                        d="M 270 94 Q 300 80 340 93 Z"
                        fill="#fde047"
                        stroke="#ca8a04"
                        strokeWidth="1.5"
                      />
                    )}
                  </g>
                )}

                {/* 3. Follicular Plugging: Dense keratotic plug obstructing ostium */}
                {selectedCondition === "follicular_plugging" && (
                  <g>
                    <path
                      d="M 282 92 L 318 92 L 314 115 L 286 115 Z"
                      fill="#78716c"
                      stroke="#44403c"
                      strokeWidth="2"
                    />
                    <circle cx="300" cy="103" r="6" fill="#a8a29e" />
                  </g>
                )}

                {/* 4. Folliculitis: Inflammatory Halo & Pustular Infiltration */}
                {selectedCondition === "folliculitis" && (
                  <g>
                    <ellipse
                      cx="300"
                      cy="110"
                      rx="35"
                      ry="18"
                      fill="#ef4444"
                      opacity={severity === "severe" ? "0.6" : "0.4"}
                    />
                    {severity === "severe" && (
                      <circle cx="300" cy="110" r="10" fill="#fef08a" stroke="#dc2626" strokeWidth="2" />
                    )}
                  </g>
                )}

                {/* 5. Scalp Dryness: Micro-cracks in stratum corneum */}
                {selectedCondition === "scalp_dryness" && (
                  <g stroke="#991b1b" strokeWidth="1.5" fill="none">
                    <path d="M 120 100 L 126 118 L 132 108" />
                    <path d="M 210 100 L 216 122 L 222 110" />
                    <path d="M 390 100 L 398 120 L 404 109" />
                    <path d="M 470 100 L 476 117 L 482 108" />
                  </g>
                )}

                {/* Dynamic Camera Focus Reticle */}
                <g stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="4 2" fill="none">
                  <circle cx="300" cy="180" r={progress > 50 ? "80" : "120"} />
                  <path d="M 285 180 L 315 180" />
                  <path d="M 300 165 L 300 195" />
                </g>

                {/* Active Camera Path Badge */}
                <rect x="60" y="60" width="220" height="24" rx="6" fill="#000000" opacity="0.75" />
                <text x="70" y="76" fill="#38bdf8" fontSize="10" fontFamily="monospace" fontWeight="bold">
                  CAMERA: {def.cameraPath[activeCameraStep] || def.cameraPath[0]}
                </text>
              </svg>

              {/* Progress Scrub Bar */}
              <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3 bg-stone-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-stone-800">
                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={reducedMotion}
                  className="w-7 h-7 rounded-lg bg-stone-800 flex items-center justify-center text-white hover:bg-stone-700 transition-colors disabled:opacity-40 cursor-pointer"
                >
                  {isPlaying && !reducedMotion ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setProgress(0)}
                  className="w-7 h-7 rounded-lg bg-stone-800 flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-700 transition-colors cursor-pointer"
                  title={isFa ? "بازنشانی انیمیشن" : "Reset"}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <div className="flex-1 h-2 rounded-full bg-stone-800 overflow-hidden relative">
                  <div
                    className="h-full bg-[oklch(62%_0.09_16)] transition-all duration-75"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-stone-400 w-9 text-left">{progress}%</span>
              </div>
            </div>

            {/* Severity State Machine Switcher (خفیف / متوسط / شدید) */}
            <div className="p-4 rounded-2xl bg-stone-900/60 border border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                <span className="text-xs font-bold text-stone-300">
                  {isFa ? "ورودی استیت‌ماشین شدت (State Machine Input):" : "Severity State Machine:"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-stone-950 p-1 rounded-xl border border-stone-800">
                {(["mild", "moderate", "severe"] as SeverityLevel[]).map((lvl) => {
                  const isActive = severity === lvl;
                  const label =
                    lvl === "mild" ? (isFa ? "خفیف (۱)" : "Mild (1)") :
                    lvl === "moderate" ? (isFa ? "متوسط (۲)" : "Moderate (2)") :
                    (isFa ? "شدید (۳)" : "Severe (3)");

                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setSeverity(lvl)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? lvl === "mild"
                            ? "bg-emerald-600 text-white"
                            : lvl === "moderate"
                            ? "bg-amber-600 text-white"
                            : "bg-red-600 text-white"
                          : "text-stone-400 hover:text-stone-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Clinical Insights, Narration & §11 Mandates (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            {/* Condition Header & Pathology Highlight */}
            <div className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[oklch(75%_0.14_25)] font-bold">
                    {def.scene}
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    {isFa ? def.title.fa : def.title.en}
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                    severity === "mild"
                      ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                      : severity === "moderate"
                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                      : "bg-red-950 text-red-300 border border-red-800"
                  }`}
                >
                  {severity.toUpperCase()} STAGE
                </span>
              </div>

              {/* Dynamic Narration Box */}
              <div className="p-4 rounded-xl bg-stone-950/80 border border-stone-800 text-xs leading-relaxed text-stone-300 space-y-2">
                <div className="flex items-center gap-1.5 text-stone-400 font-semibold text-[11px]">
                  <Eye className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span>{isFa ? "شرح آسیب‌شناسی بیومتریک:" : "Biometric Pathological Narration:"}</span>
                </div>
                <p>{isFa ? currentStoryboard.currentNarration.fa : currentStoryboard.currentNarration.en}</p>
              </div>

              {/* Pathological Highlight Tag */}
              <div className="flex items-center gap-2 text-xs text-stone-400">
                <span className="text-stone-500 font-mono text-[11px]">Highlight:</span>
                <span className="font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900">
                  {def.highlight}
                </span>
              </div>
            </div>

            {/* §11 Mandatory Peer Review Verification */}
            <div className="p-4 rounded-2xl bg-stone-900/40 border border-stone-800 flex items-start gap-3">
              <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <strong className="block font-bold text-stone-200">
                  {isFa ? "تأیید علمی و نظارت بالینی (Reviewed By):" : "Clinical Peer Review:"}
                </strong>
                <p className="text-stone-400 font-mono text-[11px] leading-relaxed">{def.reviewedBy}</p>
              </div>
            </div>

            {/* §11 Mandatory Permanent Disclaimer */}
            <div className="p-4 rounded-2xl bg-stone-950 border border-amber-900/30 text-amber-200/90 text-[11px] leading-relaxed flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p>{isFa ? def.disclaimer.fa : def.disclaimer.en}</p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-900/80 border-t border-stone-800 shrink-0">
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>{isFa ? "سازگار با موتور Rive و پورتال اختصاصی بیمار" : "Rive State Machine & Patient Portal Ready"}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 px-5 py-2 rounded-xl text-xs font-bold rose-gold-gradient text-white hover:brightness-110 shadow-xs transition-all cursor-pointer"
          >
            <span>{isFa ? "متوجه شدم و بستن" : "Got it"}</span>
            <ChevronRight className={`w-3.5 h-3.5 ${isFa ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
