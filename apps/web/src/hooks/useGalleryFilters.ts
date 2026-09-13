import { useState } from "react";
import type { TrichoscopyImage } from "../data/dashboard-types";
const FALLBACK_PHOTO_DATE = "2024-08-31";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
export function useGalleryFilters({ selectedPatient, localImages }: any) {
  const [selectedArea, setSelectedArea] = useState<TrichoscopyImage["area"]>("vertex");
  const [selectedTagFilter, _setSelectedTagFilter] = useState<string>("all");
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

  return { selectedArea, setSelectedArea, selectedTagFilter, patientPhotos };
}
