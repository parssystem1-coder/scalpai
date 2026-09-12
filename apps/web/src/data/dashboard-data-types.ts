import type { Patient, TrichoscopyImage } from "./dashboard-samples";

/** The provenance of data exposed to dashboard consumers. */
export type DashboardDataMode = "real" | "demo" | "test";

export interface DashboardData {
  readonly mode: DashboardDataMode;
  readonly patients: readonly Patient[];
  readonly images: Readonly<Record<string, readonly TrichoscopyImage[]>>;
}

export interface DashboardDataProvider {
  readonly mode: DashboardDataMode;
  getPatients(): readonly Patient[];
  getImages(): Readonly<Record<string, readonly TrichoscopyImage[]>>;
}
