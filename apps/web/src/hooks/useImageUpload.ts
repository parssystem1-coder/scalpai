import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { TrichoscopyImage } from "../data/dashboard-types";

export function useImageUpload({ selectedPatient, selectedArea, setLocalImages, setActiveInspectedPhoto, t }: { selectedPatient: { id: string } | null; selectedArea: TrichoscopyImage["area"]; setLocalImages: Dispatch<SetStateAction<Record<string, TrichoscopyImage[]>>>; setActiveInspectedPhoto: (photo: TrichoscopyImage) => void; t: (key: string, options?: Record<string, unknown>) => string; }) {
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

  return { fileInputRef, uploadFeedback, setUploadFeedback, isDraggingOver, handleFileInputChange, handleDrop, handleDragOver, handleDragLeave };
}
