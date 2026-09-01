import React, { useState } from "react";
import {
  Layers,
  Crosshair,
  Eye,
  CheckCircle,
} from "lucide-react";

interface FollicleDetection {
  id: string;
  x: number; // percentage
  y: number; // percentage
  type: "single" | "double" | "triple" | "empty";
  caliber: number; // µm
  confidence: number; // %
}

interface NeuralSegmentationOverlayProps {
  imageUrl: string;
  areaName: string;
  patientName: string;
  onRetest?: () => void;
}

const SAMPLE_DETECTIONS: FollicleDetection[] = [
  { id: "f1", x: 28, y: 34, type: "triple", caliber: 78, confidence: 98 },
  { id: "f2", x: 42, y: 25, type: "double", caliber: 71, confidence: 96 },
  { id: "f3", x: 62, y: 38, type: "double", caliber: 69, confidence: 94 },
  { id: "f4", x: 74, y: 52, type: "single", caliber: 54, confidence: 91 },
  { id: "f5", x: 35, y: 65, type: "triple", caliber: 82, confidence: 99 },
  { id: "f6", x: 55, y: 70, type: "double", caliber: 73, confidence: 95 },
  { id: "f7", x: 80, y: 30, type: "empty", caliber: 0, confidence: 88 },
  { id: "f8", x: 18, y: 55, type: "single", caliber: 58, confidence: 92 },
];

export const NeuralSegmentationOverlay: React.FC<NeuralSegmentationOverlayProps> = ({
  imageUrl,
  areaName,
  patientName,
}) => {
  const [showAiBoxes, setShowAiBoxes] = useState(true);
  const [showLaser, setShowLaser] = useState(true);
  const [selectedFollicle, setSelectedFollicle] = useState<FollicleDetection | null>(null);
  const [heatmapMode, setHeatmapMode] = useState(false);

  return (
    <div className="relative rounded-3xl overflow-hidden luxury-glass-card border border-rose-400/20 p-4 select-none">
      {/* HUD Header */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-rose-400 animate-pulse" />
          <span className="font-mono text-white font-bold tracking-wider">
            AI TRICHO-VISION HUD • 4K
          </span>
          <span className="px-2 py-0.5 rounded-full bg-rose-950/70 border border-rose-400/30 text-[0.65rem] text-rose-200 shadow-sm">
            ناحیه: {areaName}
          </span>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAiBoxes(!showAiBoxes)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[0.68rem] font-bold border transition-all ${
              showAiBoxes
                ? "bg-rose-500/30 border-rose-400 text-rose-100 shadow-sm"
                : "bg-black/50 border-rose-200/20 text-rose-300/70 hover:text-white hover:bg-black/70"
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>واحد‌های فولیکولی</span>
          </button>

          <button
            onClick={() => setHeatmapMode(!heatmapMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[0.68rem] font-bold border transition-all ${
              heatmapMode
                ? "bg-amber-500/30 border-amber-400 text-amber-100 shadow-sm"
                : "bg-black/50 border-rose-200/20 text-rose-300/70 hover:text-white hover:bg-black/70"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>نقشه حرارتی تراکم</span>
          </button>

          <button
            onClick={() => setShowLaser(!showLaser)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[0.68rem] font-bold border transition-all ${
              showLaser
                ? "bg-rose-500/30 border-rose-400 text-rose-100 shadow-sm"
                : "bg-black/50 border-rose-200/20 text-rose-300/70 hover:text-white hover:bg-black/70"
            }`}
          >
            <Crosshair className="w-3 h-3" />
            <span>لیزر اسکنر</span>
          </button>
        </div>
      </div>

      {/* Image Stage Container */}
      <div className="relative aspect-16/10 rounded-2xl overflow-hidden bg-black/80 border border-rose-400/20 shadow-2xl">
        <img
          src={imageUrl}
          alt="Trichoscopy Microscopic View"
          className={`w-full h-full object-cover transition-all duration-700 ${
            heatmapMode ? "brightness-75 contrast-125 saturate-200 hue-rotate-30" : ""
          }`}
        />

        {/* Heatmap color gradient overlay */}
        {heatmapMode && (
          <div
            className="absolute inset-0 pointer-events-none opacity-40 mix-blend-color-dodge"
            style={{
              background:
                "radial-gradient(circle at 35% 45%, #ef4444 0%, #f59e0b 35%, #10b981 70%, transparent 90%)",
            }}
          />
        )}

        {/* Laser Scanner */}
        {showLaser && <div className="laser-scan-line pointer-events-none" />}

        {/* Reticle Crosshairs in Corners */}
        <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-rose-400/60 pointer-events-none" />
        <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-rose-400/60 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-rose-400/60 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-rose-400/60 pointer-events-none" />

        {/* Center Target Crosshair */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none opacity-25">
          <div className="w-24 h-24 rounded-full border border-dashed border-rose-300 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-rose-400" />
          </div>
        </div>

        {/* AI Follicular Detection Markers */}
        {showAiBoxes &&
          SAMPLE_DETECTIONS.map((f) => {
            const isHovered = selectedFollicle?.id === f.id;
            const typeColor =
              f.type === "triple"
                ? "border-emerald-400 text-emerald-200 bg-emerald-950/60"
                : f.type === "double"
                ? "border-rose-400 text-rose-200 bg-rose-950/60"
                : f.type === "single"
                ? "border-amber-400 text-amber-200 bg-amber-950/60"
                : "border-gray-500 text-gray-300 bg-gray-900/60";

            return (
              <div
                key={f.id}
                onClick={() => setSelectedFollicle(f)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 ${
                  isHovered ? "scale-125 z-30" : "scale-100 z-10"
                }`}
                style={{ left: `${f.x}%`, top: `${f.y}%` }}
              >
                {/* Outer Ring */}
                <div
                  className={`w-9 h-9 rounded-full border-2 flex items-center justify-center backdrop-blur-xs shadow-lg ${typeColor}`}
                >
                  <span className="text-[0.6rem] font-mono font-black">
                    {f.type === "triple" ? "3F" : f.type === "double" ? "2F" : f.type === "single" ? "1F" : "Ø"}
                  </span>
                </div>

                {/* Floating Tag */}
                {isHovered && (
                  <div className="absolute top-10 right-1/2 translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 border border-rose-400/60 text-[0.62rem] text-rose-100 whitespace-nowrap shadow-xl">
                    <div>کالیبر: {f.caliber} µm</div>
                    <div className="text-emerald-400 font-bold">اطمینان مدل: {f.confidence}%</div>
                  </div>
                )}
              </div>
            );
          })}

        {/* Bottom Telemetry Bar on Image */}
        <div className="absolute bottom-2 inset-x-2 p-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/10 flex items-center justify-between text-[0.68rem] text-rose-200">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              ۸ واحد فولیکولی تفکیک شد
            </span>
            <span className="text-rose-300/80">میانگین ضخامت: 71.4 µm</span>
            <span className="text-rose-300/80">تراکم محلی: 154 تار/cm²</span>
          </div>

          <span className="text-[0.65rem] font-mono text-rose-400/80">
            Tensor-Model: v4.8 • {patientName}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NeuralSegmentationOverlay;
