import React, { useEffect, useRef, useState } from "react";
import { Camera, Eye, Move, RotateCw, Split, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Patient, TrichoscopyImage } from "../../data/dashboard-types";
import { faNum, formatDate } from "../../i18n";

/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */

export interface PhotoLightboxProps {
  previewPhotoModal: TrichoscopyImage | null; selectedPatient: Patient; photosByPatient: Record<string, readonly TrichoscopyImage[]>;
  onClose: () => void; onDeletePhoto: (id: string) => void; onCompare: (a: string, b: string) => void; onInspectHud: (photo: TrichoscopyImage) => void;
}
export default function PhotoLightbox({ previewPhotoModal, selectedPatient, photosByPatient, onClose, onDeletePhoto, onCompare, onInspectHud }: PhotoLightboxProps) {
  const { t } = useTranslation();
  const [lightboxZoom, setLightboxZoom] = useState(1); const [lightboxPan, setLightboxPan] = useState({x:0,y:0}); const [lightboxRotation, setLightboxRotation] = useState(0); const [isLightboxPanning, setIsLightboxPanning] = useState(false);
  const lightboxPanStart=useRef({x:0,y:0}); const lightboxTouchStart=useRef({x:0,y:0}); const firstRef=useRef<HTMLButtonElement>(null); const returnFocus=useRef<HTMLElement|null>(null);
  const resetLightboxZoom=()=>{setLightboxZoom(1);setLightboxPan({x:0,y:0});setLightboxRotation(0);};
  useEffect(()=>{ if(previewPhotoModal){returnFocus.current=document.activeElement as HTMLElement|null; firstRef.current?.focus();} else returnFocus.current?.focus(); },[previewPhotoModal]);
  useEffect(()=>{const f=(e:KeyboardEvent)=>{if(previewPhotoModal&&e.key==='Escape')onClose();};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[previewPhotoModal,onClose]);
  if (!previewPhotoModal) return null;
  const handleLightboxWheel=(e:React.WheelEvent)=>{e.preventDefault();const factor=-e.deltaY>0?1.2:0.83;setLightboxZoom(prev=>{const next=Math.min(Math.max(1,+(prev*factor).toFixed(2)),6);if(next===1)setLightboxPan({x:0,y:0});return next;});};
  const handleLightboxMouseDown=(e:React.MouseEvent)=>{if(lightboxZoom<=1)return;e.preventDefault();setIsLightboxPanning(true);lightboxPanStart.current={x:e.clientX-lightboxPan.x,y:e.clientY-lightboxPan.y};};
  const handleLightboxMouseMove=(e:React.MouseEvent)=>{if(!isLightboxPanning||lightboxZoom<=1)return;e.preventDefault();const maxPan=(lightboxZoom-1)*450;setLightboxPan({x:Math.max(-maxPan,Math.min(maxPan,e.clientX-lightboxPanStart.current.x)),y:Math.max(-maxPan,Math.min(maxPan,e.clientY-lightboxPanStart.current.y))});};
  const handleLightboxMouseUp=()=>setIsLightboxPanning(false);
  const handleLightboxDoubleClick=(e:React.MouseEvent)=>{e.preventDefault();setLightboxZoom(prev=>{if(prev>1){setLightboxPan({x:0,y:0});return 1;}return 2.5;});};
  const handleLightboxTouchStart=(e:React.TouchEvent)=>{const touch=e.touches[0];if(!touch)return;if(e.touches.length===1&&lightboxZoom>1){setIsLightboxPanning(true);lightboxTouchStart.current={x:touch.clientX-lightboxPan.x,y:touch.clientY-lightboxPan.y};}};
  const handleLightboxTouchMove=(e:React.TouchEvent)=>{const touch=e.touches[0];if(!touch||!isLightboxPanning||lightboxZoom<=1||e.touches.length!==1)return;const maxPan=(lightboxZoom-1)*450;setLightboxPan({x:Math.max(-maxPan,Math.min(maxPan,touch.clientX-lightboxTouchStart.current.x)),y:Math.max(-maxPan,Math.min(maxPan,touch.clientY-lightboxTouchStart.current.y))});};
  const handleLightboxTouchEnd=()=>setIsLightboxPanning(false);
  return (

        <div
          id="photo-lightbox-backdrop"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/92 p-2 sm:p-4 md:p-8 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => {
            resetLightboxZoom();
            onClose();
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-full max-w-5xl bg-stone-950 border border-stone-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh]"
            onClick={(e) => e.stopPropagation()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
          >
            {/* Header with Title & Quick Zoom Controls */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 bg-stone-900 border-b border-stone-800 text-stone-100 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 shrink-0">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{t("dashboard.lightbox.title", { area: previewPhotoModal.area })}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-800 text-cyan-300">
                      {t("dashboard.lightbox.zoomBadge", {
                        value: faNum(Math.round(lightboxZoom * 100)),
                      })}
                    </span>
                  </h4>
                  <span className="text-[11px] text-stone-400 font-mono">
                    {t("dashboard.lightbox.meta", {
                      patient: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
                      date: faNum(formatDate(previewPhotoModal.date)),
                    })}
                  </span>
                </div>
              </div>

              {/* Header Zoom & Rotation Toolbar */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setLightboxZoom((prev) => {
                      const next = Math.max(1, +(prev - 0.5).toFixed(1));
                      if (next === 1) setLightboxPan({ x: 0, y: 0 });
                      return next;
                    });
                  }}
                  disabled={lightboxZoom <= 1}
                  className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 border border-stone-700 transition-colors cursor-pointer"
                  title={t("dashboard.lightbox.zoomOutTitle")}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLightboxZoom((prev) => Math.min(6, +(prev + 0.5).toFixed(1)));
                  }}
                  disabled={lightboxZoom >= 6}
                  className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 disabled:opacity-40 text-stone-300 border border-stone-700 transition-colors cursor-pointer"
                  title={t("dashboard.lightbox.zoomInTitle")}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                {/* Preset Zoom Levels */}
                {[1, 2, 3, 4].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => {
                      setLightboxZoom(level);
                      if (level === 1) setLightboxPan({ x: 0, y: 0 });
                    }}
                    className={`px-2 py-1 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                      Math.abs(lightboxZoom - level) < 0.2
                        ? "bg-cyan-600 border-cyan-400 text-white"
                        : "bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-300"
                    }`}
                  >
                    {faNum(level)}x
                  </button>
                ))}

                {/* Rotate 90 degrees */}
                <button
                  type="button"
                  onClick={() => setLightboxRotation((prev) => (prev + 90) % 360)}
                  className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition-colors cursor-pointer"
                  title={t("dashboard.lightbox.rotateTitle")}
                >
                  <RotateCw className="w-4 h-4 text-cyan-400" />
                </button>

                {/* Reset Zoom */}
                {(lightboxZoom > 1 || lightboxRotation !== 0 || lightboxPan.x !== 0 || lightboxPan.y !== 0) && (
                  <button
                    type="button"
                    onClick={resetLightboxZoom}
                    className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 text-xs font-bold border border-stone-700 transition-colors cursor-pointer"
                    title={t("dashboard.lightbox.resetTitle")}
                  >
                    {t("dashboard.lightbox.reset")}
                  </button>
                )}

                <div className="h-4 w-px bg-stone-800 mx-1" />

                <button
                  type="button"
                  onClick={() => {
                    resetLightboxZoom();
                    onClose();
                  }}
                  className="w-8 h-8 rounded-full border border-stone-700 flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors cursor-pointer shrink-0"
                  title={t("dashboard.lightbox.closeTitle")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Zoomable Viewport */}
            <div
              role="button"
              tabIndex={0}
              className={`relative h-[55vh] sm:h-[65vh] min-h-[380px] bg-black flex items-center justify-center overflow-hidden select-none ${
                lightboxZoom > 1
                  ? isLightboxPanning
                    ? "cursor-grabbing"
                    : "cursor-grab"
                  : "cursor-zoom-in"
              }`}
              onWheel={handleLightboxWheel}
              onMouseDown={handleLightboxMouseDown}
              onMouseMove={handleLightboxMouseMove}
              onMouseUp={handleLightboxMouseUp}
              onMouseLeave={handleLightboxMouseUp}
              onDoubleClick={handleLightboxDoubleClick}
              onTouchStart={handleLightboxTouchStart}
              onTouchMove={handleLightboxTouchMove}
              onTouchEnd={handleLightboxTouchEnd}
            >
              {/* Image with 2D transform (pan + zoom + rotate) */}
              <div
                className="w-full h-full flex items-center justify-center p-2"
                style={{
                  transform: `translate(${lightboxPan.x}px, ${lightboxPan.y}px) scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`,
                  transformOrigin: "center center",
                  transition: isLightboxPanning ? "none" : "transform 0.2s cubic-bezier(0.2, 0, 0, 1)",
                }}
              >
                <img
                  src={previewPhotoModal.url}
                  alt={t("dashboard.lightbox.imageAlt")}
                  className="max-w-full max-h-full object-contain pointer-events-none select-none"
                  draggable={false}
                />
              </div>

              {/* Floating Helper Pill when zoomed in */}
              {lightboxZoom > 1 && (
                <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-950/80 backdrop-blur-md border border-stone-700 text-stone-300 text-xs font-mono animate-in fade-in pointer-events-none">
                  <Move className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("dashboard.lightbox.panHint")}</span>
                </div>
              )}

              {/* Optical Scale and Telemetry Bar at Bottom */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 text-xs bg-stone-950/85 backdrop-blur-md border border-stone-800 px-4 py-2.5 rounded-2xl text-stone-300 font-mono pointer-events-none">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-emerald-400 font-bold">
                    {t("dashboard.lightbox.density", { value: faNum(previewPhotoModal.density) })}
                  </span>
                  <span>
                    {t("dashboard.lightbox.thickness", { value: faNum(previewPhotoModal.thickness) })}
                  </span>
                  <span>
                    {t("dashboard.lightbox.clarity", { value: faNum(previewPhotoModal.qualityScore) })}
                  </span>
                  {previewPhotoModal.tags && previewPhotoModal.tags.length > 0 && (
                    <div className="flex items-center gap-1">
                      {previewPhotoModal.tags.map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800">
                          {t("dashboard.lightbox.tagChip", { tag })}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-stone-400 text-[11px] hidden sm:inline">
                    {t("dashboard.lightbox.mouseHint")}
                  </span>
                  <div className="text-cyan-400 text-[11px]">{t("dashboard.lightbox.calibration")}</div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex flex-wrap items-center justify-between px-6 py-3.5 bg-stone-900 border-t border-stone-800 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (previewPhotoModal) {
                    onDeletePhoto(previewPhotoModal.id);
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-bold border border-rose-800 transition-colors cursor-pointer flex items-center gap-1.5"
                title={t("dashboard.lightbox.deletePhotoTitle")}
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>{t("dashboard.lightbox.deletePhoto")}</span>
              </button>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    if (previewPhotoModal) {
                      const photos = photosByPatient[selectedPatient.id] || [];
                      const other = photos.find((p) => p.id !== previewPhotoModal.id) || previewPhotoModal;
                      resetLightboxZoom();
                      onCompare(other.id, previewPhotoModal.id);
                      onCompare(other.id, previewPhotoModal.id);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-300 text-xs font-bold border border-cyan-800 transition-colors cursor-pointer flex items-center gap-1.5"
                  title={t("dashboard.lightbox.compareTitle")}
                >
                  <Split className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("dashboard.lightbox.compare")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onInspectHud(previewPhotoModal);
                    resetLightboxZoom();
                    onClose();
                    onInspectHud(previewPhotoModal);
                  }}
                  className="px-4 py-2 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-200" />
                  <span>{t("dashboard.lightbox.neuralHud")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetLightboxZoom();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold border border-stone-700 transition-colors cursor-pointer"
                >
                  {t("dashboard.lightbox.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
  );
}

/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */
