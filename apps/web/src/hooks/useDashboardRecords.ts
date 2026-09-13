import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api/client";
import type { Patient, TrichoscopyImage } from "../data/dashboard-types";
import type { DashboardDataProvider } from "../data/dashboard-data-types";
import { dashboardEventBus, type DashboardEventBus } from "../state/dashboard-event-bus";

export interface NewPatientInput {
  firstName: string;
  lastName: string;
  phone: string;
  condition: string;
}

export interface DashboardRecordsState {
  patients: Patient[];
  images: Record<string, TrichoscopyImage[]>;
  patientList: Patient[];
  selectedPatient: Patient | null;
  selectPatientById: (id: string) => void;
  addPatient: (input: NewPatientInput, labels: { today: string; defaultCondition: string }) => Patient | null;
  setSelectedPatient: (patient: Patient | null) => void;
  setImages: Dispatch<SetStateAction<Record<string, TrichoscopyImage[]>>>;
}

function snapshotImages(provider: DashboardDataProvider): Record<string, TrichoscopyImage[]> {
  return Object.fromEntries(
    Object.entries(provider.getImages()).map(([patientId, images]) => [patientId, [...images]]),
  );
}

/** Owns the real-provider-first roster pipeline and local record mutations. */
export function useDashboardRecords(
  provider: DashboardDataProvider,
  bus: DashboardEventBus = dashboardEventBus,
): DashboardRecordsState {
  const [patients, setPatients] = useState<Patient[]>(() => [...provider.getPatients()]);
  const [images, setImages] = useState<Record<string, TrichoscopyImage[]>>(() => snapshotImages(provider));
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const { data: apiPatients } = useQuery({
    queryKey: ["patients"],
    queryFn: () => apiFetch<Patient[]>("/patients?limit=50").catch(() => null),
    retry: false,
  });
  const patientList = useMemo(() => {
    if (!apiPatients || apiPatients.length === 0) return patients;
    const merged = new Map(apiPatients.map((patient) => [patient.id, patient]));
    for (const patient of patients) {
      if (!merged.has(patient.id)) merged.set(patient.id, patient);
    }
    return [...merged.values()];
  }, [apiPatients, patients]);
  const patientListRef = useRef(patientList);
  const selectedPatientRef = useRef(selectedPatient);
  patientListRef.current = patientList;
  selectedPatientRef.current = selectedPatient;

  useEffect(() => {
    if (!selectedPatient && patientList[0]) setSelectedPatient(patientList[0]);
  }, [patientList, selectedPatient]);

  useEffect(() => bus.subscribe("patient:selected", ({ patientId }) => {
    const found = patientListRef.current.find((patient) => patient.id === patientId);
    if (found && found.id !== selectedPatientRef.current?.id) setSelectedPatient(found);
  }), [bus]);

  const selectPatientById = useCallback((id: string) => {
    const found = patientListRef.current.find((patient) => patient.id === id);
    if (found) {
      setSelectedPatient(found);
      bus.emit("patient:selected", { patientId: found.id });
    }
  }, [bus]);

  const addPatient = useCallback((input: NewPatientInput, labels: { today: string; defaultCondition: string }): Patient | null => {
    if (!input.firstName || !input.lastName) return null;
    const created: Patient = {
      id: `pat-${Date.now().toString().slice(-4)}`,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || "09120000000",
      lastVisit: labels.today,
      scalpCondition: input.condition || labels.defaultCondition,
      hairDensity: 154,
      anagenRatio: 85,
      keratinHealth: 90,
      sebumBalance: 75,
      microcirculation: 80,
      stemCellVitality: 85,
    };
    setPatients((current) => [created, ...current]);
    setSelectedPatient(created);
    bus.emit("patient:created", { patient: created });
    bus.emit("patient:selected", { patientId: created.id });
    return created;
  }, [bus]);

  return { patients, images, patientList, selectedPatient, selectPatientById, addPatient, setSelectedPatient, setImages };
}
