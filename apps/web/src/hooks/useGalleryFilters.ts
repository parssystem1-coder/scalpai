import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { Patient, TrichoscopyImage } from "../data/dashboard-types";

const FALLBACK_PHOTO_DATE = "2024-08-31";

interface GalleryFilterInput {
  selectedPatient: Patient | null;
  localImages: Record<string, TrichoscopyImage[]>;
}

export interface GalleryFiltersState {
  selectedArea: TrichoscopyImage["area"];
  setSelectedArea: Dispatch<SetStateAction<TrichoscopyImage["area"]>>;
  selectedTagFilter: string;
  setSelectedTagFilter: Dispatch<SetStateAction<string>>;
  patientPhotos: TrichoscopyImage[];
}

export function useGalleryFilters({ selectedPatient, localImages }: GalleryFilterInput): GalleryFiltersState {
  const [selectedArea, setSelectedArea] = useState<TrichoscopyImage["area"]>("vertex");
  const [selectedTagFilter, setSelectedTagFilter] = useState("all");

  const patientPhotos = useMemo(() => {
    const allPatientPhotos = selectedPatient
      ? localImages[selectedPatient.id] ?? [{
          id: "img-default",
          patientId: selectedPatient.id,
          url: "/trichoscopy/vertex.jpg",
          area: "vertex" as const,
          date: FALLBACK_PHOTO_DATE,
          density: selectedPatient.hairDensity || 148,
          thickness: "72 µm",
          qualityScore: 98,
        }]
      : [];

    if (selectedTagFilter === "all") return allPatientPhotos;
    if (selectedTagFilter === "has_notes") {
      return allPatientPhotos.filter((photo) => Boolean(photo.notes?.trim()));
    }
    return allPatientPhotos.filter((photo) => photo.tags?.includes(selectedTagFilter));
  }, [localImages, selectedPatient, selectedTagFilter]);

  return { selectedArea, setSelectedArea, selectedTagFilter, setSelectedTagFilter, patientPhotos };
}
