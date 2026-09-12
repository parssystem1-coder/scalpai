import { describe, expect, it } from "vitest";
import {
  createDemoDashboardDataProvider,
  createEmptyDashboardDataProvider,
  createTestDashboardDataProvider,
} from "./dashboard-data-provider";
import type { Patient, TrichoscopyImage } from "./dashboard-samples";

const patient: Patient = {
  id: "fixture-patient",
  firstName: "Fixture",
  lastName: "Patient",
  phone: "00000000000",
};

const image: TrichoscopyImage = {
  id: "fixture-image",
  patientId: patient.id,
  url: "/fixture.jpg",
  area: "vertex",
  date: "2026-01-01",
  density: 120,
  thickness: "60 µm",
  qualityScore: 95,
};

describe("dashboard data provider contract", () => {
  it("exposes an explicit real mode with a valid empty state", () => {
    const provider = createEmptyDashboardDataProvider();

    expect(provider.mode).toBe("real");
    expect(provider.getPatients()).toEqual([]);
    expect(provider.getImages()).toEqual({});
  });

  it("keeps demo data in an explicit demo mode", () => {
    const provider = createDemoDashboardDataProvider({
      patients: [patient],
      images: { [patient.id]: [image] },
    });

    expect(provider.mode).toBe("demo");
    expect(provider.getPatients()).toEqual([patient]);
    expect(provider.getImages()[patient.id]).toEqual([image]);
  });

  it("keeps test fixtures in an explicit test mode and snapshots inputs", () => {
    const patients = [patient];
    const images = { [patient.id]: [image] };
    const provider = createTestDashboardDataProvider({ patients, images });

    patients.length = 0;
    images[patient.id]!.length = 0;

    expect(provider.mode).toBe("test");
    expect(provider.getPatients()).toEqual([patient]);
    expect(provider.getImages()[patient.id]).toEqual([image]);
  });
});
