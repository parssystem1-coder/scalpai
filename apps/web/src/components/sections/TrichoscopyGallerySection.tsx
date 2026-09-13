import React from "react";
import { useTranslation } from "react-i18next";
import { Camera, ArrowUp, UploadCloud, CheckCircle2, Split, Trash2, Maximize2, Eye } from "lucide-react";
import LuxuryTiltCard from "../LuxuryTiltCard";
import NeuralSegmentationOverlay from "../NeuralSegmentationOverlay";
import { faNum, formatDate } from "../../i18n";
import type { TrichoscopyImage } from "../../data/dashboard-types";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */

export interface TrichoscopyGallerySectionProps { [key: string]: any; }
export default function TrichoscopyGallerySection(props: TrichoscopyGallerySectionProps) {
  const { selectedArea, setSelectedArea, activeInspectedPhoto, setActiveInspectedPhoto, uploadFeedback, setUploadFeedback, isDraggingOver, dataMode, fileInputRef, handleDrop, handleDragOver, handleDragLeave, handleFileInputChange, handleDeletePhoto, handleOpenLightbox, openGuidedCapture, openBeforeAfter, scrollToSection, areaLabel, selectedPatient, localImages, setCompareDefaultA, setCompareDefaultB } = props;
  const patientPhotos: TrichoscopyImage[] = props.patientPhotos;
  const { t } = useTranslation();
  return (
        <section id="section-gallery" className="scroll-mt-28 space-y-6">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    {t("dashboard.galleryVision.badge")}
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    {t("dashboard.galleryVision.heading", {
                      patient: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
                    })}
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">
                  {t("dashboard.galleryVision.subtitle")}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const photos = localImages[selectedPatient.id] || [];
                    if (photos.length > 0) {
                      setCompareDefaultA(photos[photos.length - 1]?.id);
                      setCompareDefaultB(photos[0]?.id);
                    }
                    openBeforeAfter();
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 shadow-xs transition-all text-xs font-bold cursor-pointer"
                  title={t("dashboard.galleryVision.compareTitle")}
                >
                  <Split className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t("dashboard.galleryVision.compare")}</span>
                </button>

                <button
                  type="button"
                  onClick={openGuidedCapture}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl rose-gold-gradient text-white shadow-xs hover:brightness-110 transition-all text-xs font-bold cursor-pointer"
                  title={t("dashboard.galleryVision.captureTitle")}
                >
                  <Camera className="w-3.5 h-3.5 text-amber-200" />
                  <span>{t("dashboard.galleryVision.capture")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToSection("patients")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold cursor-pointer"
                  title={t("dashboard.galleryVision.backToTopTitle")}
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span className="hidden sm:inline">{t("dashboard.galleryVision.backToTop")}</span>
                </button>
              </div>
            </div>

            {/* Area Selector Tabs */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
              <div className="flex items-center gap-1.5 p-1.5 bg-white/40 backdrop-blur-xl rounded-2xl border border-white/60 shadow-xs">
                  {(["vertex", "temple", "frontal", "occiput"] as const).map((area) => (
                    <button
                      key={area}
                      onClick={() => setSelectedArea(area)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        selectedArea === area
                          ? "rose-gold-gradient text-white shadow-md shadow-[oklch(62%_0.09_16/0.25)]"
                          : "text-[oklch(40%_0.02_20)] hover:text-[oklch(20%_0.02_20)] hover:bg-white/50"
                      }`}
                    >
                      {areaLabel(area)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Main Interactive AI Segmentation HUD */}
              <div className="mb-8">
                <NeuralSegmentationOverlay
                  imageUrl={activeInspectedPhoto?.url || patientPhotos[0]?.url || "/trichoscopy/vertex.jpg"}
                  areaName={areaLabel(activeInspectedPhoto ? activeInspectedPhoto.area : selectedArea)}
                  patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                  dataMode={dataMode}
                />
              </div>

              {/* Upload Feedback Toast */}
              {uploadFeedback && (
                <div className="mb-6 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{uploadFeedback}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUploadFeedback(null)}
                    className="text-emerald-700 hover:text-emerald-950 text-xs cursor-pointer"
                  >
                    {t("dashboard.galleryVision.closeToast")}
                  </button>
                </div>
              )}

              {/* Upload Dropzone with Real File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/jpg"
                onChange={handleFileInputChange}
                className="hidden"
                id="real-trichoscope-file-input"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-8 rounded-[28px] border-2 border-dashed transition-all cursor-pointer group shadow-xs backdrop-blur-md text-center mb-8 ${
                  isDraggingOver
                    ? "border-[oklch(62%_0.09_16)] bg-[oklch(62%_0.09_16/0.1)] scale-[1.01]"
                    : "border-[oklch(62%_0.09_16/0.4)] bg-white/40 hover:bg-white/70 hover:border-[oklch(62%_0.09_16)]"
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-white/80 border border-white text-[oklch(62%_0.09_16)] grid place-items-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-xs">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-[oklch(20%_0.02_20)]">
                  {isDraggingOver
                    ? t("dashboard.galleryVision.dropActive")
                    : t("dashboard.galleryVision.dropIdle")}
                </h4>
                <p className="text-xs text-[oklch(45%_0.02_20)] mt-1">
                  {t("dashboard.galleryVision.dropHint", { area: areaLabel(selectedArea) })}
                </p>
                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-[oklch(62%_0.09_16)] font-bold">
                  <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-white/60 shadow-2xs">
                    {t("dashboard.galleryVision.dropChipBrowse")}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/80 border border-white/60 shadow-2xs">
                    {t("dashboard.galleryVision.dropChipInstant")}
                  </span>
                </div>
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {patientPhotos.length === 0 ? (
                  <div className="col-span-full p-8 rounded-3xl bg-white/50 border border-dashed border-stone-300 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-[oklch(30%_0.02_20)]">
                      {t("dashboard.galleryVision.emptyTitle")}
                    </div>
                    <p className="text-xs text-[oklch(50%_0.02_20)] max-w-md">
                      {t("dashboard.galleryVision.emptyHint")}
                    </p>
                    <button
                      type="button"
                      onClick={openGuidedCapture}
                      className="mt-2 px-4 py-2 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>{t("dashboard.galleryVision.startCapture")}</span>
                    </button>
                  </div>
                ) : (
                  patientPhotos.map((photo) => {
                    const isCurrentHUD = (activeInspectedPhoto?.id || patientPhotos[0]?.id) === photo.id;
                    return (
                      <LuxuryTiltCard key={photo.id} maxTilt={5} className="rounded-3xl">
                        <div
                          className={`rounded-3xl overflow-hidden border transition-all shadow-md bg-white/55 backdrop-blur-xl ${
                            isCurrentHUD
                              ? "border-[oklch(62%_0.09_16)] ring-2 ring-[oklch(62%_0.09_16/0.3)]"
                              : "border-white/80 hover:border-white"
                          }`}
                        >
                          <div
                            className="relative aspect-4/3 bg-stone-900/10 overflow-hidden cursor-pointer group"
                            onClick={() => setActiveInspectedPhoto(photo)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveInspectedPhoto(photo); }}
                            title={t("dashboard.galleryVision.inspectCardTitle")}
                          >
                            <img
                              src={photo.url}
                              alt={t("dashboard.galleryVision.thumbAlt")}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-white/90 backdrop-blur-md text-[oklch(20%_0.02_20)] text-[0.65rem] font-bold border border-white/80 shadow-xs">
                              {t("dashboard.galleryVision.areaLabel", { area: photo.area })}
                            </div>
                            {isCurrentHUD && (
                              <div className="absolute top-3 left-3 px-2.5 py-0.5 rounded-full bg-[oklch(62%_0.09_16)] text-white text-[0.62rem] font-bold shadow-xs">
                                {t("dashboard.galleryVision.inspecting")}
                              </div>
                            )}
                            <div className="absolute bottom-3 left-3 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-300 backdrop-blur-md text-emerald-800 text-[0.65rem] font-bold flex items-center gap-1 shadow-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t("dashboard.galleryVision.quantumClarity", {
                                value: faNum(photo.qualityScore),
                              })}
                            </div>
                          </div>

                          <div className="p-5">
                            {/* Clinical Signs / Tags */}
                            {photo.tags && photo.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2.5">
                                {photo.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80"
                                  >
                                    {t("dashboard.galleryVision.tagChip", { tag })}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center justify-between text-xs text-[oklch(45%_0.02_20)] mb-3 font-mono">
                              <span>
                                {t("dashboard.galleryVision.dateLabel", {
                                  value: faNum(formatDate(photo.date)),
                                })}
                              </span>
                              <span>
                                {t("dashboard.galleryVision.thicknessLabel", {
                                  value: faNum(photo.thickness),
                                })}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-black/5 gap-2">
                              <span className="text-xs font-bold text-[oklch(20%_0.02_20)]">
                                {t("dashboard.galleryVision.densityLabel", {
                                  value: faNum(photo.density),
                                })}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeletePhoto(photo.id);
                                  }}
                                  className="p-2 rounded-xl bg-white/80 hover:bg-rose-50 text-stone-400 hover:text-rose-600 border border-stone-200 hover:border-rose-200 shadow-xs transition-all cursor-pointer"
                                  title={t("dashboard.galleryVision.deletePhotoTitle")}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const other = patientPhotos.find((p) => p.id !== photo.id) || photo;
                                    setCompareDefaultA(other.id);
                                    setCompareDefaultB(photo.id);
                                    openBeforeAfter();
                                  }}
                                  className="p-2 rounded-xl bg-white/80 hover:bg-cyan-50 text-stone-500 hover:text-cyan-700 border border-white shadow-xs transition-all cursor-pointer"
                                  title={t("dashboard.galleryVision.comparePhotoTitle")}
                                >
                                  <Split className="w-3.5 h-3.5 text-cyan-600" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenLightbox(photo)}
                                  className="p-2 rounded-xl bg-white/80 hover:bg-white text-[oklch(40%_0.02_20)] border border-white shadow-xs transition-all cursor-pointer"
                                  title={t("dashboard.galleryVision.fullscreenTitle")}
                                >
                                  <Maximize2 className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveInspectedPhoto(photo);
                                    scrollToSection("gallery");
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl rose-gold-gradient text-white text-xs font-bold shadow-xs hover:brightness-110 transition-all cursor-pointer"
                                  title={t("dashboard.galleryVision.inspectHudTitle")}
                                >
                                  <Eye className="w-3.5 h-3.5 text-amber-200" />
                                  <span>{t("dashboard.galleryVision.inspectHud")}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </LuxuryTiltCard>
                    );
                  })
                )}
              </div>
            </div>
        </section>

  );
}
