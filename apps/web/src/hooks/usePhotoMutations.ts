import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { TrichoscopyImage } from "../data/dashboard-types";

interface PhotoMutationInput {
  selectedPatient: { id: string } | null;
  selectedArea: TrichoscopyImage["area"];
  localImages: Record<string, TrichoscopyImage[]>;
  activeInspectedPhoto: TrichoscopyImage | null;
  previewPhotoModal: TrichoscopyImage | null;
  setLocalImages: Dispatch<SetStateAction<Record<string, TrichoscopyImage[]>>>;
  setActiveInspectedPhoto: (photo: TrichoscopyImage | null) => void;
  setPreviewPhotoModal: (photo: TrichoscopyImage | null) => void;
  setUploadFeedback: (message: string | null) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  faNum: (value: string | number | null | undefined) => string;
}

export function usePhotoMutations({
  selectedPatient,
  selectedArea,
  localImages,
  activeInspectedPhoto,
  previewPhotoModal,
  setLocalImages,
  setActiveInspectedPhoto,
  setPreviewPhotoModal,
  setUploadFeedback,
  t,
  faNum,
}: PhotoMutationInput) {
  const feedbackTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
  }, []);
  const showFeedback = useCallback((message: string, duration: number) => {
    setUploadFeedback(message);
    if (feedbackTimer.current !== null) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => {
      setUploadFeedback(null);
      feedbackTimer.current = null;
    }, duration);
  }, [setUploadFeedback]);

  const handleCompleteGuidedCapture = useCallback((capturedCount: number, frames?: Record<string, string>, stepTags?: Record<string, string[]>) => {
    if (!selectedPatient || !frames || Object.keys(frames).length === 0) return;
    const zoneMapping: Record<string, TrichoscopyImage["area"]> = {
      "step-frontal": "frontal",
      "step-vertex": "vertex",
      "step-temporal": "temple",
      "step-occiput": "occiput",
    };
    const newImagesList = Object.entries(frames).map(([stepId, frameUrl], index): TrichoscopyImage => {
      const area = zoneMapping[stepId] || selectedArea;
      const tags = stepTags?.[stepId] || [];
      return {
        id: `capture-${Date.now()}-${index}`,
        patientId: selectedPatient.id,
        url: frameUrl,
        area,
        date: t("dashboard.photoDates.captured"),
        density: area === "occiput" ? 205 : Math.round(135 + Math.random() * 30),
        thickness: `${Math.round(65 + Math.random() * 12)} µm`,
        qualityScore: 99,
        tags: tags.length > 0 ? tags : undefined,
      };
    });
    setLocalImages((previous) => ({ ...previous, [selectedPatient.id]: [...newImagesList, ...(previous[selectedPatient.id] || [])] }));
    setActiveInspectedPhoto(newImagesList[0] ?? null);
    showFeedback(t("dashboard.toasts.captured", { frames: faNum(newImagesList.length || capturedCount) }), 6000);
  }, [faNum, selectedArea, selectedPatient, setActiveInspectedPhoto, setLocalImages, showFeedback, t]);

  const handleDeletePhoto = useCallback((photoId: string) => {
    if (!selectedPatient) return;
    const currentList = localImages[selectedPatient.id] || [];
    const remaining = currentList.filter((image) => image.id !== photoId);
    setLocalImages((previous) => ({ ...previous, [selectedPatient.id]: (previous[selectedPatient.id] || []).filter((image) => image.id !== photoId) }));
    if (activeInspectedPhoto?.id === photoId) setActiveInspectedPhoto(remaining[0] ?? null);
    if (previewPhotoModal?.id === photoId) setPreviewPhotoModal(null);
    showFeedback(t("dashboard.toasts.photoDeleted"), 4000);
  }, [activeInspectedPhoto?.id, localImages, previewPhotoModal?.id, selectedPatient, setActiveInspectedPhoto, setLocalImages, setPreviewPhotoModal, showFeedback, t]);

  return { handleCompleteGuidedCapture, handleDeletePhoto };
}
