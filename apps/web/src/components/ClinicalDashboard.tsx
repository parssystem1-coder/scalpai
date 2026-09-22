import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp } from "lucide-react";
import { clearAccessToken } from "../api/client";
import { useSync } from "../offline/SyncProvider";
import DigitalConsentModal from "./modals/DigitalConsentModal.js";
import LicenseDiagnosticsModal from "./modals/LicenseDiagnosticsModal.js";
import SyncInspectorModal from "./modals/SyncInspectorModal.js";
import type { ZoneClinicalData } from "./ScalpMap";
import EducationModal from "./modals/EducationModal.js";
import GuidedCaptureModal from "./modals/GuidedCaptureModal.js";
import ClinicalPdfReportModal from "./modals/ClinicalPdfReportModal.js";
import BeforeAfterCompareModal from "./modals/BeforeAfterCompareModal.js";
import type { ConditionKey, SeverityLevel } from "@scalpai/education";
import type { TrichoscopyImage } from "../data/dashboard-types";
import PhotoLightbox from "./modals/PhotoLightbox";
import AddPatientModal, { type AddPatientForm } from "./modals/AddPatientModal";
import HologramSection from "./sections/HologramSection";
import { createEmptyDashboardDataProvider } from "../data/dashboard-data-provider";
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
import TrichoscopyGallerySection from "./sections/TrichoscopyGallerySection";
import EmptyRosterSection from "./sections/EmptyRosterSection";
import SectionDivider from "./sections/SectionDivider";
import { useImageUpload } from "../hooks/useImageUpload";
import { usePhotoMutations } from "../hooks/usePhotoMutations";
import { useConditionMapping } from "../hooks/useConditionMapping";
import { useGalleryFilters } from "../hooks/useGalleryFilters";
export { SECTIONS };
export type { SectionId };

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
  const areaLabel = (area: string): string =>
    t(`dashboard.galleryVision.areas.${area}`, { defaultValue: area });

  const { activeSection, showBackToTop, scrollToSection } = useDashboardNavigation();
  const { bus } = useDashboardEventBus();

  const {
    isConsentOpen,
    isLicenseOpen,
    isSyncOpen,
    isEducationOpen,
    isGuidedCaptureOpen,
    isPdfReportOpen,
    isBeforeAfterOpen,
    isAddPatientOpen,
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
    openAddPatient,
    closeAddPatient,
  } = useDashboardModals(bus);

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
  const [activeInspectedPhoto, setActiveInspectedPhoto] = useState<TrichoscopyImage | null>(null);
  const [previewPhotoModal, setPreviewPhotoModal] = useState<TrichoscopyImage | null>(null);

  const handleOpenLightbox = (photo: TrichoscopyImage) => setPreviewPhotoModal(photo);
  const { selectedArea, setSelectedArea, patientPhotos } = useGalleryFilters({ selectedPatient, localImages });
  const { fileInputRef, uploadFeedback, setUploadFeedback, isDraggingOver, handleFileInputChange, handleDrop, handleDragOver, handleDragLeave } = useImageUpload({ selectedPatient, selectedArea, setLocalImages, setActiveInspectedPhoto, t });

  const { result: aiResult, runAnalysis: handleRunAiAnalysis } = useDashboardAnalysis({
    protocolSoothing: t("dashboard.ai.protocolSoothing"),
    protocolMeso: t("dashboard.ai.protocolMeso"),
  });

  const { handleCompleteGuidedCapture, handleDeletePhoto } = usePhotoMutations({ selectedPatient, selectedArea, localImages, activeInspectedPhoto, previewPhotoModal, setLocalImages, setActiveInspectedPhoto, setPreviewPhotoModal, setUploadFeedback, t, faNum });
  const { handleOpenAiEducation } = useConditionMapping({ selectedPatient, aiResult, setEducationCondition, setEducationSeverity, openEducation });

  const handleSelectPatientById = selectPatientById;

  const handleAddPatient = (form: AddPatientForm) => {
    const created = addPatient(form, {
      today: t("dashboard.addPatient.today"),
      defaultCondition: t("dashboard.addPatient.defaultCondition"),
    });
    if (!created) return;
    closeAddPatient();
  };

  const addPatientModal = (
    <AddPatientModal isOpen={isAddPatientOpen} onClose={closeAddPatient} onAddPatient={handleAddPatient} />
  );

  if (!selectedPatient) {
    return (
      <EmptyRosterSection dataProvider={dataProvider} userEmail={userEmail} isOnline={isOnline} pendingCount={pendingCount} activeSection={activeSection} scrollToSection={scrollToSection} openSync={openSync} openLicense={openLicense} openAddPatient={openAddPatient} onLogout={() => { clearAccessToken(); onLogout(); }} t={t} addPatientModal={addPatientModal} isLicenseOpen={isLicenseOpen} closeLicense={closeLicense} isSyncOpen={isSyncOpen} closeSync={closeSync} />
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
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 relative z-10 space-y-12">
        <PatientListSection
          patients={patientList}
          selectedPatient={selectedPatient}
          onSelectPatient={handleSelectPatientById}
          onAddPatient={openAddPatient}
          onNavigate={scrollToSection}
        />

        <SectionDivider label={t("dashboard.dividers.patients")} />

        <ScalpMapSection
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          onZoneSelect={(zone: ZoneClinicalData) => {
            setEducationCondition(zone.primaryCondition);
            setEducationSeverity(zone.severity);
            openEducation();
          }}
        />

        <SectionDivider label={t("dashboard.dividers.scalpMap")} />

        <TrichoscopyGallerySection
          selectedArea={selectedArea} setSelectedArea={setSelectedArea} activeInspectedPhoto={activeInspectedPhoto}
          setActiveInspectedPhoto={setActiveInspectedPhoto} patientPhotos={patientPhotos} uploadFeedback={uploadFeedback}
          setUploadFeedback={setUploadFeedback} isDraggingOver={isDraggingOver} dataMode={dataProvider.mode} fileInputRef={fileInputRef}
          handleDrop={handleDrop} handleDragOver={handleDragOver} handleDragLeave={handleDragLeave} handleFileInputChange={handleFileInputChange}
          handleDeletePhoto={handleDeletePhoto} handleOpenLightbox={handleOpenLightbox} openGuidedCapture={openGuidedCapture}
          openBeforeAfter={openBeforeAfter} setCompareDefaultA={setCompareDefaultA} setCompareDefaultB={setCompareDefaultB}
          localImages={localImages} scrollToSection={scrollToSection} areaLabel={areaLabel} selectedPatient={selectedPatient}
        />
        <AnalyticsSection
          data={aiResult}
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          onRunAnalysis={() => {
            const analysed = activeInspectedPhoto ?? patientPhotos[0] ?? null;
            void handleRunAiAnalysis(
              analysed
                ? { url: analysed.url, galleryItemId: analysed.id }
                : undefined,
            );
          }}
          onOpenEducation={handleOpenAiEducation}
          onOpenPdfReport={openPdfReport}
          onNavigate={scrollToSection}
        />

        <SectionDivider label={t("dashboard.dividers.trichoscopy")} />

        <HologramSection selectedPatient={selectedPatient} onBackToPatients={() => scrollToSection("patients")} />
      </main>

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

      {isConsentOpen && (
        <DigitalConsentModal
          patientId={selectedPatient.id}
          patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
          patientPhone={selectedPatient.phone}
          isOpen={isConsentOpen}
          onClose={closeConsent}
        />
      )}

      {isLicenseOpen && (
        <LicenseDiagnosticsModal
          isOpen={isLicenseOpen}
          onClose={closeLicense}
        />
      )}

      {isSyncOpen && (
        <SyncInspectorModal
          isOpen={isSyncOpen}
          onClose={closeSync}
        />
      )}

      <EducationModal
        isOpen={isEducationOpen}
        onClose={closeEducation}
        initialCondition={educationCondition}
        initialSeverity={educationSeverity}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
      />

      <GuidedCaptureModal
        isOpen={isGuidedCaptureOpen}
        onClose={closeGuidedCapture}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
        onCompleteCapture={handleCompleteGuidedCapture}
      />

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

      <ClinicalPdfReportModal
        isOpen={isPdfReportOpen}
        onClose={closePdfReport}
        patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
        patientPhone={selectedPatient.phone}
        patientId={selectedPatient.id}
        density={selectedPatient.hairDensity}
      />

      <PhotoLightbox
        previewPhotoModal={previewPhotoModal}
        selectedPatient={selectedPatient}
        photosByPatient={localImages}
        onClose={() => setPreviewPhotoModal(null)}
        onDeletePhoto={handleDeletePhoto}
        onCompare={(a, b) => { setCompareDefaultA(a); setCompareDefaultB(b); openBeforeAfter(); }}
        onInspectHud={(photo) => { setActiveInspectedPhoto(photo); setPreviewPhotoModal(null); scrollToSection("gallery"); }}
        areaLabel={areaLabel}
      />
    </DashboardShell>
  );
};

export default ClinicalDashboard;
