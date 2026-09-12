import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Layers,
  Crosshair,
  Eye,
  CheckCircle,
} from "lucide-react";
import { DemoWatermark } from "./DemoWatermark.js";
import type { DashboardDataMode } from "../data/dashboard-data-provider.js";

export interface FollicleDetection {
  id: string;
  x: number; // percentage
  y: number; // percentage
  type: "single" | "double" | "triple" | "empty";
  caliber: number; // µm
  confidence: number; // %
}

export interface NeuralSegmentationOverlayProps {
  imageUrl: string;
  areaName: string;
  patientName: string;
  onRetest?: () => void;
  /** Analysis output supplied by the real, demo, or test boundary. */
  detections?: readonly FollicleDetection[];
  dataMode?: DashboardDataMode;
}

export const NeuralSegmentationOverlay: React.FC<NeuralSegmentationOverlayProps> = ({
  imageUrl,
  areaName,
  patientName,
  detections = [],
  dataMode = "real",
}) => {
  const { t } = useTranslation();
  const [showAiBoxes, setShowAiBoxes] = useState(true);
  const [showLaser, setShowLaser] = useState(true);
  const [selectedFollicle, setSelectedFollicle] = useState<FollicleDetection | null>(null);
  const [heatmapMode, setHeatmapMode] = useState(false);

  const typeLabel = {
    single: t("dashboard.neuralSegmentation.single"),
    double: t("dashboard.neuralSegmentation.double"),
    triple: t("dashboard.neuralSegmentation.triple"),
    empty: t("dashboard.neuralSegmentation.empty"),
  };
  const averageCaliber = detections.length
    ? detections.reduce((sum, detection) => sum + detection.caliber, 0) / detections.length
    : 0;

  return (
    <div className="relative rounded-3xl overflow-hidden bg-white/55 border border-white/80 backdrop-blur-xl shadow-md p-4 select-none">
      <DemoWatermark mode={dataMode} surface="overlay" />
      {/* HUD Header */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[oklch(62%_0.09_16)] animate-pulse" />
          <span className="font-mono text-[oklch(20%_0.02_20)] font-bold tracking-wider">
            AI TRICHO-VISION HUD • 4K
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-white/80 border border-black/5 text-[0.65rem] text-[oklch(40%_0.02_20)] font-medium shadow-xs">
            {t("dashboard.neuralSegmentation.areaPrefix", { area: areaName })}
          </span>
        </div>

        {/* Action Toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAiBoxes(!showAiBoxes)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[0.68rem] font-bold border transition-all ${
              showAiBoxes
                ? "bg-white/95 border-[oklch(62%_0.09_16)] text-[oklch(20%_0.02_20)] shadow-xs"
                : "bg-white/40 border-white/70 text-[oklch(45%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/70"
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>{t("dashboard.neuralSegmentation.follicularUnits")}</span>
          </button>

          <button
            onClick={() => setHeatmapMode(!heatmapMode)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[0.68rem] font-bold border transition-all ${
              heatmapMode
                ? "bg-amber-100 border-amber-400 text-amber-900 shadow-xs"
                : "bg-white/40 border-white/70 text-[oklch(45%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/70"
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>{t("dashboard.neuralSegmentation.densityHeatmap")}</span>
          </button>

          <button
            onClick={() => setShowLaser(!showLaser)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[0.68rem] font-bold border transition-all ${
              showLaser
                ? "bg-white/95 border-[oklch(62%_0.09_16)] text-[oklch(20%_0.02_20)] shadow-xs"
                : "bg-white/40 border-white/70 text-[oklch(45%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/70"
            }`}
          >
            <Crosshair className="w-3 h-3" />
            <span>{t("dashboard.neuralSegmentation.laserScanner")}</span>
          </button>
        </div>
      </div>

      {/* Image Stage Container */}
      <div className="relative aspect-16/10 rounded-2xl overflow-hidden bg-stone-900 border border-white/30 shadow-lg">
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
        <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-rose-300 pointer-events-none" />
        <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-rose-300 pointer-events-none" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-rose-300 pointer-events-none" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-rose-300 pointer-events-none" />

        {/* Center Target Crosshair */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none opacity-30">
          <div className="w-24 h-24 rounded-full border border-dashed border-rose-200 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-rose-400" />
          </div>
        </div>

        {/* AI Follicular Detection Markers */}
        {showAiBoxes &&
          detections.map((f) => {
            const isHovered = selectedFollicle?.id === f.id;
            const typeColor =
              f.type === "triple"
                ? "border-emerald-400 text-emerald-200 bg-emerald-950/70"
                : f.type === "double"
                ? "border-rose-400 text-rose-200 bg-rose-950/70"
                : f.type === "single"
                ? "border-amber-400 text-amber-200 bg-amber-950/70"
                : "border-gray-500 text-gray-300 bg-gray-900/70";

            // M19/jsx-a11y: this marker used to be a bare <div onClick> — mouse
            // only, and absent from both the tab order and the accessibility
            // tree. role + tabIndex + a keyboard handler make it a real control.
            const select = () => setSelectedFollicle(f);

            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                aria-pressed={isHovered}
                aria-label={t("dashboard.neuralSegmentation.ariaLabel", {
                type: typeLabel[f.type],
                caliber: f.caliber,
                confidence: f.confidence,
              })}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select();
                  }
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-300 ${
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
                  <div className="absolute top-10 right-1/2 translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/90 border border-white/30 text-[0.62rem] text-rose-100 whitespace-nowrap shadow-xl">
                    <div>{t("dashboard.neuralSegmentation.caliberLabel", { caliber: f.caliber })}</div>
                    <div className="text-emerald-400 font-bold">{t("dashboard.neuralSegmentation.confidenceLabel", { confidence: f.confidence })}</div>
                  </div>
                )}
              </div>
            );
          })}

        {/* Bottom Telemetry Bar on Image */}
        <div className="absolute bottom-2 inset-x-2 p-2 rounded-xl bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-between text-[0.68rem] text-rose-100">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-emerald-300 font-bold">
              <CheckCircle className="w-3.5 h-3.5" />
              {t("dashboard.neuralSegmentation.detectedCount", { count: detections.length })}
            </span>
            <span className="text-stone-300">{t("dashboard.neuralSegmentation.avgCaliber", { value: averageCaliber.toFixed(1) })}</span>
            <span className="text-stone-300">{t("dashboard.neuralSegmentation.avgDensity", { value: detections.length })}</span>
          </div>

          <span className="text-[0.65rem] font-mono text-rose-300/90">
            Tensor-Model: v4.8 • {patientName}
          </span>
        </div>
      </div>
    </div>
  );
};

export default NeuralSegmentationOverlay;
