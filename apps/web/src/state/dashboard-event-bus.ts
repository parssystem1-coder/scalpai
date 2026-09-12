import type { Patient, TrichoscopyImage } from "../data/dashboard-samples";
import type { DashboardModalKey } from "../hooks/useDashboardModals";

export interface DashboardAnalysisSnapshot {
  scores: { redness: number; flakeTexture: number; densityProxy: number };
  severity: number;
  anagenRatio: number;
  hairCaliber: string;
  recommendation: string;
  matrixHydration: number;
  tensorConfidence: number;
  follicularUnits: { single: number; double: number; triple: number };
}

export interface DashboardEventMap {
  "patient:selected": { patientId: string };
  "patient:created": { patient: Patient };
  "images:changed": { patientId: string; images: readonly TrichoscopyImage[] };
  "analysis:completed": { patientId: string; result: DashboardAnalysisSnapshot };
  "modal:opened": { modal: DashboardModalKey };
  "modal:closed": { modal: DashboardModalKey };
}

export type DashboardEventName = keyof DashboardEventMap;
export type DashboardEventListener<K extends DashboardEventName> = (payload: DashboardEventMap[K]) => void;
export type Unsubscribe = () => void;

export interface DashboardEventBus {
  emit<K extends DashboardEventName>(event: K, payload: DashboardEventMap[K]): void;
  subscribe<K extends DashboardEventName>(event: K, listener: DashboardEventListener<K>): Unsubscribe;
  clear(): void;
}

/** Small synchronous bus used only for dashboard-local cross-domain coordination. */
export function createDashboardEventBus(): DashboardEventBus {
  const listeners = new Map<DashboardEventName, Set<DashboardEventListener<DashboardEventName>>>();

  return {
    emit(event, payload) {
      listeners.get(event)?.forEach((listener) => listener(payload));
    },
    subscribe(event, listener) {
      const bucket = listeners.get(event) ?? new Set<DashboardEventListener<DashboardEventName>>();
      bucket.add(listener as DashboardEventListener<DashboardEventName>);
      listeners.set(event, bucket);
      return () => {
        bucket.delete(listener as DashboardEventListener<DashboardEventName>);
        if (bucket.size === 0) listeners.delete(event);
      };
    },
    clear() {
      listeners.clear();
    },
  };
}

/** Default bus is process-local; callers may inject an isolated bus in tests. */
export const dashboardEventBus = createDashboardEventBus();
