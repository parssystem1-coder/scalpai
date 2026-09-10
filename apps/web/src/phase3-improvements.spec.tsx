// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import ConsentCertificateModal from "./components/ConsentCertificateModal.js";
import LicenseDiagnosticsModal from "./components/LicenseDiagnosticsModal.js";
import SyncInspectorModal from "./components/SyncInspectorModal.js";
import "./i18n.js";

vi.mock("./offline/SyncProvider.js", () => ({
  useSync: () => ({
    isOnline: true,
    enqueue: vi.fn(),
    isFlushing: false,
    pendingCount: 2,
    deadLetterCount: 0,
    lastPullAt: null,
    flush: vi.fn(async () => 2),
    syncNow: vi.fn(async () => undefined),
  }),
}));

// Phase 7: the offline database belongs to a (clinic, user) scope, so the UI asks
// for the active one through listOutbox() instead of importing a singleton.
vi.mock("./offline/sync.js", () => ({
  listOutbox: async () => [
    {
      id: "m-12345678-90ab-cdef",
      entity: "patients",
      op: "update",
      schemaVersion: 1,
      clientUpdatedAt: new Date().toISOString(),
      baseVersion: 1,
      payload: JSON.stringify({ gender: "female" }),
      createdAt: Date.now(),
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      clinicId: "clinic-a",
      userId: "owner@clinic-a.test",
    },
  ],
}));

/**
 * Phase 10 (M2, ADR-0043/ADR-0045). The licence panel has no local state machine
 * left: it renders `GET /license/status` and nothing else. So the test has to
 * speak for the server, and `licenseFetch` is the only input the modal has.
 *
 * The old version of this block asserted a title that is gone
 * («صحت‌سنجی ساعت سیستم»), clicked a «clock rollback» simulator that was
 * deleted with it, and expected a feature chip out of claims the browser had
 * hard-coded. Three assertions against code that no longer exists.
 */
const licenseFetch = vi.fn();

vi.mock("./api/client.js", () => ({
  apiFetch: (...args: unknown[]) => licenseFetch(...args),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "ApiError";
      this.code = code;
    }
  },
}));

const NOW_SECONDS = Math.floor(Date.parse("2026-09-08T09:00:00.000Z") / 1000);

/** A verdict the server reached by verifying a real Ed25519 token. */
const VERIFIED_STATUS = {
  state: "active",
  verified: true,
  keyFingerprint: "kid-7f3a91",
  checkedAt: new Date(NOW_SECONDS * 1000).toISOString(),
  daysRemaining: 30,
  claims: {
    name: "Shiraz Hair & Scalp Clinic",
    tier: "professional",
    features: ["analysis:advanced", "offline:full"],
    maxSeats: 10,
    maxPatients: 5000,
    issuedAt: NOW_SECONDS - 86_400 * 10,
    expiresAt: NOW_SECONDS + 86_400 * 30,
  },
};

/** The anti-tamper verdict: reached on the server, never simulated in the UI. */
const TAMPERED_STATUS = {
  state: "tampered",
  verified: true,
  keyFingerprint: "kid-7f3a91",
  checkedAt: new Date(NOW_SECONDS * 1000).toISOString(),
  reason: "ساعت سیستم نسبت به آخرین بررسی عقب کشیده شده است",
};

beforeEach(() => {
  licenseFetch.mockReset();
  licenseFetch.mockResolvedValue(VERIFIED_STATUS);
});

afterEach(cleanup);

describe("Phase 3 Improvements Verification", () => {
  it("renders ConsentCertificateModal with formal legal clauses, patient info, and print triggers", () => {
    const consent = {
      id: "consent-99887766-5544-3322-1100-aabbccddeeff",
      patientId: "patient-111",
      templateVersion: "v2026.1",
      signedAt: "2026-09-04T12:00:00.000Z",
      signaturePayload: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    };

    render(
      <ConsentCertificateModal
        consent={consent}
        patientName="مریم رضایی"
        patientPhone="09129876543"
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("مریم رضایی")).toBeDefined();
    expect(screen.getByText("CERT-CCDDEEFF")).toBeDefined();
    expect(screen.getByText("چاپ گواهی")).toBeDefined();
    expect(screen.getByText("دانلود گواهی")).toBeDefined();
  });

  it("renders LicenseDiagnosticsModal from the server verdict: Ed25519 state, provenance, and quota claims", async () => {
    render(<LicenseDiagnosticsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/تشخیص لایسنس و خودمیزبانی/)).toBeDefined();
    // The header now names WHERE the verdict comes from (M2).
    expect(screen.getByText(/تاییدیه سمت سرور/)).toBeDefined();
    expect(screen.getByText(/ادعاهای لایسنس و سهمیه‌ها/)).toBeDefined();

    expect(licenseFetch).toHaveBeenCalledWith("/license/status");
    expect(await screen.findByText(/لایسنس فعال/)).toBeDefined();
    // Entitlements are rendered from the verified claims, not from a constant.
    expect(await screen.findByText("analysis:advanced")).toBeDefined();
  });

  it("shows a clock-rollback verdict only because the server returned it", async () => {
    licenseFetch.mockResolvedValue(TAMPERED_STATUS);
    render(<LicenseDiagnosticsModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText(/اختلال: امضای لایسنس/)).toBeDefined();
    // The simulator that used to flip a local boolean is gone for good.
    expect(screen.queryByText("شبیه‌سازی عقب‌کشیدن ساعت سیستم")).toBeNull();

    // Re-verification asks the server again instead of deriving a new state.
    fireEvent.click(screen.getByTestId("license-refresh"));
    expect(await screen.findByText(/اختلال: امضای لایسنس/)).toBeDefined();
    expect(licenseFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("renders SyncInspectorModal with online state, outbox items, and LWW conflict resolution log", async () => {
    render(<SyncInspectorModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/مفتش همگام‌سازی آفلاین و تضادها/)).toBeDefined();
    expect(screen.getByText(/آنلاین \(دسترسی به سرور\)/)).toBeDefined();
    expect(screen.getByText(/ثبت حل تضادها/)).toBeDefined();
    expect(screen.getByText("ارسال اجباری")).toBeDefined();
    expect(await screen.findByText(/ID: m-12345678-90ab/)).toBeDefined();
  });
});
