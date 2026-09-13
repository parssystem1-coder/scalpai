import type { Dispatch, SetStateAction } from "react";
import type { TrichoscopyImage } from "../data/dashboard-types";

export function usePhotoMutations({ selectedPatient, selectedArea, localImages, activeInspectedPhoto, previewPhotoModal, setLocalImages, setActiveInspectedPhoto, setPreviewPhotoModal, setUploadFeedback, t, faNum }: { selectedPatient: { id: string } | null; selectedArea: TrichoscopyImage["area"]; localImages: Record<string, TrichoscopyImage[]>; activeInspectedPhoto: TrichoscopyImage | null; previewPhotoModal: TrichoscopyImage | null; setLocalImages: Dispatch<SetStateAction<Record<string, TrichoscopyImage[]>>>; setActiveInspectedPhoto: (photo: TrichoscopyImage | null) => void; setPreviewPhotoModal: (photo: TrichoscopyImage | null) => void; setUploadFeedback: (message: string | null) => void; t: (key: string, options?: Record<string, unknown>) => string; faNum: (value: string | number | null | undefined) => string; }) {
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

  return { handleCompleteGuidedCapture, handleDeletePhoto };
}
