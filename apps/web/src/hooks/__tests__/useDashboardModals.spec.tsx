// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  INITIAL_DASHBOARD_MODAL_STATE,
  dashboardModalsReducer,
  useDashboardModals,
} from "../useDashboardModals.js";

/**
 * Phase 5 coverage for the Phase 4 hook. The reducer is exported precisely so
 * the state machine can be proven without mounting React, and the hook test
 * then only has to prove the wiring and the referential stability the
 * memoised children depend on.
 */
describe("dashboardModalsReducer", () => {
  it("starts with every modal closed", () => {
    expect(Object.values(INITIAL_DASHBOARD_MODAL_STATE).every((v) => v === false)).toBe(true);
  });

  it("opens and closes a single modal without touching the others", () => {
    const opened = dashboardModalsReducer(INITIAL_DASHBOARD_MODAL_STATE, {
      type: "open",
      modal: "consent",
    });
    expect(opened.consent).toBe(true);
    expect(opened.license).toBe(false);
    expect(opened.beforeAfter).toBe(false);

    const closed = dashboardModalsReducer(opened, { type: "close", modal: "consent" });
    expect(closed.consent).toBe(false);
  });

  it("returns the SAME state object for a redundant dispatch (no wasted render)", () => {
    const state = INITIAL_DASHBOARD_MODAL_STATE;
    expect(dashboardModalsReducer(state, { type: "close", modal: "sync" })).toBe(state);
    expect(dashboardModalsReducer(state, { type: "closeAll" })).toBe(state);

    const opened = dashboardModalsReducer(state, { type: "open", modal: "sync" });
    expect(dashboardModalsReducer(opened, { type: "open", modal: "sync" })).toBe(opened);
  });

  it("closeAll clears every open modal at once", () => {
    let state = dashboardModalsReducer(INITIAL_DASHBOARD_MODAL_STATE, {
      type: "open",
      modal: "education",
    });
    state = dashboardModalsReducer(state, { type: "open", modal: "pdfReport" });
    expect(state.education && state.pdfReport).toBe(true);

    const cleared = dashboardModalsReducer(state, { type: "closeAll" });
    expect(Object.values(cleared).every((v) => v === false)).toBe(true);
  });
});

describe("useDashboardModals", () => {
  it("exposes seven closed modals on mount", () => {
    const { result } = renderHook(() => useDashboardModals());

    expect(result.current.isConsentOpen).toBe(false);
    expect(result.current.isLicenseOpen).toBe(false);
    expect(result.current.isSyncOpen).toBe(false);
    expect(result.current.isEducationOpen).toBe(false);
    expect(result.current.isGuidedCaptureOpen).toBe(false);
    expect(result.current.isPdfReportOpen).toBe(false);
    expect(result.current.isBeforeAfterOpen).toBe(false);
  });

  it("opens and closes each modal through its own actions", () => {
    const { result } = renderHook(() => useDashboardModals());

    const cases: Array<[() => void, () => void, () => boolean]> = [
      [
        () => result.current.openConsent(),
        () => result.current.closeConsent(),
        () => result.current.isConsentOpen,
      ],
      [
        () => result.current.openLicense(),
        () => result.current.closeLicense(),
        () => result.current.isLicenseOpen,
      ],
      [() => result.current.openSync(), () => result.current.closeSync(), () => result.current.isSyncOpen],
      [
        () => result.current.openEducation(),
        () => result.current.closeEducation(),
        () => result.current.isEducationOpen,
      ],
      [
        () => result.current.openGuidedCapture(),
        () => result.current.closeGuidedCapture(),
        () => result.current.isGuidedCaptureOpen,
      ],
      [
        () => result.current.openPdfReport(),
        () => result.current.closePdfReport(),
        () => result.current.isPdfReportOpen,
      ],
      [
        () => result.current.openBeforeAfter(),
        () => result.current.closeBeforeAfter(),
        () => result.current.isBeforeAfterOpen,
      ],
    ];

    for (const [open, close, read] of cases) {
      act(() => open());
      expect(read()).toBe(true);
      act(() => close());
      expect(read()).toBe(false);
    }
  });

  it("keeps modals independent", () => {
    const { result } = renderHook(() => useDashboardModals());

    act(() => {
      result.current.openSync();
      result.current.openPdfReport();
    });
    expect(result.current.isSyncOpen).toBe(true);
    expect(result.current.isPdfReportOpen).toBe(true);

    act(() => result.current.closeSync());
    expect(result.current.isSyncOpen).toBe(false);
    expect(result.current.isPdfReportOpen).toBe(true);
  });

  it("keeps action identities stable across renders", () => {
    const { result } = renderHook(() => useDashboardModals());
    const firstOpenConsent = result.current.openConsent;

    act(() => result.current.openEducation());

    expect(result.current.openConsent).toBe(firstOpenConsent);
  });
});
