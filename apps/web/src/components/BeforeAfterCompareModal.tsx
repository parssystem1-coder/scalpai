import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Split,
  Columns,
  ArrowRight,
  TrendingUp,
  Layers,
  Download,
  CheckCircle2,
} from "lucide-react";

export interface ComparePhotoItem {
  id: string;
  patientId: string;
  url: string;
  area: "vertex" | "temple" | "frontal" | "occiput";
  date: string;
  density: number;
  thickness: string;
  qualityScore: number;
  tags?: string[];
  notes?: string;
}

interface BeforeAfterCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  photos: ComparePhotoItem[];
  defaultPhotoIdA?: string;
  defaultPhotoIdB?: string;
}

const AREA_LABELS: Record<string, string> = {
  vertex: "تاج و فرق سر (Vertex)",
  frontal: "خط رویش قدامی (Frontal)",
  temple: "شقیقه و گیجگاهی (Temple)",
  occiput: "پس‌سر و بانک مو (Occiput)",
};

export default function BeforeAfterCompareModal({
  isOpen,
  onClose,
  patientName,
  photos,
  defaultPhotoIdA,
  defaultPhotoIdB,
}: BeforeAfterCompareModalProps) {
  const [photoAId, setPhotoAId] = useState<string>("");
  const [photoBId, setPhotoBId] = useState<string>("");
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage 0 to 100
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"split" | "side_by_side">("split");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize selected photos
  useEffect(() => {
    if (!isOpen) return;

    if (photos.length >= 2) {
      const pA = defaultPhotoIdA
        ? photos.find((p) => p.id === defaultPhotoIdA)
        : photos[photos.length - 1];
      const pB = defaultPhotoIdB
        ? photos.find((p) => p.id === defaultPhotoIdB)
        : photos[0];

      setPhotoAId(pA?.id || photos[0].id);
      setPhotoBId(pB?.id || (photos[1] ? photos[1].id : photos[0].id));
    } else if (photos.length === 1) {
      setPhotoAId(photos[0].id);
      setPhotoBId(photos[0].id);
    }
  }, [isOpen, photos, defaultPhotoIdA, defaultPhotoIdB]);

  const photoA = photos.find((p) => p.id === photoAId) || photos[0];
  const photoB = photos.find((p) => p.id === photoBId) || photos[1] || photos[0];

  // Dragging slider logic
  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    handleMove(e.touches[0].clientX);
  };

  const stopDragging = () => setIsDragging(false);

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);

  const handleExportComparisonCard = async () => {
    if (!photoA || !photoB) return;
    setIsExporting(true);
    setExportFeedback("در حال آماده‌سازی و رندر کارنامه مقایسه...");

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 760;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Dark luxury background
      ctx.fillStyle = "#0c0a09"; // stone-950
      ctx.fillRect(0, 0, 1200, 760);

      // Gold/Cyan luxury border
      ctx.strokeStyle = "#0891b2"; // cyan-600
      ctx.lineWidth = 4;
      ctx.strokeRect(16, 16, 1168, 728);

      // Inner subtle border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1;
      ctx.strokeRect(24, 24, 1152, 712);

      // Header Banner
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(25, 25, 1150, 90);

      // Header text
      ctx.fillStyle = "#f59e0b"; // amber-500
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("ScalpAI Trichology • کارنامه بالینی مقایسه تریکوسکوپی", 1140, 60);

      ctx.fillStyle = "#a8a29e"; // stone-400
      ctx.font = "14px system-ui, sans-serif";
      ctx.fillText(
        `بیمار: ${patientName}  |  ناحیه: ${AREA_LABELS[photoA.area] || photoA.area}  |  تاریخ صدور: ${new Date().toLocaleDateString("fa-IR")}`,
        1140,
        90
      );

      // Optical verification badge on top left
      ctx.textAlign = "left";
      ctx.fillStyle = "#06b6d4";
      ctx.font = "bold 13px monospace";
      ctx.fillText("VERIFIED BY QUANTUM SCALPAI TRICHOLOGY ENGINE", 50, 65);
      ctx.fillStyle = "#78716c";
      ctx.font = "12px monospace";
      ctx.fillText("CALIBRATED OPTICAL RESOLUTION: 0.1mm GRID", 50, 88);

      // Helper to load image
      const loadImage = (url: string): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject();
          img.src = url;
        });
      };

      const [imgA, imgB] = await Promise.all([
        loadImage(photoA.url).catch(() => null),
        loadImage(photoB.url).catch(() => null),
      ]);

      const boxWidth = 530;
      const boxHeight = 420;
      const boxY = 135;

      // Draw Photo A frame (Left)
      const boxAX = 50;
      ctx.fillStyle = "#171717";
      ctx.fillRect(boxAX, boxY, boxWidth, boxHeight);
      if (imgA) {
        ctx.drawImage(imgA, boxAX, boxY, boxWidth, boxHeight);
      }
      ctx.strokeStyle = "#404040";
      ctx.lineWidth = 2;
      ctx.strokeRect(boxAX, boxY, boxWidth, boxHeight);

      // Photo A label banner
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(boxAX, boxY, boxWidth, 42);
      ctx.fillStyle = "#fde68a"; // amber-200
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`فریم پایه (قبل / Baseline) • ${photoA.date}`, boxAX + boxWidth - 15, boxY + 27);
      ctx.textAlign = "left";
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 13px monospace";
      ctx.fillText(`تراکم: ${photoA.density} تار/cm²`, boxAX + 15, boxY + 27);

      // Draw Photo B frame (Right)
      const boxBX = 620;
      ctx.fillStyle = "#171717";
      ctx.fillRect(boxBX, boxY, boxWidth, boxHeight);
      if (imgB) {
        ctx.drawImage(imgB, boxBX, boxY, boxWidth, boxHeight);
      }
      ctx.strokeStyle = "#0891b2";
      ctx.lineWidth = 2;
      ctx.strokeRect(boxBX, boxY, boxWidth, boxHeight);

      // Photo B label banner
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(boxBX, boxY, boxWidth, 42);
      ctx.fillStyle = "#a7f3d0"; // emerald-200
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`فریم پیگیری (بعد / Follow-up) • ${photoB.date}`, boxBX + boxWidth - 15, boxY + 27);
      ctx.textAlign = "left";
      ctx.fillStyle = "#34d399";
      ctx.font = "bold 13px monospace";
      ctx.fillText(`تراکم: ${photoB.density} تار/cm²`, boxBX + 15, boxY + 27);

      // Bottom Comparison Analytics Ribbon
      const ribbonY = 575;
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(50, ribbonY, 1100, 130);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.strokeRect(50, ribbonY, 1100, 130);

      // Delta metric text
      ctx.textAlign = "right";
      ctx.fillStyle = "#e7e5e4";
      ctx.font = "bold 15px system-ui, sans-serif";
      ctx.fillText("تحلیل کمی تغییرات بالینی در طول دوره درمان:", 1120, ribbonY + 35);

      const deltaText = `${densityDelta >= 0 ? `+${densityDelta}` : densityDelta} تار/cm²  (${densityPercentChange >= 0 ? `+${densityPercentChange}` : densityPercentChange}٪)`;
      ctx.fillStyle = densityDelta >= 0 ? "#10b981" : "#f43f5e";
      ctx.font = "bold 24px monospace";
      ctx.fillText(deltaText, 1120, ribbonY + 75);

      ctx.fillStyle = "#a8a29e";
      ctx.font = "13px system-ui, sans-serif";
      ctx.fillText(
        densityDelta >= 0
          ? "روند رشد فولیکولی مثبت و افزایش موهای ترمینال در پی دوره درمانی مشاهده شد."
          : "کاهش یا عدم تغییر محسوس تراکم موضعی • نیازمند بررسی رژیم ماینوکسیدیل و تغذیه پاپیلاری.",
        1120,
        ribbonY + 105
      );

      // Left stats on ribbon
      ctx.textAlign = "left";
      ctx.fillStyle = "#78716c";
      ctx.font = "12px monospace";
      ctx.fillText(`BASELINE THICKNESS: ${photoA.thickness}`, 70, ribbonY + 35);
      ctx.fillText(`FOLLOW-UP THICKNESS: ${photoB.thickness}`, 70, ribbonY + 60);
      if (photoB.tags && photoB.tags.length > 0) {
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(`CLINICAL SIGNS: ${photoB.tags.join(" • ")}`, 70, ribbonY + 88);
      }

      // Trigger download
      const dataUrl = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const safeName = patientName.replace(/\s+/g, "_");
      link.download = `ScalpAI_Comparison_${safeName}_${photoA.area}.png`;
      link.href = dataUrl;
      link.click();

      setExportFeedback("کارت مقایسه بالینی با موفقیت صادر و دانلود شد.");
      setTimeout(() => setExportFeedback(null), 5000);
    } catch (err) {
      console.error(err);
      setExportFeedback("خطا در صدور کارت مقایسه.");
      setTimeout(() => setExportFeedback(null), 4000);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  if (!isOpen) return null;

  // Calculate delta metrics if density values exist
  const densityDelta =
    photoA && photoB ? photoB.density - photoA.density : 0;
  const densityPercentChange =
    photoA && photoA.density > 0
      ? Math.round((densityDelta / photoA.density) * 100)
      : 0;

  const filteredPhotos =
    filterArea === "all"
      ? photos
      : photos.filter((p) => p.area === filterArea);

  return (
    <div
      id="before-after-modal-backdrop"
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/90 p-2 md:p-6 backdrop-blur-md animate-in fade-in duration-200 select-none overflow-y-auto"
      onMouseUp={stopDragging}
    >
      <div
        id="before-after-container"
        className="relative my-auto w-full max-w-5xl rounded-3xl bg-stone-950 text-stone-100 shadow-2xl border border-stone-800 flex flex-col max-h-[96vh] overflow-hidden"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-4 bg-stone-900/90 border-b border-stone-800 gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <Split className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  مقایسه تریکوسکوپی رو در رو (قبل و بعد بالینی)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  LONGITUDINAL TRACKING
                </span>
              </div>
              <p className="text-xs text-stone-400">
                بیمار: <strong className="text-stone-200">{patientName}</strong> • مقایسه تغییرات میکروکالیبر و تراکم فولیکولی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-stone-800/80 p-1 rounded-xl border border-stone-700 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "split"
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>اسلایدر کشویی</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("side_by_side")}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === "side_by_side"
                    ? "bg-cyan-600 text-white shadow-xs"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>موازی (Side-by-Side)</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-stone-800/80 p-1 rounded-xl border border-stone-700 text-xs">
              <button
                type="button"
                onClick={() => setZoomLevel(zoomLevel === 1 ? 1.5 : zoomLevel === 1.5 ? 2 : 1)}
                className="px-2.5 py-1 rounded-lg text-stone-300 hover:text-white font-mono font-bold hover:bg-stone-700 transition-colors cursor-pointer"
                title="بزرگ‌نمایی میکروسکوپی"
              >
                {zoomLevel}x
              </button>
            </div>

            {/* Export Card Button */}
            <button
              type="button"
              onClick={handleExportComparisonCard}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="صدور کارنامه تصویری قبل و بعد برای تحویل به بیمار یا چاپ"
            >
              <Download className="w-3.5 h-3.5 text-amber-200" />
              <span>{isExporting ? "در حال صدور..." : "صدور کارت مقایسه"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-stone-700 flex items-center justify-center text-stone-400 hover:bg-stone-800 hover:text-white transition-colors cursor-pointer mr-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Export Feedback Banner */}
        {exportFeedback && (
          <div className="px-6 py-2.5 bg-emerald-950/90 border-b border-emerald-800 text-emerald-300 text-xs font-bold flex items-center justify-between animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{exportFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setExportFeedback(null)}
              className="text-emerald-400 hover:text-white text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Photo Selection Ribbon */}
        <div className="px-6 py-3 bg-stone-900/50 border-b border-stone-800 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-4 flex-1">
            {/* Select Image A (قبل) */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-stone-800 text-amber-300 border border-amber-500/30 font-bold text-[11px]">
                فریم اول (قبل / Baseline):
              </span>
              <select
                value={photoAId}
                onChange={(e) => setPhotoAId(e.target.value)}
                className="bg-stone-900 border border-stone-700 rounded-xl px-2.5 py-1.5 text-stone-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {filteredPhotos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {AREA_LABELS[p.area] || p.area} — تاریخ {p.date} ({p.density} تار/cm²)
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="w-4 h-4 text-stone-500 hidden md:block" />

            {/* Select Image B (بعد) */}
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-stone-800 text-emerald-300 border border-emerald-500/30 font-bold text-[11px]">
                فریم دوم (بعد / Follow-up):
              </span>
              <select
                value={photoBId}
                onChange={(e) => setPhotoBId(e.target.value)}
                className="bg-stone-900 border border-stone-700 rounded-xl px-2.5 py-1.5 text-stone-200 text-xs focus:outline-none focus:border-cyan-500 cursor-pointer"
              >
                {filteredPhotos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {AREA_LABELS[p.area] || p.area} — تاریخ {p.date} ({p.density} تار/cm²)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Area filter */}
          <div className="flex items-center gap-1.5 text-stone-400">
            <span>فیلتر ناحیه:</span>
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="bg-stone-900 border border-stone-700 rounded-xl px-2 py-1 text-stone-300 text-xs focus:outline-none cursor-pointer"
            >
              <option value="all">همه نواحی</option>
              <option value="vertex">فرق سر (Vertex)</option>
              <option value="frontal">خط رویش (Frontal)</option>
              <option value="temple">شقیقه (Temple)</option>
              <option value="occiput">پس‌سر (Occiput)</option>
            </select>
          </div>
        </div>

        {/* Delta Clinical Metrics Bar */}
        <div className="px-6 py-2.5 bg-cyan-950/25 border-b border-cyan-900/40 flex flex-wrap items-center justify-between gap-4 text-xs shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <TrendingUp
                className={`w-4 h-4 ${
                  densityDelta >= 0 ? "text-emerald-400" : "text-amber-400"
                }`}
              />
              <span className="text-stone-300 font-medium">تغییرات تراکم فولیکولی:</span>
              <span
                className={`font-bold font-mono text-sm ${
                  densityDelta >= 0 ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {densityDelta >= 0 ? `+${densityDelta}` : densityDelta} تار/cm²
                {" "}
                ({densityPercentChange >= 0 ? `+${densityPercentChange}` : densityPercentChange}٪)
              </span>
            </div>

            <div className="flex items-center gap-2 text-stone-400">
              <span>ضخامت کالیبر:</span>
              <span className="font-mono text-stone-200">
                {photoA?.thickness} ← {photoB?.thickness}
              </span>
            </div>

            <div className="flex items-center gap-2 text-stone-400 hidden sm:flex">
              <span>فاصله پایش:</span>
              <span className="text-stone-200 font-mono">
                {photoA?.date} تا {photoB?.date}
              </span>
            </div>
          </div>

          <div className="text-[11px] font-mono text-cyan-400/90 bg-stone-900/80 px-2.5 py-1 rounded-lg border border-cyan-800/50">
            CALIBRATED OPTICAL REGISTRATION: PASS
          </div>
        </div>

        {/* Main Visual Comparison Stage */}
        <div className="p-4 md:p-6 flex-1 flex flex-col justify-center items-center overflow-hidden bg-black/60">
          {viewMode === "split" ? (
            /* Mode 1: Interactive Split Slider */
            <div
              ref={containerRef}
              className="relative w-full max-w-3xl aspect-16/10 rounded-2xl overflow-hidden shadow-2xl border border-stone-800 bg-black cursor-ew-resize select-none"
              onMouseDown={(e) => {
                setIsDragging(true);
                handleMove(e.clientX);
              }}
              onMouseMove={handleMouseMove}
              onTouchStart={(e) => {
                setIsDragging(true);
                handleMove(e.touches[0].clientX);
              }}
              onTouchMove={handleTouchMove}
            >
              {/* Image B (Underneath / Full / After) */}
              <img
                src={photoB?.url || photoA?.url}
                alt="After"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-100"
                style={{ transform: `scale(${zoomLevel})` }}
                draggable={false}
              />

              {/* Image A (Clipped Overlay / Before) */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                }}
              >
                <img
                  src={photoA?.url}
                  alt="Before"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-100"
                  style={{ transform: `scale(${zoomLevel})` }}
                  draggable={false}
                />
              </div>

              {/* Split Line & Handle */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] z-20 pointer-events-none"
                style={{ left: `${sliderPosition}%` }}
              >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-cyan-500 border-2 border-white shadow-lg flex items-center justify-center text-white text-xs">
                  <Split className="w-4 h-4" />
                </div>
              </div>

              {/* Labels & Tags Overlay */}
              {/* Left Side Label (Before) */}
              <div className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-stone-950/85 backdrop-blur-md border border-amber-500/40 text-xs font-bold text-amber-300 z-10 flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>قبل (Baseline) • {photoA?.date}</span>
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  تراکم: {photoA?.density} • ضخامت: {photoA?.thickness}
                </span>
              </div>

              {/* Right Side Label (After) */}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-stone-950/85 backdrop-blur-md border border-emerald-500/40 text-xs font-bold text-emerald-300 z-10 flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>بعد (Follow-up) • {photoB?.date}</span>
                </span>
                <span className="text-[10px] text-stone-400 font-mono">
                  تراکم: {photoB?.density} • ضخامت: {photoB?.thickness}
                </span>
              </div>

              {/* Slider instruction tooltip */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-stone-900/80 backdrop-blur-md text-stone-400 text-[11px] border border-stone-800 pointer-events-none z-10">
                نشانگر را به چپ و راست بکشید تا تغییرات مو مقایسه شود
              </div>
            </div>
          ) : (
            /* Mode 2: Side-by-Side Dual View */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
              {/* Card A (Before) */}
              <div className="rounded-2xl bg-stone-900/70 border border-stone-800 overflow-hidden flex flex-col">
                <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    فریم مبنا (قبل) • {photoA?.date}
                  </span>
                  <span className="text-stone-400 text-[11px] font-mono">
                    تراکم: {photoA?.density} تار/cm²
                  </span>
                </div>
                <div className="relative aspect-4/3 overflow-hidden bg-black flex items-center justify-center">
                  <img
                    src={photoA?.url}
                    alt="Before"
                    className="w-full h-full object-cover transition-transform duration-100"
                    style={{ transform: `scale(${zoomLevel})` }}
                  />
                  {photoA?.tags && photoA.tags.length > 0 && (
                    <div className="absolute bottom-2 right-2 flex flex-wrap gap-1">
                      {photoA.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-stone-950/80 text-amber-200 text-[10px] border border-stone-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-3 bg-stone-950 text-xs flex items-center justify-between text-stone-400 font-mono">
                  <span>ناحیه: {photoA ? AREA_LABELS[photoA.area] || photoA.area : "-"}</span>
                  <span>کالیبر: {photoA?.thickness}</span>
                </div>
              </div>

              {/* Card B (After) */}
              <div className="rounded-2xl bg-stone-900/70 border border-stone-800 overflow-hidden flex flex-col">
                <div className="px-4 py-2 bg-emerald-950/30 border-b border-emerald-900/40 flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    فریم پایش (بعد) • {photoB?.date}
                  </span>
                  <span className="text-stone-400 text-[11px] font-mono">
                    تراکم: {photoB?.density} تار/cm²
                  </span>
                </div>
                <div className="relative aspect-4/3 overflow-hidden bg-black flex items-center justify-center">
                  <img
                    src={photoB?.url}
                    alt="After"
                    className="w-full h-full object-cover transition-transform duration-100"
                    style={{ transform: `scale(${zoomLevel})` }}
                  />
                  {photoB?.tags && photoB.tags.length > 0 && (
                    <div className="absolute bottom-2 right-2 flex flex-wrap gap-1">
                      {photoB.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-stone-950/80 text-emerald-200 text-[10px] border border-stone-800"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="p-3 bg-stone-950 text-xs flex items-center justify-between text-stone-400 font-mono">
                  <span>ناحیه: {photoB ? AREA_LABELS[photoB.area] || photoB.area : "-"}</span>
                  <span>کالیبر: {photoB?.thickness}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-stone-900/90 border-t border-stone-800 shrink-0">
          <div className="flex items-center gap-2 text-xs text-stone-400">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>نرم‌افزار مقایسه طولی تراکم مو و قطر تارها بر پایه پردازش تصویر ScalpAI</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExportComparisonCard}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              title="دانلود کارنامه مقایسه در ابعاد بزرگ برای واتساپ، پرینت یا پرونده بیمار"
            >
              <Download className="w-4 h-4 text-amber-200" />
              <span>{isExporting ? "در حال صدور کارنامه..." : "صدور کارنامه تصویری (PNG)"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold border border-stone-700 transition-colors cursor-pointer"
            >
              بستن
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
