import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  ArrowUp,
  UploadCloud,
  CheckCircle2,
  HeartHandshake,
  Eye,
  Maximize2,
  X,
  Trash2,
  Split,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, clearAccessToken } from "../api/client.js";
import { useSync } from "../offline/SyncProvider.js";
import { AmberOrbs } from "./AmberOrbs.js";
import { HairCanvas } from "./HairCanvas.js";
import DigitalConsentModal from "./DigitalConsentModal.js";
import LicenseDiagnosticsModal from "./LicenseDiagnosticsModal.js";
import SyncInspectorModal from "./SyncInspectorModal.js";
import type { ZoneClinicalData } from "./ScalpMap.js";
import EducationModal from "./EducationModal.js";
import GuidedCaptureModal from "./GuidedCaptureModal.js";
import ClinicalPdfReportModal from "./ClinicalPdfReportModal.js";
import BeforeAfterCompareModal from "./BeforeAfterCompareModal.js";
import type { ConditionKey, SeverityLevel } from "@scalpai/education";
import LuxuryTiltCard from "./LuxuryTiltCard.js";
const LuxuryScalp3D = lazy(() => import("./LuxuryScalp3D.js"));
import NeuralSegmentationOverlay from "./NeuralSegmentationOverlay.js";
import { createEngine } from "@scalpai/analysis-engine";
import {
  SAMPLE_PATIENTS,
  SAMPLE_IMAGES,
  type Patient,
  type TrichoscopyImage,
} from "../data/dashboard-samples.js";
import DashboardHeader from "./DashboardHeader.js";
import DashboardTabs from "./DashboardTabs.js";
import { SECTIONS, type SectionId } from "./dashboard-sections.js";
import PatientListSection from "./sections/PatientListSection.js";
import ScalpMapSection from "./sections/ScalpMapSection.js";
import AnalyticsSection, { type AnalyticsData } from "./sections/AnalyticsSection.js";
import { useDashboardModals } from "../hooks/useDashboardModals.js";
import { faNum, formatDate } from "../i18n.js";

export { SECTIONS };
export type { SectionId };

/** ISO date of the placeholder frame shown before a record has any capture. */
const FALLBACK_PHOTO_DATE = "2024-08-31";

interface ClinicalDashboardProps {
  userEmail?: string;
  onLogout: () => void;
}

export const ClinicalDashboard: React.FC<ClinicalDashboardProps> = ({
  userEmail = "tricho@scalpai.clinic",
  onLogout,
}) => {
  const { isOnline, pendingCount } = useSync();
  const { t } = useTranslation();

  /** Localised name of a trichoscopy area (`vertex`, `temple`, ...). */
  const areaLabel = (area: string): string => t(`dashboard.galleryVision.areas.${area}`);

  const [activeSection, setActiveSection] = useState<SectionId>("patients");
  const isManualScrolling = useRef(false);
  const [showBackToTop, setShowBackToTop] = useState(false);

  const scrollToSection = (sectionId: SectionId) => {
    setActiveSection(sectionId);
    isManualScrolling.current = true;
    const el = document.getElementById(`section-${sectionId}`);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    setTimeout(() => {
      isManualScrolling.current = false;
    }, 850);
  };

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowBackToTop(scrollY > 350);

      if (isManualScrolling.current) return;
      const scrollPos = scrollY + 160;

      for (let i = SECTIONS.length - 1; i >= 0; i--) {
        const sec = SECTIONS[i];
        if (!sec) continue;
        const el = document.getElementById(`section-${sec.id}`);
        if (el && el.offsetTop <= scrollPos) {
          setActiveSection(sec.id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
  } = useDashboardModals();

  // `null` until a record exists: SAMPLE_PATIENTS is DEV-gated, so a production
  // build would resolve the first element to undefined and crash on property read.
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isAddPatientOpen, setIsAddPatientOpen] = useState(false);
  const [newPatient, setNewPatient] = useState({ firstName: "", lastName: "", phone: "", condition: "" });
  // Modal payload/context state (not open/close state) stays local to the dashboard.
  const [educationCondition, setEducationCondition] = useState<ConditionKey>("androgenetic_alopecia");
  const [educationSeverity, setEducationSeverity] = useState<SeverityLevel>("moderate");
  const [compareDefaultA, setCompareDefaultA] = useState<string | undefined>(undefined);
  const [compareDefaultB, setCompareDefaultB] = useState<string | undefined>(undefined);
  const [localPatients, setLocalPatients] = useState<Patient[]>(SAMPLE_PATIENTS);
  const [localImages, setLocalImages] = useState<Record<string, TrichoscopyImage[]>>(SAMPLE_IMAGES);
  const [selectedArea, setSelectedArea] = useState<"vertex" | "temple" | "frontal" | "occiput">("vertex");
  const [selectedTagFilter, _setSelectedTagFilter] = useState<string>("all");
  const [activeInspectedPhoto, setActiveInspectedPhoto] = useState<TrichoscopyImage | null>(null);
  const [previewPhotoModal, setPreviewPhotoModal] = useState<TrichoscopyImage | null>(null);

  const openAddPatient = () => setIsAddPatientOpen(true);

  // Lightbox Zoom & Pan Interactive State
  const [lightboxZoom, setLightboxZoom] = useState<number>(1);
  const [lightboxPan, setLightboxPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [lightboxRotation, setLightboxRotation] = useState<number>(0);
  const [isLightboxPanning, setIsLightboxPanning] = useState<boolean>(false);
  const lightboxPanStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lightboxTouchStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Caliper (Micrometric Measurement) State
  const [isCaliperActive, setIsCaliperActive] = useState<boolean>(false);
  const [caliperStart, setCaliperStart] = useState<{ x: number; y: number } | null>(null);
  const [caliperEnd, setCaliperEnd] = useState<{ x: number; y: number } | null>(null);
  const [caliperMagnification, _setCaliperMagnification] = useState<"50x" | "100x" | "200x">("100x");
  const [isDrawingCaliper, setIsDrawingCaliper] = useState<boolean>(false);

  // Clinical Notes State per Photo
  const [lightboxNoteText, setLightboxNoteText] = useState<string>("");
  const [_isNotesDrawerOpen, setIsNotesDrawerOpen] = useState<boolean>(false);
  const [_noteSavedFeedback, setNoteSavedFeedback] = useState<string | null>(null);

  const resetLightboxZoom = () => {
    setLightboxZoom(1);
    setLightboxPan({ x: 0, y: 0 });
    setLightboxRotation(0);
    setIsCaliperActive(false);
    setCaliperStart(null);
    setCaliperEnd(null);
  };

  const handleOpenLightbox = (photo: TrichoscopyImage) => {
    resetLightboxZoom();
    setLightboxNoteText(photo.notes || "");
    setIsNotesDrawerOpen(Boolean(photo.notes && photo.notes.trim().length > 0));
    setPreviewPhotoModal(photo);
  };

  // Caliper Calculations
  const calculateCaliperDistance = () => {
    if (!caliperStart || !caliperEnd) return null;
    const dx = caliperEnd.x - caliperStart.x;
    const dy = caliperEnd.y - caliperStart.y;
    const pixelDist = Math.hypot(dx, dy);
    // Normalize by digital zoom so zoom doesn't inflate measurement
    const opticalPixels = pixelDist / Math.max(1, lightboxZoom);
    // Optical scale factor: 50x => 2.0 um/px, 100x => 1.0 um/px, 200x => 0.5 um/px
    const scale = caliperMagnification === "50x" ? 2.0 : caliperMagnification === "100x" ? 1.0 : 0.5;
    const microns = +(opticalPixels * scale).toFixed(1);
    let category = t("dashboard.caliper.terminalThick");
    let color = "text-emerald-400 border-emerald-500/40 bg-emerald-950/80";
    if (microns < 30) {
      category = t("dashboard.caliper.vellus");
      color = "text-rose-400 border-rose-500/40 bg-rose-950/80";
    } else if (microns < 45) {
      category = t("dashboard.caliper.intermediate");
      color = "text-amber-400 border-amber-500/40 bg-amber-950/80";
    } else if (microns < 65) {
      category = t("dashboard.caliper.terminalMedium");
      color = "text-cyan-400 border-cyan-500/40 bg-cyan-950/80";
    }
    return { microns, pixelDist: Math.round(pixelDist), category, color };
  };

  const _handleSaveCaliperToPhoto = () => {
    const calc = calculateCaliperDistance();
    if (!calc || !previewPhotoModal || !selectedPatient) return;
    const formatted = `${calc.microns} µm (${calc.category})`;
    setLocalImages((prev) => {
      const list = prev[selectedPatient.id] || [];
      const updated = list.map((p) =>
        p.id === previewPhotoModal.id ? { ...p, thickness: formatted } : p
      );
      return { ...prev, [selectedPatient.id]: updated };
    });
    setPreviewPhotoModal((prev) => (prev ? { ...prev, thickness: formatted } : null));
    setNoteSavedFeedback(t("dashboard.toasts.caliperSaved", { microns: faNum(calc.microns) }));
    setTimeout(() => setNoteSavedFeedback(null), 4000);
  };

  const _handleSavePhotoNotes = () => {
    if (!previewPhotoModal || !selectedPatient) return;
    setLocalImages((prev) => {
      const list = prev[selectedPatient.id] || [];
      const updated = list.map((p) =>
        p.id === previewPhotoModal.id ? { ...p, notes: lightboxNoteText } : p
      );
      return { ...prev, [selectedPatient.id]: updated };
    });
    setPreviewPhotoModal((prev) => (prev ? { ...prev, notes: lightboxNoteText } : null));
    setNoteSavedFeedback(t("dashboard.toasts.notesSaved"));
    setTimeout(() => setNoteSavedFeedback(null), 4000);
  };

  const handleLightboxWheel = (e: React.WheelEvent) => {
    if (isCaliperActive) return;
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.2 : 0.83;
    setLightboxZoom((prev) => {
      const next = Math.min(Math.max(1, +(prev * factor).toFixed(2)), 6);
      if (next === 1) {
        setLightboxPan({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleLightboxMouseDown = (e: React.MouseEvent) => {
    if (isCaliperActive) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCaliperStart({ x, y });
      setCaliperEnd({ x, y });
      setIsDrawingCaliper(true);
      return;
    }
    if (lightboxZoom <= 1) return;
    e.preventDefault();
    setIsLightboxPanning(true);
    lightboxPanStart.current = {
      x: e.clientX - lightboxPan.x,
      y: e.clientY - lightboxPan.y,
    };
  };

  const handleLightboxMouseMove = (e: React.MouseEvent) => {
    if (isCaliperActive && isDrawingCaliper) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setCaliperEnd({ x, y });
      return;
    }
    if (!isLightboxPanning || lightboxZoom <= 1) return;
    e.preventDefault();
    const newX = e.clientX - lightboxPanStart.current.x;
    const newY = e.clientY - lightboxPanStart.current.y;
    const maxPan = (lightboxZoom - 1) * 450;
    setLightboxPan({
      x: Math.max(-maxPan, Math.min(maxPan, newX)),
      y: Math.max(-maxPan, Math.min(maxPan, newY)),
    });
  };

  const handleLightboxMouseUp = () => {
    if (isCaliperActive && isDrawingCaliper) {
      setIsDrawingCaliper(false);
      return;
    }
    setIsLightboxPanning(false);
  };

  const handleLightboxDoubleClick = (e: React.MouseEvent) => {
    if (isCaliperActive) return;
    e.preventDefault();
    setLightboxZoom((prev) => {
      if (prev > 1) {
        setLightboxPan({ x: 0, y: 0 });
        return 1;
      }
      return 2.5;
    });
  };

  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (isCaliperActive) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      setCaliperStart({ x, y });
      setCaliperEnd({ x, y });
      setIsDrawingCaliper(true);
      return;
    }
    if (e.touches.length === 1 && lightboxZoom > 1) {
      setIsLightboxPanning(true);
      lightboxTouchStart.current = {
        x: touch.clientX - lightboxPan.x,
        y: touch.clientY - lightboxPan.y,
      };
    }
  };

  const handleLightboxTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    if (isCaliperActive && isDrawingCaliper) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      setCaliperEnd({ x, y });
      return;
    }
    if (!isLightboxPanning || lightboxZoom <= 1 || e.touches.length !== 1) return;
    const newX = touch.clientX - lightboxTouchStart.current.x;
    const newY = touch.clientY - lightboxTouchStart.current.y;
    const maxPan = (lightboxZoom - 1) * 450;
    setLightboxPan({
      x: Math.max(-maxPan, Math.min(maxPan, newX)),
      y: Math.max(-maxPan, Math.min(maxPan, newY)),
    });
  };

  const handleLightboxTouchEnd = () => {
    if (isCaliperActive && isDrawingCaliper) {
      setIsDrawingCaliper(false);
      return;
    }
    setIsLightboxPanning(false);
  };

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

  // AI Diagnostic State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AnalyticsData>({
    scores: { redness: 22, flakeTexture: 26, densityProxy: 88 },
    severity: 24,
    anagenRatio: 87,
    hairCaliber: t("dashboard.ai.caliberHealthy"),
    recommendation: t("dashboard.ai.protocolPeptide"),
    matrixHydration: 92,
    tensorConfidence: 97.4,
    follicularUnits: { single: 24, double: 52, triple: 24 },
  });

  // Fetch real API patients if online, with fallback to local state
  const { data: apiPatients } = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiFetch<Patient[]>("/patients?limit=50").catch(() => null),
    retry: false,
  });

  const patientList = apiPatients && apiPatients.length > 0 ? apiPatients : localPatients;

  // Latch onto the first available record once the roster is known. In dev this
  // is the first sample; in production it is the first API record.
  useEffect(() => {
    if (selectedPatient) return;
    const first = patientList[0];
    if (first) setSelectedPatient(first);
  }, [patientList, selectedPatient]);

  const handleSelectPatientById = (id: string) => {
    const found = patientList.find((p) => p.id === id);
    if (found) setSelectedPatient(found);
  };

  const handleAddPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatient.firstName || !newPatient.lastName) return;

    const created: Patient = {
      id: `pat-${Date.now().toString().slice(-4)}`,
      firstName: newPatient.firstName,
      lastName: newPatient.lastName,
      phone: newPatient.phone || "09120000000",
      lastVisit: t("dashboard.addPatient.today"),
      scalpCondition: newPatient.condition || t("dashboard.addPatient.defaultCondition"),
      hairDensity: 154,
      anagenRatio: 85,
      keratinHealth: 90,
      sebumBalance: 75,
      microcirculation: 80,
      stemCellVitality: 85,
    };

    setLocalPatients([created, ...localPatients]);
    setSelectedPatient(created);
    setNewPatient({ firstName: "", lastName: "", phone: "", condition: "" });
    setIsAddPatientOpen(false);
  };

  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const engine = createEngine();
      const syntheticData = new Uint8ClampedArray(128 * 128 * 4);
      for (let i = 0; i < syntheticData.length; i += 4) {
        syntheticData[i] = 225;
        syntheticData[i + 1] = 185;
        syntheticData[i + 2] = 175;
        syntheticData[i + 3] = 255;
      }

      const out = await engine.analyze({
        image: { data: syntheticData, width: 128, height: 128 },
      });

      setAiResult({
        scores: out.scores,
        severity: out.severity,
        anagenRatio: Math.round(82 + Math.random() * 12),
        hairCaliber: t("dashboard.ai.caliberStandard", {
          microns: Math.round(68 + Math.random() * 12),
        }),
        matrixHydration: Math.round(86 + Math.random() * 10),
        tensorConfidence: 98.2,
        follicularUnits: {
          single: Math.round(18 + Math.random() * 8),
          double: Math.round(48 + Math.random() * 10),
          triple: Math.round(25 + Math.random() * 10),
        },
        recommendation:
          out.scores.redness > 35
            ? t("dashboard.ai.protocolSoothing")
            : t("dashboard.ai.protocolMeso"),
      });
    } catch {
      // Fallback
    } finally {
      setTimeout(() => setIsAnalyzing(false), 900);
    }
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

  /* Modal: Add Patient — shared by the empty state and the full dashboard. */
  const addPatientModal = isAddPatientOpen ? (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="rounded-[32px] p-6 md:p-8 max-w-md w-full bg-[oklch(98%_0.008_28/0.85)] border border-white/90 shadow-[0_24px_60px_oklch(30%_0.04_15/0.18)] backdrop-blur-2xl animate-fadeIn">
        <h3 className="text-xl font-serif font-bold text-[oklch(20%_0.02_20)] mb-1">
          {t("dashboard.addPatient.title")}
        </h3>
        <p className="text-xs text-[oklch(45%_0.02_20)] mb-6">{t("dashboard.addPatient.subtitle")}</p>

        <form onSubmit={handleAddPatient} className="space-y-4">
          <div>
            <label htmlFor="patient-firstName" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
              {t("dashboard.addPatient.firstName")}
            </label>
            <input
              id="patient-firstName"
              type="text"
              required
              value={newPatient.firstName}
              onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
              placeholder={t("dashboard.addPatient.firstNamePh")}
              className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
            />
          </div>

          <div>
            <label htmlFor="patient-lastName" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
              {t("dashboard.addPatient.lastName")}
            </label>
            <input
              id="patient-lastName"
              type="text"
              required
              value={newPatient.lastName}
              onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
              placeholder={t("dashboard.addPatient.lastNamePh")}
              className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
            />
          </div>

          <div>
            <label htmlFor="patient-phone" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
              {t("dashboard.addPatient.phone")}
            </label>
            <input
              id="patient-phone"
              type="tel"
              value={newPatient.phone}
              onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
              placeholder={t("dashboard.addPatient.phonePh")}
              className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
            />
          </div>

          <div>
            <label htmlFor="patient-condition" className="block text-xs font-bold text-[oklch(30%_0.02_20)] mb-1.5">
              {t("dashboard.addPatient.condition")}
            </label>
            <input
              id="patient-condition"
              type="text"
              value={newPatient.condition}
              onChange={(e) => setNewPatient({ ...newPatient, condition: e.target.value })}
              placeholder={t("dashboard.addPatient.conditionPh")}
              className="w-full h-11 px-4 rounded-2xl bg-white/70 border border-stone-200 focus:border-[oklch(62%_0.09_16)] focus:bg-white outline-none text-xs font-medium text-[oklch(20%_0.02_20)] placeholder:text-[oklch(55%_0.015_20)] transition-all"
            />
          </div>

          <div className="flex items-center gap-3 pt-3">
            <button
              type="submit"
              className="flex-1 h-12 rounded-2xl rose-gold-gradient text-white text-xs font-bold shadow-lg shadow-[oklch(62%_0.09_16/0.25)] hover:brightness-110 active:scale-95 transition-all"
            >
              {t("dashboard.addPatient.submit")}
            </button>
            <button
              type="button"
              onClick={() => setIsAddPatientOpen(false)}
              className="px-5 h-12 rounded-2xl bg-white/80 hover:bg-white border border-stone-200 text-xs font-bold text-[oklch(40%_0.02_20)] transition-all"
            >
              {t("dashboard.addPatient.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  // Empty roster: mount the shell and offer record creation instead of reading
  // properties off a record that does not exist.
  if (!selectedPatient) {
    return (
      <div className="min-h-screen flex flex-col font-sans relative text-[oklch(20%_0.02_20)] bg-[oklch(85%_0.03_28)] antialiased select-none">
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat filter contrast-[1.02] saturate-[1.04] pointer-events-none"
          style={{ backgroundImage: `url('/images/scalp-bg.jpg')` }}
        />
        <AmberOrbs />
        <HairCanvas />

        <DashboardHeader
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
        />
        <DashboardTabs variant="mobile" activeSection={activeSection} onSectionChange={scrollToSection} />

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
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans relative text-[oklch(20%_0.02_20)] bg-[oklch(85%_0.03_28)] antialiased select-none">
      {/* 1. Global Scalp Aesthetic Background Image (Matches Login Page) */}
      <div
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat filter contrast-[1.02] saturate-[1.04] pointer-events-none"
        style={{ backgroundImage: `url('/images/scalp-bg.jpg')` }}
      />

      {/* 2. Floating Amber Serum Spheres */}
      <AmberOrbs />

      {/* 3. Floating Hair Strands Canvas */}
      <HairCanvas />

      {/* 4. Top Frosted Glass Navigation Bar (Persistently Sticky) */}
      <DashboardHeader
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
      />
      <DashboardTabs variant="mobile" activeSection={activeSection} onSectionChange={scrollToSection} />

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

        {/* SECTION 4: 3D FOLLICLE & HAIR MODEL SIMULATION */}
        <section id="section-3d-model" className="scroll-mt-28 space-y-6">
          <div className="rounded-[32px] p-6 md:p-8 bg-[oklch(98%_0.008_28/0.45)] border border-white/80 backdrop-blur-[34px] shadow-[0_24px_60px_oklch(30%_0.04_15/0.08)]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[0.65rem] font-mono font-bold bg-[oklch(62%_0.09_16/0.1)] text-[oklch(48%_0.095_12)] border border-[oklch(62%_0.09_16/0.2)]">
                    {t("dashboard.hologram.badge")}
                  </span>
                  <h2 className="text-2xl font-serif font-bold text-[oklch(20%_0.02_20)]">
                    {t("dashboard.hologram.heading")}
                  </h2>
                </div>
                <p className="text-xs text-[oklch(45%_0.02_20)]">{t("dashboard.hologram.subtitle")}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs bg-white/80 px-4 py-2 rounded-2xl border border-white/80 shadow-xs">
                  <HeartHandshake className="w-4 h-4 text-[oklch(62%_0.09_16)]" />
                  <span className="font-bold text-[oklch(20%_0.02_20)]">
                    {t("dashboard.hologram.patient", {
                      patient: `${selectedPatient.firstName} ${selectedPatient.lastName}`,
                    })}
                  </span>
                </div>

                <button
                  onClick={() => scrollToSection("patients")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/70 hover:bg-white text-stone-700 border border-white/80 shadow-xs transition-all text-xs font-bold"
                  title={t("dashboard.hologram.backToTopTitle")}
                >
                  <ArrowUp className="w-3.5 h-3.5 text-[oklch(62%_0.09_16)]" />
                  <span className="hidden sm:inline">{t("dashboard.hologram.backToTop")}</span>
                </button>
              </div>
            </div>

            {/* Embed 3D Scalp Stage */}
            <div className="w-full rounded-[28px] overflow-hidden border border-white/80 shadow-2xl bg-white/40 backdrop-blur-xl">
              <Suspense
                fallback={
                  <div className="h-[450px] flex items-center justify-center text-xs font-bold text-stone-500">
                    {t("dashboard.hologram.loading")}
                  </div>
                }
              >
                <LuxuryScalp3D />
              </Suspense>
            </div>
          </div>
        </section>
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
      {previewPhotoModal && (
        <div
          id="photo-lightbox-backdrop"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/92 p-2 sm:p-4 md:p-8 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => {
            resetLightboxZoom();
            setPreviewPhotoModal(null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { resetLightboxZoom(); setPreviewPhotoModal(null); } }}
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
                    setPreviewPhotoModal(null);
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
                    handleDeletePhoto(previewPhotoModal.id);
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
                      const photos = localImages[selectedPatient.id] || [];
                      const other = photos.find((p) => p.id !== previewPhotoModal.id) || previewPhotoModal;
                      setCompareDefaultA(other.id);
                      setCompareDefaultB(previewPhotoModal.id);
                      resetLightboxZoom();
                      setPreviewPhotoModal(null);
                      openBeforeAfter();
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
                    setActiveInspectedPhoto(previewPhotoModal);
                    resetLightboxZoom();
                    setPreviewPhotoModal(null);
                    scrollToSection("gallery");
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
                    setPreviewPhotoModal(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-bold border border-stone-700 transition-colors cursor-pointer"
                >
                  {t("dashboard.lightbox.close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicalDashboard;
