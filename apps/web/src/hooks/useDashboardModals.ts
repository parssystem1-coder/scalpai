import { useCallback, useEffect, useMemo, useReducer } from "react";
import { dashboardEventBus, type DashboardEventBus } from "../state/dashboard-event-bus";

/**
 * Phase 4 of the ClinicalDashboard refactor.
 *
 * Centralises the open/close state of every modal rendered by
 * `ClinicalDashboard.tsx` so the component no longer carries a pile of
 * independent `useState` booleans.
 *
 * Deliberately scoped to *visibility* only: modal payload/context state
 * (education condition + severity, before/after default photo ids, ...)
 * stays with the owner component because it is not open/close state.
 *
 * See docs/ROADMAP-CLINICAL-DASHBOARD-REFACTOR.md (Phase 4) and issue #62.
 */

/** Identifier for each modal managed by {@link useDashboardModals}. */
export type DashboardModalKey =
  | "consent"
  | "license"
  | "sync"
  | "education"
  | "guidedCapture"
  | "pdfReport"
  | "beforeAfter"
  | "addPatient";

/** Visibility map: one boolean per managed modal. */
export type DashboardModalState = Record<DashboardModalKey, boolean>;

/** Actions accepted by the internal reducer. */
export type DashboardModalAction =
  | { type: "open"; modal: DashboardModalKey }
  | { type: "close"; modal: DashboardModalKey }
  | { type: "closeAll" };

export const INITIAL_DASHBOARD_MODAL_STATE: DashboardModalState = {
  consent: false,
  license: false,
  sync: false,
  education: false,
  guidedCapture: false,
  pdfReport: false,
  beforeAfter: false,
  addPatient: false,
};

/**
 * Pure reducer. Exported for unit testing (Phase 5) without mounting React.
 * Returns the identical state object when nothing changes so consumers do not
 * re-render on redundant dispatches.
 */
export function dashboardModalsReducer(
  state: DashboardModalState,
  action: DashboardModalAction
): DashboardModalState {
  switch (action.type) {
    case "open":
      return state[action.modal] ? state : { ...state, [action.modal]: true };
    case "close":
      return state[action.modal] ? { ...state, [action.modal]: false } : state;
    case "closeAll":
      return Object.values(state).some(Boolean) ? { ...INITIAL_DASHBOARD_MODAL_STATE } : state;
    default:
      return state;
  }
}

export interface UseDashboardModalsReturn {
  // State
  isConsentOpen: boolean;
  isLicenseOpen: boolean;
  isSyncOpen: boolean;
  isEducationOpen: boolean;
  isGuidedCaptureOpen: boolean;
  isPdfReportOpen: boolean;
  isBeforeAfterOpen: boolean;
  isAddPatientOpen: boolean;

  // Actions
  openConsent: () => void;
  closeConsent: () => void;
  openLicense: () => void;
  closeLicense: () => void;
  openSync: () => void;
  closeSync: () => void;
  openEducation: () => void;
  closeEducation: () => void;
  openGuidedCapture: () => void;
  closeGuidedCapture: () => void;
  openPdfReport: () => void;
  closePdfReport: () => void;
  openBeforeAfter: () => void;
  closeBeforeAfter: () => void;
  openAddPatient: () => void;
  closeAddPatient: () => void;
}

/**
 * Manages the visibility of the seven ClinicalDashboard modals.
 *
 * All returned callbacks are referentially stable, and the returned object is
 * memoised against the modal state, so it is safe to pass the actions straight
 * into memoised child components.
 *
 * @example
 * const { isConsentOpen, openConsent, closeConsent } = useDashboardModals();
 */
export function useDashboardModals(bus: DashboardEventBus = dashboardEventBus): UseDashboardModalsReturn {
  const [state, dispatch] = useReducer(dashboardModalsReducer, INITIAL_DASHBOARD_MODAL_STATE);
  useEffect(() => {
    const unsubscribeOpened = bus.subscribe("modal:opened", ({ modal }) => dispatch({ type: "open", modal }));
    const unsubscribeClosed = bus.subscribe("modal:closed", ({ modal }) => dispatch({ type: "close", modal }));
    return () => {
      unsubscribeOpened();
      unsubscribeClosed();
    };
  }, [bus]);
  const openConsent = useCallback(() => { dispatch({ type: "open", modal: "consent" }); bus.emit("modal:opened", { modal: "consent" }); }, [bus]);
  const closeConsent = useCallback(() => { dispatch({ type: "close", modal: "consent" }); bus.emit("modal:closed", { modal: "consent" }); }, [bus]);
  const openLicense = useCallback(() => { dispatch({ type: "open", modal: "license" }); bus.emit("modal:opened", { modal: "license" }); }, [bus]);
  const closeLicense = useCallback(() => { dispatch({ type: "close", modal: "license" }); bus.emit("modal:closed", { modal: "license" }); }, [bus]);
  const openSync = useCallback(() => { dispatch({ type: "open", modal: "sync" }); bus.emit("modal:opened", { modal: "sync" }); }, [bus]);
  const closeSync = useCallback(() => { dispatch({ type: "close", modal: "sync" }); bus.emit("modal:closed", { modal: "sync" }); }, [bus]);
  const openEducation = useCallback(() => { dispatch({ type: "open", modal: "education" }); bus.emit("modal:opened", { modal: "education" }); }, [bus]);
  const closeEducation = useCallback(() => { dispatch({ type: "close", modal: "education" }); bus.emit("modal:closed", { modal: "education" }); }, [bus]);
  const openGuidedCapture = useCallback(
    () => { dispatch({ type: "open", modal: "guidedCapture" }); bus.emit("modal:opened", { modal: "guidedCapture" }); },
    [bus]
  );
  const closeGuidedCapture = useCallback(
    () => { dispatch({ type: "close", modal: "guidedCapture" }); bus.emit("modal:closed", { modal: "guidedCapture" }); },
    [bus]
  );
  const openPdfReport = useCallback(() => { dispatch({ type: "open", modal: "pdfReport" }); bus.emit("modal:opened", { modal: "pdfReport" }); }, [bus]);
  const closePdfReport = useCallback(() => { dispatch({ type: "close", modal: "pdfReport" }); bus.emit("modal:closed", { modal: "pdfReport" }); }, [bus]);
  const openBeforeAfter = useCallback(() => { dispatch({ type: "open", modal: "beforeAfter" }); bus.emit("modal:opened", { modal: "beforeAfter" }); }, [bus]);
  const closeBeforeAfter = useCallback(() => { dispatch({ type: "close", modal: "beforeAfter" }); bus.emit("modal:closed", { modal: "beforeAfter" }); }, [bus]);
  const openAddPatient = useCallback(() => { dispatch({ type: "open", modal: "addPatient" }); bus.emit("modal:opened", { modal: "addPatient" }); }, [bus]);
  const closeAddPatient = useCallback(() => { dispatch({ type: "close", modal: "addPatient" }); bus.emit("modal:closed", { modal: "addPatient" }); }, [bus]);

  return useMemo(
    () => ({
      isConsentOpen: state.consent,
      isLicenseOpen: state.license,
      isSyncOpen: state.sync,
      isEducationOpen: state.education,
      isGuidedCaptureOpen: state.guidedCapture,
      isPdfReportOpen: state.pdfReport,
      isBeforeAfterOpen: state.beforeAfter,
      isAddPatientOpen: state.addPatient,

      openConsent,
      closeConsent,
      openLicense,
      closeLicense,
      openSync,
      closeSync,
      openEducation,
      closeEducation,
      openGuidedCapture,
      closeGuidedCapture,
      openPdfReport,
      closePdfReport,
      openBeforeAfter,
      closeBeforeAfter,
      openAddPatient,
      closeAddPatient,
    }),
    [
      state,
      openConsent,
      closeConsent,
      openLicense,
      closeLicense,
      openSync,
      closeSync,
      openEducation,
      closeEducation,
      openGuidedCapture,
      closeGuidedCapture,
      openPdfReport,
      closePdfReport,
      openBeforeAfter,
      closeBeforeAfter,
      openAddPatient,
      closeAddPatient,
    ]
  );
}

export default useDashboardModals;
