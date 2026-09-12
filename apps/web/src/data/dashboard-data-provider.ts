import type { DashboardData, DashboardDataProvider } from "./dashboard-data-types";

export const EMPTY_DASHBOARD_DATA: DashboardData = Object.freeze({
  mode: "real" as const,
  patients: Object.freeze([]),
  images: Object.freeze({}),
});

function toSnapshot(data: DashboardData): DashboardData {
  return Object.freeze({
    mode: data.mode,
    patients: Object.freeze([...data.patients]),
    images: Object.freeze(
      Object.fromEntries(
        Object.entries(data.images).map(([patientId, images]) => [patientId, Object.freeze([...images])])
      )
    ),
  });
}

/**
 * Creates a read-only provider snapshot. Runtime wiring chooses the mode;
 * this factory never falls back from real data to demo data.
 */
export function createDashboardDataProvider(data: DashboardData): DashboardDataProvider {
  const snapshot = toSnapshot(data);
  return Object.freeze({
    mode: snapshot.mode,
    getPatients: () => snapshot.patients,
    getImages: () => snapshot.images,
  });
}

export function createEmptyDashboardDataProvider(): DashboardDataProvider {
  return createDashboardDataProvider(EMPTY_DASHBOARD_DATA);
}

export function createDemoDashboardDataProvider(
  data: Omit<DashboardData, "mode">,
): DashboardDataProvider {
  return createDashboardDataProvider({ ...data, mode: "demo" });
}

export function createTestDashboardDataProvider(
  data: Omit<DashboardData, "mode">,
): DashboardDataProvider {
  return createDashboardDataProvider({ ...data, mode: "test" });
}
