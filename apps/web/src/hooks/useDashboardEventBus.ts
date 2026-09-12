import { useCallback, useEffect, useMemo } from "react";
import {
  dashboardEventBus,
  type DashboardEventBus,
  type DashboardEventListener,
  type DashboardEventMap,
  type DashboardEventName,
} from "../state/dashboard-event-bus";

export interface DashboardEventBusHook {
  bus: DashboardEventBus;
  emit: <K extends DashboardEventName>(event: K, payload: DashboardEventMap[K]) => void;
  subscribe: <K extends DashboardEventName>(event: K, listener: DashboardEventListener<K>) => () => void;
}

/** Provides stable emit/subscribe helpers with automatic subscription cleanup. */
export function useDashboardEventBus(bus: DashboardEventBus = dashboardEventBus): DashboardEventBusHook {
  const emit = useCallback(<K extends DashboardEventName>(event: K, payload: DashboardEventMap[K]) => {
    bus.emit(event, payload);
  }, [bus]);
  const subscribe = useCallback(<K extends DashboardEventName>(event: K, listener: DashboardEventListener<K>) => {
    return bus.subscribe(event, listener);
  }, [bus]);

  return useMemo(() => ({ bus, emit, subscribe }), [bus, emit, subscribe]);
}

export function useDashboardEventSubscription<K extends DashboardEventName>(
  event: K,
  listener: DashboardEventListener<K>,
  bus: DashboardEventBus = dashboardEventBus,
): void {
  useEffect(() => bus.subscribe(event, listener), [bus, event, listener]);
}
