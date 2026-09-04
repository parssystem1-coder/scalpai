import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Camera,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

export interface CaptureAngleStep {
  id: string;
  zoneName: { fa: string; en: string };
  magnification: string;
  polarization: { fa: string; en: string };
  objective: { fa: string; en: string };
  isCaptured: boolean;
  qualityPassed: boolean;
}

interface GuidedCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName?: string;
  onCompleteCapture?: (capturedCount: number) => void;
}

const INITIAL_STEPS: CaptureAngleStep[] = [
  {
    id: "step-frontal",
    zoneName: { fa: "خط رویش قدامی (Frontal)", en: "Frontal Hairline" },
    magnification: "20x Optical",
    polarization: { fa: "پلاریزه متقاطع (Cross-polarized)", en: "Cross-polarized" },
    objective: { fa: "بررسی موهای ولوس و عقب‌نشینی خط رویش", en: "Vellus hair count and hairline recession" },
    isCaptured: true,
    qualityPassed: true,
  },
  {
    id: "step-vertex",
    zoneName: { fa: "فرق سر و تاج (Vertex)", en: "Vertex / Crown" },
    magnification: "50x High-Mag",
    polarization: { fa: "پلاریزه متقاطع (Cross-polarized)", en: "Cross-polarized" },
    objective: { fa: "سنجش تنوع قطر مو (Anisotrichosis) و منافذ خالی", en: "Diameter diversity and yellow dots" },
    isCaptured: true,
    qualityPassed: true,
  },
  {
    id: "step-temporal",
    zoneName: { fa: "گیجگاهی چپ/راست (Temporal)", en: "Temporal Region" },
    magnification: "20x Optical",
    polarization: { fa: "غیر پلاریزه (Non-polarized)", en: "Non-polarized" },
    objective: { fa: "ارزیابی سبوم سطحی، پوسته و شوره سر", en: "Surface lipid film and epidermal scaling" },
    isCaptured: false,
    qualityPassed: false,
  },
  {
    id: "step-occiput",
    zoneName: { fa: "پس‌سر و بانک مو (Occiput)", en: "Occiput Baseline" },
    magnification: "50x High-Mag",
    polarization: { fa: "پلاریزه متقاطع (Cross-polarized)", en: "Cross-polarized" },
    objective: { fa: "کالیبراسیون تراکم مرجع و ژنتیکی بیمار", en: "Donor density baseline calibration" },
    isCaptured: false,
    qualityPassed: false,
  },
];

export default function GuidedCaptureModal({
  isOpen,
  onClose,
  patientName = "بیمار",
  onCompleteCapture,
}: GuidedCaptureModalProps) {
  const { i18n } = useTranslation();
  const isFa = i18n.language === "fa";

  const [steps, setSteps] = useState<CaptureAngleStep[]>(INITIAL_STEPS);
  const [activeStepIndex, setActiveStepIndex] = useState(2); // Step 3 currently active
  const [isCapturing, setIsCapturing] = useState(false);

  // Quality gate checklist states for the active image
  const [focusQuality, setFocusQuality] = useState<"pass" | "warn">("pass");
  const [glareQuality] = useState<"pass" | "warn">("pass");
  const [contactQuality] = useState<"pass" | "warn">("pass");

  if (!isOpen) return null;

  const currentStep = steps[activeStepIndex] || steps[0];
  const capturedCount = steps.filter((s) => s.isCaptured).length;
  const isAllCaptured = capturedCount === steps.length;

  const handleSimulateShutter = () => {
    setIsCapturing(true);
    setTimeout(() => {
      setIsCapturing(false);
      setSteps((prev) =>
        prev.map((s, idx) =>
          idx === activeStepIndex
            ? { ...s, isCaptured: true, qualityPassed: focusQuality === "pass" }
            : s
        )
      );
      if (activeStepIndex < steps.length - 1) {
        setActiveStepIndex(activeStepIndex + 1);
      }
    }, 600);
  };

  const handleFinish = () => {
    onCompleteCapture?.(capturedCount);
    onClose();
  };

  return (
    <div
      id="guided-capture-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/80 p-3 md:p-6 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
    >
      <div
        id="guided-capture-container"
        className="relative my-auto w-full max-w-4xl rounded-3xl bg-[#0e1318] text-stone-100 shadow-2xl border border-stone-800 overflow-hidden flex flex-col max-h-[92vh]"
        dir={isFa ? "rtl" : "ltr"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-stone-900/80 border-b border-stone-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-xs">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm md:text-base font-bold text-white">
                  {isFa ? "تصویربرداری هدایت‌شده و گیت کنترل کیفیت" : "Guided Trichoscopy Capture & Quality-Gate"}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  PROTOCOL 4-ZONE
                </span>
              </div>
              <p className="text-xs text-stone-400">
                {isFa
                  ? `پروتکل استاندارد عکاسی درماتوسکوپی جلسه بالینی: ${patientName}`
                  : `Standardized dermoscopy angle protocol for: ${patientName}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-stone-700 flex items-center justify-center text-stone-400 hover:bg-stone-800 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4-Step Progress Indicator */}
        <div className="grid grid-cols-4 gap-2 px-6 py-3 bg-stone-950/60 border-b border-stone-800 shrink-0">
          {steps.map((step, idx) => {
            const isActive = idx === activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStepIndex(idx)}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                  isActive
                    ? "bg-cyan-950/60 border-cyan-500 text-white shadow-xs"
                    : step.isCaptured
                    ? "bg-emerald-950/30 border-emerald-800 text-emerald-300 hover:bg-stone-900"
                    : "bg-stone-900/40 border-stone-800 text-stone-500 hover:bg-stone-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold">فریم {idx + 1}</span>
                  {step.isCaptured ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-stone-600" />
                  )}
                </div>
                <div className="text-xs font-bold truncate mt-0.5">
                  {isFa ? step.zoneName.fa.split(" ")[0] : step.zoneName.en.split(" ")[0]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Live Capture Viewfinder & Quality Gate Inspection */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1">
          {/* Viewfinder Canvas / Lens Simulation (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4">
            <div className="relative aspect-4/3 rounded-2xl bg-black border-2 border-stone-700 overflow-hidden flex items-center justify-center group shadow-2xl">
              {/* Simulated dermoscopic skin field */}
              <div className="absolute inset-0 bg-gradient-to-tr from-stone-900 via-rose-950/40 to-stone-900" />

              {/* Polarized circular lens mask */}
              <div className="w-[82%] aspect-square rounded-full border-2 border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.15)] relative overflow-hidden flex items-center justify-center">
                {/* Hair fibers & follicular openings simulation */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full border border-stone-600/40 animate-pulse" />
                  <div className="w-2 h-2 rounded-full bg-amber-400 opacity-80" />
                  <div className="w-1.5 h-20 bg-stone-700/80 rotate-45 rounded-full absolute -top-2" />
                  <div className="w-2 h-24 bg-stone-800/90 -rotate-12 rounded-full absolute" />
                  <div className="w-1 h-16 bg-stone-600/70 rotate-75 rounded-full absolute bottom-4" />
                </div>

                {/* Reticle grid & millimeter scale */}
                <div className="absolute inset-0 border border-cyan-400/20 pointer-events-none">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/25" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-400/25" />
                </div>
              </div>

              {/* Viewfinder HUD Overlays */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-cyan-300 bg-stone-950/80 px-3 py-1.5 rounded-xl border border-stone-800 backdrop-blur-md">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                  <span>LIVE DERMOSCOPY FEED</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>MAG: {currentStep.magnification}</span>
                  <span className="hidden sm:inline">| POLAR: {isFa ? currentStep.polarization.fa.split(" ")[0] : "Cross"}</span>
                </div>
              </div>

              {/* Shutter capture flash */}
              {isCapturing && (
                <div className="absolute inset-0 bg-white z-50 animate-out fade-out duration-300" />
              )}
            </div>

            {/* Shutter Button & Capture Trigger */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSimulateShutter}
                disabled={isCapturing}
                className="flex-1 py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/30 transition-all cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>
                  {isFa
                    ? `ثبت تصویر زاویه: ${currentStep.zoneName.fa.split(" ")[0]}`
                    : `Capture Angle: ${currentStep.zoneName.en}`}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFocusQuality(focusQuality === "pass" ? "warn" : "pass");
                }}
                className="p-3 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors"
                title={isFa ? "شبیه‌سازی بازتنظیم فوکوس" : "Calibrate Focus"}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quality-Gate Checklist Panel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-bold text-white">
                  {isFa ? "گیت کنترل کیفیت خودکار (Quality-Gate)" : "Automated Quality-Gate"}
                </h4>
              </div>

              {/* Checklist items */}
              <div className="space-y-2.5">
                {/* 1. Focus & Sharpness */}
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                  <div className="text-xs">
                    <strong className="block text-stone-200">{isFa ? "۱. وضوح و شارپنس عدسی" : "1. Focus & Sharpness"}</strong>
                    <span className="text-[10px] text-stone-500">حداقل کنتراست لبه فولیکولی</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      focusQuality === "pass"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {focusQuality === "pass" ? "تایید (PASS)" : "هشدار تاری"}
                  </span>
                </div>

                {/* 2. Glare & Lighting */}
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                  <div className="text-xs">
                    <strong className="block text-stone-200">{isFa ? "۲. عدم بازتاب نور کورکننده" : "2. Anti-Glare & Lux"}</strong>
                    <span className="text-[10px] text-stone-500">یکنواختی نور LED رینگی</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      glareQuality === "pass"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {glareQuality === "pass" ? "تایید (PASS)" : "بازتاب نور"}
                  </span>
                </div>

                {/* 3. Scalp Contact */}
                <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                  <div className="text-xs">
                    <strong className="block text-stone-200">{isFa ? "۳. تماس و فشار مناسب سر مته" : "3. Proper Contact"}</strong>
                    <span className="text-[10px] text-stone-500">عدم انسداد عروقی با فشار زیاد</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      contactQuality === "pass"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {contactQuality === "pass" ? "تایید (PASS)" : "فشار نامتعادل"}
                  </span>
                </div>
              </div>

              {/* Target Zone Objective */}
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs text-cyan-200/90 leading-relaxed">
                <span className="font-bold block mb-0.5">{isFa ? "هدف بالینی این زاویه:" : "Target Objective:"}</span>
                <p className="text-[11px] text-stone-300">{isFa ? currentStep.objective.fa : currentStep.objective.en}</p>
              </div>
            </div>

            {/* Protocol Progress Status */}
            <div className="p-4 rounded-2xl bg-stone-900/40 border border-stone-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-stone-400">{isFa ? "مجموع فریم‌های ثبت‌شده:" : "Captured Frames:"}</span>
                <div className="text-sm font-bold text-white mt-0.5">
                  {capturedCount} از {steps.length} زاویه استاندارد
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="px-4 py-2 rounded-xl text-xs font-bold rose-gold-gradient text-white hover:brightness-110 shadow-xs transition-all cursor-pointer"
              >
                {isFa
                  ? isAllCaptured
                    ? "تکمیل تمام زوایا و بازگشت به پرونده"
                    : "تکمیل فریم‌ها و بازگشت"
                  : isAllCaptured
                  ? "All Angles Captured & Return"
                  : "Complete & Return"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
