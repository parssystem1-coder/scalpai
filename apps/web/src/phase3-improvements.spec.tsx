// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
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
    flush: vi.fn(async () => 2),
  }),
}));

vi.mock("./offline/db.js", () => ({
  db: {
    outbox: {
      orderBy: () => ({
        toArray: async () => [
          {
            id: "m-12345",
            seq: 1,
            entity: "patients",
            op: "update",
            schemaVersion: 1,
            clientUpdatedAt: new Date().toISOString(),
            baseVersion: "v1",
            payload: JSON.stringify({ phone: "09121112233" }),
            createdAt: Date.now(),
          },
        ],
      }),
    },
  },
}));

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
    expect(screen.getByText("دانلود سند")).toBeDefined();
  });

  it("renders LicenseDiagnosticsModal with Ed25519 token status, clock anti-tamper, and quota claims", () => {
    render(<LicenseDiagnosticsModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/پایشگر سلامت لایسنس و سلف‌هاستد/)).toBeDefined();
    expect(screen.getByText(/صحت‌سنجی ساعت سیستم/)).toBeDefined();
    expect(screen.getByText(/سهمیه‌ها و ظرفیت مجاز/)).toBeDefined();
    expect(screen.getByText("analysis:advanced")).toBeDefined();

    // Trigger clock-drift simulator toggle
    const tamperBtn = screen.getByText("شبیه‌سازی عقب‌کشیدن ساعت سیستم");
    fireEvent.click(tamperBtn);
    expect(screen.getByText(/هشدار: دستکاری ساعت سیستم شناسایی شد/)).toBeDefined();
  });

  it("renders SyncInspectorModal with online state, outbox items, and LWW conflict resolution log", async () => {
    render(<SyncInspectorModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText(/پایشگر همگام‌سازی آفلاین و حل تعارض/)).toBeDefined();
    expect(screen.getByText(/آنلاین \(متصل به سرور\)/)).toBeDefined();
    expect(screen.getByText(/تاریخچه بازرسی و حل تعارض‌های همزمانی/)).toBeDefined();
    expect(screen.getByText("همگام‌سازی فوری")).toBeDefined();
  });
});
