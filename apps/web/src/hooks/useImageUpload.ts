import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent, type SetStateAction } from "react";
import type { TrichoscopyImage } from "../data/dashboard-types";

interface ImageUploadInput {
  selectedPatient: { id: string } | null;
  selectedArea: TrichoscopyImage["area"];
  setLocalImages: Dispatch<SetStateAction<Record<string, TrichoscopyImage[]>>>;
  setActiveInspectedPhoto: (photo: TrichoscopyImage) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useImageUpload({ selectedPatient, selectedArea, setLocalImages, setActiveInspectedPhoto, t }: ImageUploadInput) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

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
  }, []);

  const processUploadedImageFile = useCallback((file: File) => {
    if (!selectedPatient) return;
    if (!file.type.startsWith("image/")) {
      showFeedback(t("dashboard.toasts.invalidImage"), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (typeof dataUrl !== "string" || !dataUrl) return;
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
      setLocalImages((prev) => ({ ...prev, [selectedPatient.id]: [newImg, ...(prev[selectedPatient.id] || [])] }));
      setActiveInspectedPhoto(newImg);
      showFeedback(t("dashboard.toasts.uploaded", { name: file.name }), 6000);
    };
    reader.readAsDataURL(file);
  }, [selectedArea, selectedPatient, setActiveInspectedPhoto, setLocalImages, showFeedback, t]);

  const handleFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processUploadedImageFile(file);
    event.target.value = "";
  }, [processUploadedImageFile]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) processUploadedImageFile(file);
  }, [processUploadedImageFile]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
  }, []);

  return { fileInputRef, uploadFeedback, setUploadFeedback, isDraggingOver, handleFileInputChange, handleDrop, handleDragOver, handleDragLeave };
}
