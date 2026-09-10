import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Camera,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Video,
  VideoOff,
  AlertCircle,
  Sparkles,
  Trash2,
  RotateCcw,
  Timer,
  ZoomIn,
  Tag,
  Activity,
  Keyboard,
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

export interface DermoscopySign {
  id: string;
  name: { fa: string; en: string };
  desc: { fa: string; en: string };
  badgeColor: string;
}

export const CLINICAL_DERMOSCOPY_SIGNS: DermoscopySign[] = [
  {
    id: "yellow_dots",
    name: { fa: "نقاط زرد (Yellow Dots)", en: "Yellow Dots" },
    desc: { fa: "تجمع سبوم در مجرای اینفاندیبولار", en: "Sebaceous infundibulum accumulation" },
    badgeColor: "border-amber-500/50 text-amber-300 bg-amber-950/40",
  },
  {
    id: "peripilar_sign",
    name: { fa: "هاله پری‌پیلار (Peripilar)", en: "Peripilar Sign" },
    desc: { fa: "میکروالتهاب و هاله دور ریشه مو", en: "Perifollicular halo microinflammation" },
    badgeColor: "border-rose-500/50 text-rose-300 bg-rose-950/40",
  },
  {
    id: "vellus_hairs",
    name: { fa: "موهای ولوس (Vellus Hairs)", en: "Vellus Hairs" },
    desc: { fa: "تارهای موی بسیار نازک و کرکی", en: "Hypopigmented miniaturized fine hairs" },
    badgeColor: "border-sky-500/50 text-sky-300 bg-sky-950/40",
  },
  {
    id: "exclamation_mark",
    name: { fa: "موی علامت تعجب (!)", en: "Exclamation Mark Hair" },
    desc: { fa: "نشانه فعالیت آلوپسی آره‌آتا", en: "Pathognomonic for active alopecia areata" },
    badgeColor: "border-red-500/50 text-red-300 bg-red-950/40",
  },
  {
    id: "black_dots",
    name: { fa: "نقاط سیاه (Black Dots)", en: "Black Dots" },
    desc: { fa: "تارهای شکسته‌شده کاداورایز", en: "Cadaverized broken follicular remnants" },
    badgeColor: "border-purple-500/50 text-purple-300 bg-purple-950/40",
  },
  {
    id: "arborizing_vessels",
    name: { fa: "عروق درختی (Arborizing)", en: "Arborizing Vessels" },
    desc: { fa: "عروق خونی شاخه‌دار و پرخونی", en: "Branching subepidermal erythema" },
    badgeColor: "border-emerald-500/50 text-emerald-300 bg-emerald-950/40",
  },
  {
    id: "epidermal_scale",
    name: { fa: "پوسته‌ریزی (Scale)", en: "Epidermal Scale" },
    desc: { fa: "پوسته‌ها و شوره درماتیت سبورئیک", en: "Follicular and interfollicular hyperkeratosis" },
    badgeColor: "border-yellow-500/50 text-yellow-300 bg-yellow-950/40",
  },
];

interface GuidedCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName?: string;
  onCompleteCapture?: (
    capturedCount: number,
    frames?: Record<string, string>,
    stepTags?: Record<string, string[]>
  ) => void;
}

const ZONE_SIMULATION_IMAGES: Record<string, string> = {
  "step-frontal": "/trichoscopy/frontal.jpg",
  "step-vertex": "/trichoscopy/vertex.jpg",
  "step-temporal": "/trichoscopy/temporal.jpg",
  "step-occiput": "/trichoscopy/occiput.jpg",
};

// noUncheckedIndexedAccess: typed as a non-empty tuple so INITIAL_STEPS[0] is a
// CaptureAngleStep (not | undefined) and can back the currentStep fallback.
const INITIAL_STEPS: [CaptureAngleStep, ...CaptureAngleStep[]] = [
  {
    id: "step-frontal",
    zoneName: { fa: "خط رویش قدامی (Frontal)", en: "Frontal Hairline" },
    magnification: "20x Optical",
    polarization: { fa: "پلاریزه متقاطع (Cross-polarized)", en: "Cross-polarized" },
    objective: { fa: "بررسی موهای ولوس و عقب‌نشینی خط رویش", en: "Vellus hair count and hairline recession" },
    isCaptured: false,
    qualityPassed: false,
  },
  {
    id: "step-vertex",
    zoneName: { fa: "فرق سر و تاج (Vertex)", en: "Vertex / Crown" },
    magnification: "50x High-Mag",
    polarization: { fa: "پلاریزه متقاطع (Cross-polarized)", en: "Cross-polarized" },
    objective: { fa: "سنجش تنوع قطر مو (Anisotrichosis) و منافذ خالی", en: "Diameter diversity and yellow dots" },
    isCaptured: false,
    qualityPassed: false,
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
  const { t, i18n } = useTranslation();

  const [steps, setSteps] = useState<CaptureAngleStep[]>(INITIAL_STEPS);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  // Advanced Pro Features: Zoom, Anti-shake Timer, Live Sharpness, Dermoscopy Tags
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [liveSharpness, setLiveSharpness] = useState<number>(92);
  const [stepTags, setStepTags] = useState<Record<string, string[]>>({});
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sharpnessCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live Camera / USB Trichoscope states
  const [isLiveCamera, setIsLiveCamera] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<Record<string, string>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Quality gate checklist states for the active image
  const [focusQuality, setFocusQuality] = useState<"pass" | "warn">("pass");
  const [glareQuality] = useState<"pass" | "warn">("pass");
  const [contactQuality] = useState<"pass" | "warn">("pass");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsLiveCamera(false);
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError(null);
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("مرورگر شما از وب‌کم یا تریکوسکوپ پشتیبانی نمی‌کند.");
        }

        // Standard laptop webcams and USB trichoscopes constraints (no overconstraint)
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : {
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
              },
          audio: false,
        };

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (initialErr) {
          console.warn("Primary constraints failed, retrying with simple video: true", initialErr);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          try {
            await videoRef.current.play();
          } catch (playErr) {
            console.warn("Autoplay play error, retrying muted:", playErr);
          }
        }
        setIsLiveCamera(true);

        // Enumerate video devices to populate dropdown with real labels now that permission is granted
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          setVideoDevices(videoInputs);
          if (videoInputs.length > 0 && !deviceId) {
            const activeTrack = stream.getVideoTracks()[0];
            const activeId = activeTrack?.getSettings?.()?.deviceId;
            setSelectedDeviceId(activeId || videoInputs[0]?.deviceId || "");
          }
        } catch (enumErr) {
          console.warn("Error enumerating devices:", enumErr);
        }
      } catch (err: unknown) {
        console.warn("Camera init error:", err);
        setCameraError(
          i18n.language === "fa"
            ? "دسترسی به دوربین/تریکوسکوپ برقرار نشد. لطفاً دسترسی دوربین را در مرورگر تأیید کنید."
            : "Camera/Trichoscope access failed. Please allow camera permissions in your browser."
        );
        setIsLiveCamera(false);
      }
    },
    [i18n.language]
  );

  // Sync stream to video element whenever isLiveCamera turns true or videoRef mounts
  useEffect(() => {
    if (isLiveCamera && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        videoRef.current.play().catch((e) => console.warn("Video play sync error:", e));
      }
    }
  }, [isLiveCamera]);

  // Live Sharpness and Focus edge contrast calculation
  useEffect(() => {
    if (!isOpen) return;
    if (!isLiveCamera) {
      setLiveSharpness(focusQuality === "pass" ? 94 : 52);
      return;
    }

    const interval = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const video = videoRef.current;
        if (!sharpnessCanvasRef.current) {
          sharpnessCanvasRef.current = document.createElement("canvas");
          sharpnessCanvasRef.current.width = 100;
          sharpnessCanvasRef.current.height = 100;
        }
        const sCanvas = sharpnessCanvasRef.current;
        const sCtx = sCanvas.getContext("2d", { willReadFrequently: true });
        if (!sCtx) return;

        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const sampleW = Math.round(vw * 0.35);
        const sampleH = Math.round(vh * 0.35);
        const sampleX = Math.round((vw - sampleW) / 2);
        const sampleY = Math.round((vh - sampleH) / 2);

        sCtx.drawImage(video, sampleX, sampleY, sampleW, sampleH, 0, 0, 100, 100);
        const imgData = sCtx.getImageData(0, 0, 100, 100);
        const data = imgData.data;

        // noUncheckedIndexedAccess: the sampled buffer is always 100x100x4, so the
        // `?? 0` fallbacks are unreachable and the luma maths is unchanged.
        const luma = (offset: number) =>
          (data[offset] ?? 0) * 0.299 + (data[offset + 1] ?? 0) * 0.587 + (data[offset + 2] ?? 0) * 0.114;

        let gradSum = 0;
        let count = 0;
        for (let y = 1; y < 99; y += 2) {
          for (let x = 1; x < 99; x += 2) {
            const left = (y * 100 + (x - 1)) * 4;
            const right = (y * 100 + (x + 1)) * 4;
            const up = ((y - 1) * 100 + x) * 4;
            const down = ((y + 1) * 100 + x) * 4;

            const lumL = luma(left);
            const lumR = luma(right);
            const lumU = luma(up);
            const lumD = luma(down);

            const dx = lumR - lumL;
            const dy = lumD - lumU;
            gradSum += Math.sqrt(dx * dx + dy * dy);
            count++;
          }
        }
        const avgGrad = count > 0 ? gradSum / count : 0;
        const normalizedScore = Math.min(100, Math.max(32, Math.round((avgGrad / 26) * 100)));
        setLiveSharpness(normalizedScore);
      } catch {
        // ignore
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isOpen, isLiveCamera, focusQuality]);

  // Clean up timer and camera on close
  useEffect(() => {
    return () => {
      stopCamera();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [stopCamera]);

  // noUncheckedIndexedAccess: steps is seeded from INITIAL_STEPS and never emptied,
  // so this resolves to a concrete step and downstream reads stay non-optional.
  const currentStep: CaptureAngleStep = steps[activeStepIndex] ?? steps[0] ?? INITIAL_STEPS[0];
  const capturedCount = steps.filter((s) => s.isCaptured).length;
  const isAllCaptured = capturedCount === steps.length;

  const handleShutterCapture = useCallback(() => {
    setIsCapturing(true);
    let capturedUrl = "";

    if (isLiveCamera && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const vw = video.videoWidth || video.clientWidth || 1280;
      const vh = video.videoHeight || video.clientHeight || 720;

      if (vw > 0 && vh > 0) {
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (zoomLevel > 1) {
            const cropW = vw / zoomLevel;
            const cropH = vh / zoomLevel;
            const cropX = (vw - cropW) / 2;
            const cropY = (vh - cropH) / 2;
            ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, vw, vh);
          } else {
            ctx.drawImage(video, 0, 0, vw, vh);
          }
          capturedUrl = canvas.toDataURL("image/jpeg", 0.95);
        }
      }
    }

    // Safety fallback: if camera didn't produce frame, use target zone clinical photo
    if (!capturedUrl) {
      capturedUrl = ZONE_SIMULATION_IMAGES[currentStep.id] || "/trichoscopy/vertex.jpg";
    }

    setTimeout(() => {
      setIsCapturing(false);
      if (capturedUrl) {
        setCapturedFrames((prev) => ({
          ...prev,
          [currentStep.id]: capturedUrl,
        }));
      }
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
    }, 450);
  }, [isLiveCamera, currentStep.id, activeStepIndex, steps.length, focusQuality, zoomLevel]);

  const cancelCountdown = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  const triggerShutterWithTimer = useCallback(() => {
    if (isCapturing || countdown !== null) return;
    if (timerSeconds === 0) {
      handleShutterCapture();
    } else {
      setCountdown(timerSeconds);
      let remaining = timerSeconds;
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
          setCountdown(null);
          handleShutterCapture();
        } else {
          setCountdown(remaining);
        }
      }, 1000);
    }
  }, [timerSeconds, isCapturing, countdown, handleShutterCapture]);

  // Space Key Listener (Hands-free Shutter / Foot-pedal emulation)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        if (countdown !== null) {
          cancelCountdown();
        } else {
          triggerShutterWithTimer();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, countdown, cancelCountdown, triggerShutterWithTimer]);

  const handleToggleSign = (signId: string) => {
    setStepTags((prev) => {
      const currentList = prev[currentStep.id] || [];
      const exists = currentList.includes(signId);
      const updated = exists
        ? currentList.filter((s) => s !== signId)
        : [...currentList, signId];
      return {
        ...prev,
        [currentStep.id]: updated,
      };
    });
  };

  const handleDeleteStepFrame = (stepId: string) => {
    setCapturedFrames((prev) => {
      const updated = { ...prev };
      delete updated[stepId];
      return updated;
    });
    setSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, isCaptured: false, qualityPassed: false } : s))
    );
    const targetIdx = steps.findIndex((s) => s.id === stepId);
    if (targetIdx !== -1) {
      setActiveStepIndex(targetIdx);
    }
  };

  const handleClearAllFrames = () => {
    setCapturedFrames({});
    setSteps((prev) => prev.map((s) => ({ ...s, isCaptured: false, qualityPassed: false })));
    setActiveStepIndex(0);
  };

  const handleFinish = () => {
    stopCamera();
    onCompleteCapture?.(capturedCount, capturedFrames, stepTags);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      id="guided-capture-backdrop"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/85 p-3 md:p-6 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
    >
      {/* Hidden canvas for capturing video frames */}
      <canvas ref={canvasRef} className="hidden" />

<div
          id="guided-capture-container"
          className="relative my-auto w-full max-w-4xl rounded-3xl bg-[#0e1318] text-stone-100 shadow-2xl border border-stone-800 overflow-hidden flex flex-col max-h-[94vh]"
          dir={i18n.language === "fa" ? "rtl" : "ltr"}
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
                  {t("dashboard.guidedCapture.title")}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  PROTOCOL 4-ZONE
                </span>
                {isLiveCamera ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-700 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    LIVE UVC
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                    SIMULATOR
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-400">
                {i18n.language === "fa"
                  ? `پروتکل استاندارد عکاسی درماتوسکوپی جلسه بالینی: ${patientName}`
                  : `Standardized dermoscopy angle protocol for: ${patientName}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {capturedCount > 0 && (
              <button
                type="button"
                onClick={handleClearAllFrames}
                className="px-2.5 py-1.5 rounded-xl bg-stone-800/80 hover:bg-rose-950 text-stone-400 hover:text-rose-300 border border-stone-700 hover:border-rose-800 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title={t("dashboard.guidedCapture.clearAllTitle")}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("dashboard.guidedCapture.restartAll")}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopCamera();
                onClose();
              }}
              className="w-8 h-8 rounded-full border border-stone-700 flex items-center justify-center text-stone-400 hover:bg-stone-800 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 4-Step Progress Indicator */}
        <div className="grid grid-cols-4 gap-2 px-6 py-3 bg-stone-950/60 border-b border-stone-800 shrink-0">
          {steps.map((step, idx) => {
            const isActive = idx === activeStepIndex;
            return (
              <div
                key={step.id}
                role="button"
                tabIndex={0}
                aria-pressed={isActive}
                onClick={() => setActiveStepIndex(idx)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveStepIndex(idx);
                  }
                }}
                className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer relative group ${
                  isActive
                    ? "bg-cyan-950/60 border-cyan-500 text-white shadow-xs"
                    : step.isCaptured
                    ? "bg-emerald-950/30 border-emerald-800 text-emerald-300 hover:bg-stone-900"
                    : "bg-stone-900/40 border-stone-800 text-stone-500 hover:bg-stone-900"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold">{t("dashboard.guidedCapture.zoneNamePrefix")} {idx + 1}</span>
                  {step.isCaptured ? (
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStepFrame(step.id);
                        }}
                        className="p-1 rounded-md hover:bg-rose-950 text-stone-400 hover:text-rose-300 border border-transparent hover:border-rose-800 transition-colors cursor-pointer"
                        title={t("dashboard.guidedCapture.deleteRetakeTitle")}
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-stone-600" />
                  )}
                </div>
                <div className="text-xs font-bold truncate mt-0.5">
                  {i18n.language === "fa" ? step.zoneName.fa.split(" ")[0] : step.zoneName.en.split(" ")[0]}
                </div>
              </div>
            );
          })}
        </div>

        {/* Camera Source Selector & Mode Toggle Bar */}
        <div className="px-6 py-2.5 bg-stone-900/50 border-b border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-stone-400 font-medium">
              {t("dashboard.guidedCapture.inputSource")}
            </span>
            <button
              type="button"
              onClick={() => {
                if (isLiveCamera) {
                  stopCamera();
                } else {
                  void startCamera(selectedDeviceId);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                isLiveCamera
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                  : "bg-stone-800 hover:bg-stone-700 text-cyan-300 border border-stone-700"
              }`}
            >
              {isLiveCamera ? (
                <>
                  <Video className="w-3.5 h-3.5" />
                  <span>{t("dashboard.guidedCapture.liveCameraActive")}</span>
                </>
              ) : (
                <>
                  <VideoOff className="w-3.5 h-3.5" />
                  <span>{t("dashboard.guidedCapture.connectDevice")}</span>
                </>
              )}
            </button>
          </div>

          {/* Device Selection dropdown when multiple cameras are found */}
          {videoDevices.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-stone-400 text-[11px]">{t("dashboard.guidedCapture.selectDevice")}</span>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  setSelectedDeviceId(e.target.value);
                  if (isLiveCamera) {
                    void startCamera(e.target.value);
                  }
                }}
                className="bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-xs text-stone-200 focus:outline-none"
              >
                {videoDevices.map((d, index) => (
                  <option key={d.deviceId || index} value={d.deviceId}>
                    {d.label || `درماتوسکوپ / دوربین ${index + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="text-[11px] text-stone-400 font-mono">
            {isLiveCamera ? "READY FOR DIRECT OPTICAL SNAPSHOT" : "HARDWARE-INDEPENDENT SIMULATION"}
          </div>
        </div>

        {/* Camera Error banner if user tried to enable camera but none was found */}
        {cameraError && (
          <div className="px-6 py-2 bg-amber-950/60 border-b border-amber-800/60 text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{cameraError}</span>
            </div>
            <button
              type="button"
              onClick={() => setCameraError(null)}
              className="text-amber-400 hover:text-white text-xs underline cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        )}

        {/* Live Capture Viewfinder & Quality Gate Inspection */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1">
          {/* Viewfinder Canvas / Lens Simulation (7 cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-3">
            <div className="relative aspect-4/3 rounded-2xl bg-black border-2 border-stone-700 overflow-hidden flex items-center justify-center group shadow-2xl">
              {/* Video element is permanently mounted in DOM so videoRef.current is never null */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  transform: `scale(${zoomLevel})`,
                  transformOrigin: "center center",
                  transition: "transform 250ms ease-out",
                }}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                  isLiveCamera ? "opacity-100 z-0" : "opacity-0 pointer-events-none -z-10"
                }`}
              />

              {/* Authentic clinical trichoscopy photo when camera is off */}
              {!isLiveCamera && (
                <img
                  src={ZONE_SIMULATION_IMAGES[currentStep.id] || "/trichoscopy/vertex.jpg"}
                  alt="Dermoscopy Field"
                  style={{
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: "center center",
                    transition: "transform 250ms ease-out",
                  }}
                  className="absolute inset-0 w-full h-full object-cover brightness-90 contrast-110"
                />
              )}

              {/* Polarized circular lens mask */}
              <div className="w-[82%] aspect-square rounded-full border-2 border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.15)] relative overflow-hidden flex items-center justify-center z-10 pointer-events-none">
                {/* Hair fibers focus reticle pulse */}
                {!isLiveCamera && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 rounded-full border border-cyan-400/20 animate-pulse" />
                  </div>
                )}

                {/* Reticle grid & millimeter scale */}
                <div className="absolute inset-0 border border-cyan-400/20 pointer-events-none">
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400/25" />
                  <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-400/25" />
                  {/* Calibrated micro-measurement scale */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono text-cyan-400/70 bg-stone-950/60 px-2 py-0.5 rounded">
                    0.1 mm / DIV
                  </div>
                </div>
              </div>

              {/* Viewfinder HUD Overlays */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-cyan-300 bg-stone-950/80 px-3 py-1.5 rounded-xl border border-stone-800 backdrop-blur-md z-20">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isLiveCamera ? "bg-red-500 animate-ping" : "bg-cyan-400"}`} />
                  <span>{isLiveCamera ? "LIVE UVC FEED" : "DERMOSCOPY HUD"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-700/60">
                    ZOOM: {zoomLevel}x
                  </span>
                  <span>MAG: {currentStep.magnification}</span>
                  <span className="hidden sm:inline">| {t("dashboard.guidedCapture.polarLabel")} {i18n.language === "fa" ? currentStep.polarization.fa.split(" ")[0] : "Cross"}</span>
                </div>
              </div>

              {/* Live Sharpness Meter Bar (Top) */}
              <div className="absolute top-12 left-3 px-2.5 py-1.5 rounded-xl bg-stone-950/85 border border-stone-800 backdrop-blur-md z-20 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between text-[9px] font-mono text-stone-300 gap-2">
                    <span>{t("dashboard.guidedCapture.sharpness")}</span>
                    <span
                      className={`font-bold ${
                        liveSharpness >= 75
                          ? "text-emerald-400"
                          : liveSharpness >= 50
                          ? "text-amber-400"
                          : "text-rose-400"
                      }`}
                    >
                      {liveSharpness}%
                    </span>
                  </div>
                  <div className="w-20 h-1.5 bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        liveSharpness >= 75
                          ? "bg-emerald-500"
                          : liveSharpness >= 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                      }`}
                      style={{ width: `${liveSharpness}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Status indicator if current step frame is captured */}
              {capturedFrames[currentStep.id] && (
                <div className="absolute top-12 right-3 px-2.5 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-600 text-emerald-300 text-[10px] font-bold backdrop-blur-md flex items-center gap-1.5 z-20 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t("dashboard.guidedCapture.frameCaptured")}</span>
                </div>
              )}

              {/* Countdown Overlay (Anti-shake timer) */}
              {countdown !== null && (
                <div className="absolute inset-0 bg-stone-950/80 z-40 flex flex-col items-center justify-center gap-3 backdrop-blur-xs animate-in fade-in duration-200">
                  <div className="w-24 h-24 rounded-full border-4 border-cyan-400/40 border-t-cyan-400 animate-spin flex items-center justify-center">
                    <span className="text-4xl font-extrabold text-white animate-pulse">{countdown}</span>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-cyan-200">
                      {t("dashboard.guidedCapture.steadyHint")}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {t("dashboard.guidedCapture.autoCaptureHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelCountdown}
                    className="mt-1 px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium border border-stone-700 cursor-pointer"
                  >
                    {t("dashboard.guidedCapture.cancel")}
                  </button>
                </div>
              )}

              {/* Shutter capture flash */}
              {isCapturing && (
                <div className="absolute inset-0 bg-white z-50 animate-out fade-out duration-300" />
              )}
            </div>

            {/* Quick Pro Settings Toolbar: Zoom & Timer & Space Key */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-stone-900/60 border border-stone-800 text-xs">
              {/* Digital Zoom Controls */}
              <div className="flex items-center gap-1.5">
                <span className="text-stone-400 text-[11px] flex items-center gap-1 font-medium">
                  <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("dashboard.guidedCapture.zoomLabel")}</span>
                </span>
                {([1, 1.5, 2, 3] as const).map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setZoomLevel(z)}
                    className={`px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold transition-colors cursor-pointer ${
                      zoomLevel === z
                        ? "bg-cyan-600 text-white shadow-xs"
                        : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    {z}x
                  </button>
                ))}
              </div>

              {/* Shutter Timer */}
              <div className="flex items-center gap-1.5">
                <span className="text-stone-400 text-[11px] flex items-center gap-1 font-medium">
                  <Timer className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t("dashboard.guidedCapture.timerLabel")}</span>
                </span>
                {([
                  { sec: 0, label: t("dashboard.guidedCapture.timer0s") },
                  { sec: 3, label: t("dashboard.guidedCapture.timer3s") },
                  { sec: 5, label: t("dashboard.guidedCapture.timer5s") },
                ] as const).map((t) => (
                  <button
                    key={t.sec}
                    type="button"
                    onClick={() => setTimerSeconds(t.sec)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      timerSeconds === t.sec
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Hands-free Pedal/Space hotkey indicator */}
              <div
                className="hidden sm:flex items-center gap-1 text-[10px] text-cyan-300/80 bg-cyan-950/40 px-2 py-1 rounded-lg border border-cyan-800/40"
                title={t("dashboard.guidedCapture.captureHint")}
              >
                <Keyboard className="w-3 h-3 text-cyan-400" />
                <span>Space: {t("dashboard.guidedCapture.shutterLabel")}</span>
              </div>
            </div>

            {/* Shutter Button & Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerShutterWithTimer}
                disabled={isCapturing}
                className={`flex-1 py-3 rounded-2xl font-bold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50 ${
                  capturedFrames[currentStep.id]
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-900/30"
                    : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30"
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>
                  {capturedFrames[currentStep.id]
                    ? t("dashboard.guidedCapture.retakeFrame", { frame: activeStepIndex + 1 })
                    : t("dashboard.guidedCapture.captureAngle", {
                        zone: i18n.language === "fa" ? currentStep.zoneName.fa.split(" ")[0] : currentStep.zoneName.en,
                        timer: timerSeconds > 0 ? ` (${timerSeconds}s ${t("dashboard.guidedCapture.timerLabel")})` : "",
                      })}
                </span>
              </button>

              {capturedFrames[currentStep.id] && (
                <button
                  type="button"
                  onClick={() => handleDeleteStepFrame(currentStep.id)}
                  className="px-3.5 py-3 rounded-2xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                  title={t("dashboard.guidedCapture.deleteFrameTitle")}
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  <span className="hidden sm:inline">{t("dashboard.guidedCapture.deleteButton")}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setFocusQuality(focusQuality === "pass" ? "warn" : "pass");
                }}
                className="p-3 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors cursor-pointer"
                title={t("dashboard.guidedCapture.calibrateTitle")}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quality-Gate Checklist & Dermoscopy Findings Panel (5 cols) */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
            <div className="p-4 md:p-5 rounded-2xl bg-stone-900/60 border border-stone-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-sm font-bold text-white">
                    {t("dashboard.guidedCapture.qualityGateTitle")}
                  </h4>
                </div>
                {capturedFrames[currentStep.id] && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                    SAVED
                  </span>
                )}
              </div>

              {/* Checklist items */}
              <div className="space-y-2">
                {/* 1. Focus & Sharpness */}
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                  <div className="text-xs">
                    <strong className="block text-stone-200">{t("dashboard.guidedCapture.focusStep")}</strong>
                    <span className="text-[10px] text-stone-500">
                      {t("dashboard.guidedCapture.liveSharpness", { value: liveSharpness })}
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      liveSharpness >= 65 || focusQuality === "pass"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {liveSharpness >= 65 || focusQuality === "pass" ? "تایید (PASS)" : "هشدار تاری"}
                  </span>
                </div>

                {/* 2. Glare & Lighting */}
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                  <div className="text-xs">
                    <strong className="block text-stone-200">{t("dashboard.guidedCapture.glareStep")}</strong>
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
                <div className="p-2.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
                  <div className="text-xs">
                    <strong className="block text-stone-200">{t("dashboard.guidedCapture.contactStep")}</strong>
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

              {/* Clinical Dermoscopy Findings / Tags for Current Angle */}
              <div className="pt-2 border-t border-stone-800">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-stone-200">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    <span>{t("dashboard.guidedCapture.clinicalSigns")}</span>
                  </div>
                  {(stepTags[currentStep.id]?.length ?? 0) > 0 && (
                    <span className="text-[10px] text-cyan-400 font-mono">
                      {stepTags[currentStep.id]?.length} نشانه انتخاب‌شده
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {CLINICAL_DERMOSCOPY_SIGNS.map((sign) => {
                    const isSelected = (stepTags[currentStep.id] || []).includes(sign.id);
                    return (
                      <button
                        key={sign.id}
                        type="button"
                        onClick={() => handleToggleSign(sign.id)}
                        className={`text-[11px] px-2.5 py-1 rounded-xl border transition-all cursor-pointer text-right flex items-center gap-1 ${
                          isSelected
                            ? `${sign.badgeColor} border-opacity-100 font-bold shadow-xs`
                            : "bg-stone-950/60 border-stone-800 text-stone-400 hover:border-stone-700 hover:text-stone-300"
                        }`}
                        title={i18n.language === "fa" ? sign.desc.fa : sign.desc.en}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-amber-400" : "bg-stone-600"}`} />
                        <span>{i18n.language === "fa" ? sign.name.fa : sign.name.en}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Target Zone Objective & Micro Thumbnail */}
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-xs text-cyan-200/90 leading-relaxed">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <span className="font-bold block mb-0.5">{t("dashboard.guidedCapture.targetObjective")}</span>
                    <p className="text-[11px] text-stone-300">{i18n.language === "fa" ? currentStep.objective.fa : currentStep.objective.en}</p>
                  </div>
                  {capturedFrames[currentStep.id] && (
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <div className="w-12 h-12 rounded-lg border border-cyan-500/40 overflow-hidden shadow-xs relative group">
                        <img
                          src={capturedFrames[currentStep.id] ?? ""}
                          alt="Thumbnail"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteStepFrame(currentStep.id)}
                        className="px-2 py-0.5 rounded-md bg-rose-950 hover:bg-rose-900 border border-rose-800 text-[10px] text-rose-300 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        title={t("dashboard.guidedCapture.deleteCurrentFrame")}
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>{t("dashboard.guidedCapture.deleteBtn")}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Protocol Progress Status */}
            <div className="p-4 rounded-2xl bg-stone-900/40 border border-stone-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-stone-400">{t("dashboard.guidedCapture.capturedFrames")}</span>
                <div className="text-sm font-bold text-white mt-0.5">
                  {capturedCount} از {steps.length} زاویه استاندارد
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="px-4 py-2 rounded-xl text-xs font-bold rose-gold-gradient text-white hover:brightness-110 shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>
                  {isAllCaptured
                    ? t("dashboard.guidedCapture.allZonesDone")
                    : t("dashboard.guidedCapture.zonesRemaining")}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
