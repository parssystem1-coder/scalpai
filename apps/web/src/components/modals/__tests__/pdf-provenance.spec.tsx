// @vitest-environment jsdom
//
// P4-B02 / F19 regression guard: the clinical PDF artifact must never fabricate
// its own authenticity. The old implementation shipped a Math.random report id,
// a literal fake SHA-256, a fake portal URL and an unconditional VERIFIED stamp.
// These tests render the modal and assert on the DOM.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ClinicalPdfReportModal from "../ClinicalPdfReportModal.js";
import "../../../i18n.js";

afterEach(() => cleanup());

const notProvidedFa = "درج نشده";

describe("ClinicalPdfReportModal — provenance discipline", () => {
  it("renders no fabricated identity: unset fields show the not-provided placeholder", () => {
    render(<ClinicalPdfReportModal isOpen onClose={() => undefined} />);
    const hits = screen.getAllByText(notProvidedFa);
    expect(hits.length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText(/مریم رضایی/)).toBeNull();
    expect(screen.queryByText(/09129876543/)).toBeNull();
    expect(screen.queryByText(/IR-148920-TRICH/)).toBeNull();
    expect(screen.queryByText(/Polarized Epiluminescence/)).toBeNull();
  });

  it("claims no authenticity without a server seal", () => {
    render(<ClinicalPdfReportModal isOpen onClose={() => undefined} />);
    // The old fabricated stamp must never come back (either locale).
    expect(screen.queryByText("تایید و امضا شد (VERIFIED)")).toBeNull();
    expect(screen.queryByText(/Verified & Signed/)).toBeNull();
    expect(screen.queryByText(/SEALED/)).toBeNull();
    expect(screen.queryByText(/SHA256:/)).toBeNull();
    expect(screen.queryByText(/scalpai\.clinic\/portal/i)).toBeNull();
    // The unverified state is explicit, not silent.
    expect(screen.getByText(/UNVERIFIED/)).toBeTruthy();
  });

  it("never generates a random report id", () => {
    const { unmount } = render(<ClinicalPdfReportModal isOpen onClose={() => undefined} />);
    unmount();
    render(<ClinicalPdfReportModal isOpen onClose={() => undefined} />);
    const ids = screen
      .getAllByText(/درج نشده/)
      .filter((el) => el.previousElementSibling?.textContent?.includes("شناسه گزارش"));
    // Both renders show the placeholder for reportId — nothing random appeared.
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/REP-\d+/)).toBeNull();
  });

  it("renders the sealed state only with server provenance", () => {
    render(
      <ClinicalPdfReportModal
        isOpen
        onClose={() => undefined}
        patientName="سارا تست"
        provenance={{
          reportId: "rep_01H9XQ",
          signature: "dGVzdC1zaWduYXR1cmU",
          contentHash: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
          sealedAt: "2026-09-19T10:00:00Z",
          doctorName: "دکتر تست",
          clinicName: "کلینیک تست",
        }}
      />,
    );
    expect(screen.getByText(/SEALED/)).toBeTruthy();
    expect(screen.getByText(/rep_01H9XQ/)).toBeTruthy();
    expect(screen.getByText(/9f86d081/)).toBeTruthy();
    expect(screen.queryByText(/UNVERIFIED/)).toBeNull();
  });

  it("stays unverified when provenance lacks the signature", () => {
    render(
      <ClinicalPdfReportModal
        isOpen
        onClose={() => undefined}
        provenance={{ reportId: "rep_01H9XQ", contentHash: "abc" }}
      />,
    );
    expect(screen.getByText(/UNVERIFIED/)).toBeTruthy();
    expect(screen.queryByText(/SEALED/)).toBeNull();
  });
});
