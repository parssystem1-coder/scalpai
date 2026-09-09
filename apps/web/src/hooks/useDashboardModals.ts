import { useCallback, useMemo, useReducer } from "react";

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
  | "beforeAfter";

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
export function useDashboardModals(): UseDashboardModalsReturn {
  const [state, dispatch] = useReducer(dashboardModalsReducer, INITIAL_DASHBOARD_MODAL_STATE);

  const openConsent = useCallback(() => dispatch({ type: "open", modal: "consent" }), []);
  const closeConsent = useCallback(() => dispatch({ type: "close", modal: "consent" }), []);

  const openLicense = useCallback(() => dispatch({ type: "open", modal: "license" }), []);
  const closeLicense = useCallback(() => dispatch({ type: "close", modal: "license" }), []);

  const openSync = useCallback(() => dispatch({ type: "open", modal: "sync" }), []);
  const closeSync = useCallback(() => dispatch({ type: "close", modal: "sync" }), []);

  const openEducation = useCallback(() => dispatch({ type: "open", modal: "education" }), []);
  const closeEducation = useCallback(() => dispatch({ type: "close", modal: "education" }), []);

  const openGuidedCapture = useCallback(
    () => dispatch({ type: "open", modal: "guidedCapture" }),
    []
  );
  const closeGuidedCapture = useCallback(
    () => dispatch({ type: "close", modal: "guidedCapture" }),
    []
  );

  const openPdfReport = useCallback(() => dispatch({ type: "open", modal: "pdfReport" }), []);
  const closePdfReport = useCallback(() => dispatch({ type: "close", modal: "pdfReport" }), []);

  const openBeforeAfter = useCallback(() => dispatch({ type: "open", modal: "beforeAfter" }), []);
  const closeBeforeAfter = useCallback(() => dispatch({ type: "close", modal: "beforeAfter" }), []);

  return useMemo(
    () => ({
      isConsentOpen: state.consent,
      isLicenseOpen: state.license,
      isSyncOpen: state.sync,
      isEducationOpen: state.education,
      isGuidedCaptureOpen: state.guidedCapture,
      isPdfReportOpen: state.pdfReport,
      isBeforeAfterOpen: state.beforeAfter,

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
    ]
  );
}

export default useDashboardModals;
