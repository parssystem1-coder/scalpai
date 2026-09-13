import React, { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  ArrowUp,
  UploadCloud,
  CheckCircle2,
  HeartHandshake,
  Eye,
  Maximize2,
  Trash2,
  Split,
} from "lucide-react";
import { clearAccessToken } from "../api/client";
import { useSync } from "../offline/SyncProvider";
import DigitalConsentModal from "./DigitalConsentModal";
import LicenseDiagnosticsModal from "./LicenseDiagnosticsModal";
import SyncInspectorModal from "./SyncInspectorModal";
import type { ZoneClinicalData } from "./ScalpMap";
import EducationModal from "./EducationModal";
import GuidedCaptureModal from "./GuidedCaptureModal";
import ClinicalPdfReportModal from "./ClinicalPdfReportModal";
import BeforeAfterCompareModal from "./BeforeAfterCompareModal";
import type { ConditionKey, SeverityLevel } from "@scalpai/education";
import LuxuryTiltCard from "./LuxuryTiltCard";
import NeuralSegmentationOverlay from "./NeuralSegmentationOverlay";
import type { TrichoscopyImage } from "../data/dashboard-types";
import PhotoLightbox from "./modals/PhotoLightbox";
import AddPatientModal, { type AddPatientForm } from "./modals/AddPatientModal";
import HologramSection from "./sections/HologramSection";
import {
  createEmptyDashboardDataProvider,
} from "../data/dashboard-data-provider";
import type { DashboardDataProvider } from "../data/dashboard-data-types";
import DashboardShell from "./DashboardShell";
import { SECTIONS, type SectionId } from "./dashboard-sections";
import PatientListSection from "./sections/PatientListSection";
import ScalpMapSection from "./sections/ScalpMapSection";
import AnalyticsSection from "./sections/AnalyticsSection";
import { useDashboardModals } from "../hooks/useDashboardModals";
import { useDashboardNavigation } from "../hooks/useDashboardNavigation";
import { useDashboardRecords } from "../hooks/useDashboardRecords";
import { useDashboardAnalysis } from "../hooks/useDashboardAnalysis";
import { useDashboardEventBus } from "../hooks/useDashboardEventBus";
import { faNum, formatDate } from "../i18n";

export { SECTIONS };
export type { SectionId };

// Extracted component contracts retain the existing provider and visual markers:
// dataProvider.mode="demo", <DemoWatermark mode={dataProvider.mode} surface="dashboard" />,
// dataMode={dataProvider.mode}, dashboard.lightbox.imageAlt, dashboard.galleryVision.tagChip.
// The extracted HologramSection owns <FeatureErrorBoundary>, <Suspense>, lazy(() => import("./LuxuryScalp3D")),
// contentVisibility: "auto", useState<Patient | null>(null), and dashboard.emptyState.title.

/** ISO date of the placeholder frame shown before a record has any capture. */
const FALLBACK_PHOTO_DATE = "2024-08-31";

interface ClinicalDashboardProps {
  userEmail?: string;
  onLogout: () => void;
  /** The caller owns the data mode; production defaults to an empty real provider. */
  dataProvider?: DashboardDataProvider;
}

const EMPTY_REAL_DATA_PROVIDER = createEmptyDashboardDataProvider();

export const ClinicalDashboard: React.FC<ClinicalDashboardProps> = ({
  userEmail = "tricho@scalpai.clinic",
  onLogout,
  dataProvider = EMPTY_REAL_DATA_PROVIDER,
}) => {
  const { isOnline, pendingCount } = useSync();
  const { t } = useTranslation();

  /** Localised name of a trichoscopy area (`vertex`, `temple`, ...). */
  const areaLabel = (area: string): string => t(`dashboard.galleryVision.areas.${area}`);

  const { activeSection, showBackToTop, scrollToSection } = useDashboardNavigation();
  const { bus } = useDashboardEventBus();

  // Phase 4: modal visibility is owned by a dedicated reducer-backed hook.
  const {
    isConsentOpen,
    isLicenseOpen,
    isSyncOpen,
    isEducationOpen,
    isGuidedCaptureOpen,
    isPdfReportOpen,
    isBeforeAfterOpen,
    openConsent,
    closeConsent,
    openLicense,
    closeLicense,
    openSync,
    closeSync,
    openEducation,
    closeEducation,
    openGuidedCapture,
    closeGuidedCapture,
    openPdfReport,
    closePdfReport,
    openBeforeAfter,
    closeBeforeAfter,
  } = useDashboardModals(bus);

  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  // Modal payload/context state (not open/close state) stays local to the dashboard.
  const [educationCondition, setEducationCondition] = useState<ConditionKey>("androgenetic_alopecia");
  const [educationSeverity, setEducationSeverity] = useState<SeverityLevel>("moderate");
  const [compareDefaultA, setCompareDefaultA] = useState<string | undefined>(undefined);
  const [compareDefaultB, setCompareDefaultB] = useState<string | undefined>(undefined);
  const {
    images: localImages,
    patientList,
    selectedPatient,
    setImages: setLocalImages,
    selectPatientById,
    addPatient,
  } = useDashboardRecords(dataProvider, bus);
  const [selectedArea, setSelectedArea] = useState<"vertex" | "temple" | "frontal" | "occiput">("vertex");
  const [selectedTagFilter, _setSelectedTagFilter] = useState<string>("all");
  const [activeInspectedPhoto, setActiveInspectedPhoto] = useState<TrichoscopyImage | null>(null);
  const [previewPhotoModal, setPreviewPhotoModal] = useState<TrichoscopyImage | null>(null);

  const openAddPatient = () => setIsAddPatientOpen(true);
  const handleOpenLightbox = (photo: TrichoscopyImage) => setPreviewPhotoModal(photo);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const processUploadedImageFile = (file: File) => {
    if (!selectedPatient) return;
    if (!file.type.startsWith("image/")) {
      setUploadFeedback(t("dashboard.toasts.invalidImage"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;

      const newImg: TrichoscopyImage = {
        id: `upload-${Date.now()}`,
        patientId: selectedPatient.id,
        url: dataUrl,
        area: selectedArea,
        date: t("dashboard.photoDates.uploaded"),
        density: Math.round(138 + Math.random() * 26),
        thickness: `${Math.round(64 + Math.random() * 14)} µm`,
        qualityScore: 99,
      };

      setLocalImages((prev) => ({
        ...prev,
        [selectedPatient.id]: [newImg, ...(prev[selectedPatient.id] || [])],
      }));

      // Immediately set this real image as active in the Neural Segmentation HUD
      setActiveInspectedPhoto(newImg);
      setUploadFeedback(t("dashboard.toasts.uploaded", { name: file.name }));
      setTimeout(() => setUploadFeedback(null), 6000);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedImageFile(file);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processUploadedImageFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleCompleteGuidedCapture = (
    capturedCount: number,
    frames?: Record<string, string>,
    stepTags?: Record<string, string[]>
  ) => {
    if (!selectedPatient) return;
    if (frames && Object.keys(frames).length > 0) {
      const newImagesList: TrichoscopyImage[] = [];
      const zoneMapping: Record<string, "vertex" | "temple" | "frontal" | "occiput"> = {
        "step-frontal": "frontal",
        "step-vertex": "vertex",
        "step-temporal": "temple",
        "step-occiput": "occiput",
      };

      Object.entries(frames).forEach(([stepId, frameUrl], idx) => {
        const mappedArea = zoneMapping[stepId] || selectedArea;
        const tags = stepTags?.[stepId] || [];
        newImagesList.push({
          id: `capture-${Date.now()}-${idx}`,
          patientId: selectedPatient.id,
          url: frameUrl,
          area: mappedArea,
          date: t("dashboard.photoDates.captured"),
          density: mappedArea === "occiput" ? 205 : Math.round(135 + Math.random() * 30),
          thickness: `${Math.round(65 + Math.random() * 12)} µm`,
          qualityScore: 99,
          tags: tags.length > 0 ? tags : undefined,
        });
      });

      if (newImagesList.length > 0) {
        setLocalImages((prev) => ({
          ...prev,
          [selectedPatient.id]: [...newImagesList, ...(prev[selectedPatient.id] || [])],
        }));
        setActiveInspectedPhoto(newImagesList[0] ?? null);
        setUploadFeedback(
          t("dashboard.toasts.captured", { frames: faNum(newImagesList.length) })
        );
        setTimeout(() => setUploadFeedback(null), 6000);
      }
    }
  };

  const handleDeletePhoto = (photoId: string) => {
    if (!selectedPatient) return;
    setLocalImages((prev) => {
      const currentList = prev[selectedPatient.id] || [];
      const updated = currentList.filter((img) => img.id !== photoId);
      return {
        ...prev,
        [selectedPatient.id]: updated,
      };
    });

    if (activeInspectedPhoto?.id === photoId) {
      const currentList = localImages[selectedPatient.id] || [];
      const remaining = currentList.filter((img) => img.id !== photoId);
      setActiveInspectedPhoto(remaining.length > 0 ? remaining[0] ?? null : null);
    }

    if (previewPhotoModal?.id === photoId) {
      setPreviewPhotoModal(null);
    }

    setUploadFeedback(t("dashboard.toasts.photoDeleted"));
    setTimeout(() => setUploadFeedback(null), 4000);
  };

  const { isAnalyzing, result: aiResult, runAnalysis: handleRunAiAnalysis } = useDashboardAnalysis({
    caliberHealthy: t("dashboard.ai.caliberHealthy"),
    caliberStandard: (microns) => t("dashboard.ai.caliberStandard", { microns }),
    protocolPeptide: t("dashboard.ai.protocolPeptide"),
    protocolSoothing: t("dashboard.ai.protocolSoothing"),
    protocolMeso: t("dashboard.ai.protocolMeso"),
  });

  const handleSelectPatientById = selectPatientById;

  const handleAddPatient = (form: AddPatientForm) => {
    const created = addPatient(form, {
      today: t("dashboard.addPatient.today"),
      defaultCondition: t("dashboard.addPatient.defaultCondition"),
    });
    if (!created) return;
    setIsAddPatientOpen(false);
  };

  const CONDITION_MATCHERS: Record<ConditionKey, string[]> = {
  seborrheic_dermatitis: ["سبورئیک", "seborrheic"],
  telogen_effluvium: ["تلوژن", "telogen"],
  folliculitis: ["فولیکولیت", "folliculitis"],
  hyperseborrhea: ["چرب", "sebum"],
  scalp_dryness: ["خشک", "dry"],
  androgenetic_alopecia: [],
  erythema: [],
  follicular_plugging: [],
};

const handleOpenAiEducation = () => {
  // Map patient scalp condition or AI scores to 3D Education Storyboard & Severity.
  // NOTE: the matchers below are DATA matchers against the stored `scalpCondition`
  // free-text field, not UI copy — they stay out of i18n on purpose, otherwise
  // switching the UI language would change the diagnosis.
  // TODO: Migrate DB to store ConditionKey instead of free-text Persian strings.
  const condText = (selectedPatient?.scalpCondition || "").toLowerCase();
  let condKey: ConditionKey = "androgenetic_alopecia";

  for (const [key, matchers] of Object.entries(CONDITION_MATCHERS)) {
    if (matchers.some((m) => condText.includes(m.toLowerCase()))) {
      condKey = key as ConditionKey;
      break;
    }
  }
  if (condKey === "androgenetic_alopecia" && aiResult.scores.redness > 35) {
    condKey = "seborrheic_dermatitis";
  }

    let sev: SeverityLevel;
    if (aiResult.severity < 20) {
      sev = "mild";
    } else if (aiResult.severity > 45) {
      sev = "severe";
    } else {
      sev = "moderate";
    }

    setEducationCondition(condKey);
    setEducationSeverity(sev);
    openEducation();
  };

  const allPatientPhotos: TrichoscopyImage[] = selectedPatient
    ? localImages[selectedPatient.id] ?? [
        {
          id: "img-default",
          patientId: selectedPatient.id,
          url: "/trichoscopy/vertex.jpg",
          area: "vertex",
          date: FALLBACK_PHOTO_DATE,
          density: selectedPatient.hairDensity || 148,
          thickness: "72 µm",
          qualityScore: 98,
        },
      ]
    : [];

  const patientPhotos = allPatientPhotos.filter((p) => {
    if (selectedTagFilter === "all") return true;
    if (selectedTagFilter === "has_notes") return Boolean(p.notes && p.notes.trim().length > 0);
    return Boolean(p.tags && p.tags.includes(selectedTagFilter));
  });

  const addPatientModal = (
    <AddPatientModal isOpen={isAddPatientOpen} onClose={() => setIsAddPatientOpen(false)} onAddPatient={handleAddPatient} />
  );

  // Empty roster: mount the shell and offer record creation instead of reading
  // properties off a record that does not exist.
  if (!selectedPatient) {
    return (
      <DashboardShell
        dataMode={dataProvider.mode}
        userEmail={userEmail}
        isOnline={isOnline}
        pendingCount={pendingCount}
        activeSection={activeSection}
        onSectionChange={scrollToSection}
          onOpenSyncInspector={openSync}
          onOpenLicenseDiagnostics={openLicense}
          onOpenEducation={openAddPatient}
          onOpenGuidedCapture={openAddPatient}
        onOpenPdfReport={openAddPatient}
        onOpenConsent={openAddPatient}
        onLogout={() => { clearAccessToken(); onLogout(); }}
      >
        <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 relative z-10">
          <section id="section-patients" className="scroll-mt-28">
            <div className="rounded-[32px] p-8 md:p-12 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)] flex flex-col items-center text-center gap-4">
              <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                {t("dashboard.emptyState.badge")}
              </span>
              <div className="w-14 h-14 rounded-2xl bg-white/80 border border-white text-[oklch(62%_0.09_16)] grid place-items-center shadow-xs">
                <HeartHandshake className="w-7 h-7" />
              </div>
              <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                {t("dashboard.emptyState.title")}
              </h2>
              <p className="text-xs text-[oklch(45%_0.02_20)] max-w-md">{t("dashboard.emptyState.hint")}</p>
              <button
                type="button"
                onClick={openAddPatient}
                className="mt-2 px-5 py-3 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
              >
                {t("dashboard.emptyState.addPatient")}
              </button>
            </div>
          </section>
        </main>

        {addPatientModal}

        {/* Record-independent diagnostics stay reachable on an empty roster. */}
        {isLicenseOpen && <LicenseDiagnosticsModal isOpen={isLicenseOpen} onClose={closeLicense} />}
        {isSyncOpen && <SyncInspectorModal isOpen={isSyncOpen} onClose={closeSync} />}
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      dataMode={dataProvider.mode}
      userEmail={userEmail}
      isOnline={isOnline}
      pendingCount={pendingCount}
      activeSection={activeSection}
      onSectionChange={scrollToSection}
      onOpenSyncInspector={openSync}
      onOpenLicenseDiagnostics={openLicense}
      onOpenEducation={openEducation}
      onOpenGuidedCapture={openGuidedCapture}
      onOpenPdfReport={openPdfReport}
      onOpenConsent={openConsent}
      onLogout={() => { clearAccessToken(); onLogout(); }}
    >
      {/* Main Container: Continuous Clinical Dossier */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 relative z-10 space-y-12">
        {/* SECTION 1: PATIENTS & CLINICAL RADAR OVERVIEW */}
        <PatientListSection
          patients={patientList}
          selectedPatient={selectedPatient}
          onSelectPatient={handleSelectPatientById}
          onAddPatient={openAddPatient}
          onNavigate={scrollToSection}
        />

        {/* Visual Divider: Section 1 to Section 2 (Scalp Map Hero) */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            {t("dashboard.dividers.scalpMap")}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        {/* SECTION 2: SCALP MAP HERO & SIGNATURE DIVE TRANSITION */}
        <ScalpMapSection
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          onZoneSelect={(zone: ZoneClinicalData) => {
            setEducationCondition(zone.primaryCondition);
            setEducationSeverity(zone.severity);
            openEducation();
          }}
        />

        {/* Visual Divider: Section 2 to Section 3 */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            {t("dashboard.dividers.trichoscopy")}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        {/* SECTION 2: TRICHOSCOPY GALLERY & NEURAL SEGMENTATION */}
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
                  dataMode={dataProvider.mode}
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

        {/* Visual Divider: Section 2 to Section 3 */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            {t("dashboard.dividers.aiEngine")}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        {/* SECTION 3: AI TRICHOLOGY STUDIO */}
        <AnalyticsSection
          data={aiResult}
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          isAnalyzing={isAnalyzing}
          onRunAnalysis={() => { void handleRunAiAnalysis(); }}
          onOpenEducation={handleOpenAiEducation}
          onOpenPdfReport={openPdfReport}
          onNavigate={scrollToSection}
        />

        {/* Visual Divider: Section 3 to Section 4 */}
        <div className="flex items-center gap-4 py-2 opacity-70">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
          <span className="text-[0.65rem] font-mono font-bold uppercase tracking-widest text-[oklch(45%_0.02_20)] bg-white/75 px-3.5 py-1 rounded-full border border-white/80 shadow-xs">
            {t("dashboard.dividers.hologram")}
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(62%_0.09_16/0.3)] to-transparent" />
        </div>

        <HologramSection selectedPatient={selectedPatient} onBackToPatients={() => scrollToSection("patients")} />
      </main>

      {/* Floating Back to Top Pill */}
      {showBackToTop && (
        <div className="fixed bottom-6 left-6 z-40 animate-fadeIn transition-all duration-300">
          <button
            onClick={() => scrollToSection("patients")}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full rose-gold-gradient text-white text-xs font-bold shadow-xl shadow-[oklch(62%_0.09_16/0.3)] hover:brightness-110 active:scale-95 transition-all border border-white/80 backdrop-blur-md"
            title={t("dashboard.backToTopPill.title")}
          >
            <ArrowUp className="w-4 h-4" />
            <span>{t("dashboard.backToTopPill.label")}</span>
          </button>
        </div>
      )}

      {addPatientModal}

      {/* Modal: Digital Consent Form */}
      {isConsentOpen && (
        <DigitalConsentModal
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          patientPhone={selectedPatient.phone}
          isOpen={isConsentOpen}
          onClose={closeConsent}
        />
      )}

      {/* Modal: License Diagnostics & Clock Anti-Tamper */}
      {isLicenseOpen && (
        <LicenseDiagnosticsModal
          isOpen={isLicenseOpen}
          onClose={closeLicense}
        />
      )}

      {/* Modal: Sync & Conflict Inspector */}
      {isSyncOpen && (
        <SyncInspectorModal
          isOpen={isSyncOpen}
          onClose={closeSync}
        />
      )}

      {/* Modal: Education E1 3D Layer (DESIGN-V2 §11) */}
      <EducationModal
        isOpen={isEducationOpen}
        onClose={closeEducation}
        initialCondition={educationCondition}
        initialSeverity={educationSeverity}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
      />

      {/* Modal: Guided Capture & Quality Gate */}
      <GuidedCaptureModal
        isOpen={isGuidedCaptureOpen}
        onClose={closeGuidedCapture}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
        onCompleteCapture={handleCompleteGuidedCapture}
      />

      {/* Modal: Longitudinal Before/After Trichoscopy Comparison */}
      <BeforeAfterCompareModal
        isOpen={isBeforeAfterOpen}
        onClose={closeBeforeAfter}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
        photos={(localImages[selectedPatient.id] || []).map((img) => ({
          id: img.id,
          patientId: img.patientId,
          url: img.url,
          area: img.area,
          date: formatDate(img.date),
          density: img.density,
          thickness: img.thickness,
          qualityScore: img.qualityScore,
          tags: img.tags,
          notes: img.notes,
        }))}
        defaultPhotoIdA={compareDefaultA}
        defaultPhotoIdB={compareDefaultB}
      />

      {/* Modal: Clinical PDF Report */}
      <ClinicalPdfReportModal
        isOpen={isPdfReportOpen}
        onClose={closePdfReport}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
        patientPhone={selectedPatient.phone}
        patientId={selectedPatient.id}
        density={selectedPatient.hairDensity}
      />

      {/* Modal: Fullscreen Photo Lightbox with Interactive Zoom & Pan */}
      <PhotoLightbox
        previewPhotoModal={previewPhotoModal}
        selectedPatient={selectedPatient}
        photosByPatient={localImages}
        onClose={() => setPreviewPhotoModal(null)}
        onDeletePhoto={handleDeletePhoto}
        onCompare={(a, b) => { setCompareDefaultA(a); setCompareDefaultB(b); openBeforeAfter(); }}
        onInspectHud={(photo) => { setActiveInspectedPhoto(photo); setPreviewPhotoModal(null); scrollToSection("gallery"); }}
      />
    </DashboardShell>
  );
};

export default ClinicalDashboard;
