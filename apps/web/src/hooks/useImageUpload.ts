import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { uploadChunked } from "../offline/chunked-upload.js";
import type { TrichoscopyImage } from "../data/dashboard-types";

interface ImageUploadInput {
  selectedPatient: { id: string } | null;
  selectedArea: TrichoscopyImage["area"];
  setLocalImages: Dispatch<SetStateAction<Record<string, TrichoscopyImage[]>>>;
  setActiveInspectedPhoto: (photo: TrichoscopyImage) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/**
 * Dashboard upload path (P4-B01/B02 / F10 remediation — Wave 2).
 *
 * The old hook base64-encoded the file into a data URL held in React state —
 * the upload never left the browser — and stamped fake density/thickness/99%
 * quality onto the record. It now goes through the SAME resumable pipeline the
 * patient gallery uses (presign → PUT → confirm; ADR-0041), and the local
 * record carries only what is true before the server replies: identity, area
 * and a pending marker. Metrics appear after real analysis, never invented.
 */
export function useImageUpload({ selectedPatient, selectedArea, setLocalImages, setActiveInspectedPhoto, t }: ImageUploadInput) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackTimer = useRef<number | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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

    // Placeholder row: truthful fields only. The URL is the object URL of the
    // local file (viewable now); the server id arrives with the query
    // invalidation after the upload completes.
    const pendingId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(file);
    const pendingImg: TrichoscopyImage = {
      id: pendingId,
      patientId: selectedPatient.id,
      url: localUrl,
      area: selectedArea,
      date: t("dashboard.photoDates.uploaded"),
      // Metrics are absent, not zero: they arrive only from a real analysis.
      notes: "pending-upload",
    };
    setLocalImages((prev) => ({ ...prev, [selectedPatient.id]: [pendingImg, ...(prev[selectedPatient.id] || [])] }));
    setActiveInspectedPhoto(pendingImg);
    setIsUploading(true);

    void uploadChunked(file, selectedPatient.id)
      .then(() => {
        showFeedback(t("dashboard.toasts.uploaded", { name: file.name }), 6000);
      })
      .catch(() => {
        // Roll the pending row back: an upload that failed must not sit in the
        // gallery looking like data.
        setLocalImages((prev) => ({
          ...prev,
          [selectedPatient.id]: (prev[selectedPatient.id] || []).filter((img) => img.id !== pendingId),
        }));
        showFeedback(t("dashboard.toasts.uploadFailed"), 6000);
      })
      .finally(() => {
        setIsUploading(false);
        URL.revokeObjectURL(localUrl);
      });
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

  return { fileInputRef, uploadFeedback, setUploadFeedback, isDraggingOver, isUploading, handleFileInputChange, handleDrop, handleDragOver, handleDragLeave };
}
