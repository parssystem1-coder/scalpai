// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DigitalConsentModal from "./components/DigitalConsentModal.js";
import "./i18n.js";

vi.mock("./api/client.js", () => ({
  apiFetch: vi.fn(async () => []),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  clearAccessToken: vi.fn(),
}));

vi.mock("./offline/SyncProvider.js", () => ({
  useSync: () => ({
    isOnline: true,
    enqueue: vi.fn(),
    isFlushing: false,
    pendingCount: 0,
    flushOutbox: vi.fn(),
  }),
  SyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(cleanup);

describe("DigitalConsentModal Component", () => {
  const renderModal = (isOpen = true) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <DigitalConsentModal
          patientId="11111111-1111-4111-8111-111111111111"
          patientName="سارا احمدی"
          patientPhone="09123456789"
          isOpen={isOpen}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
  };

  it("renders consent clauses, checkboxes, and touch signature canvas when open", () => {
    renderModal(true);

    expect(screen.getByText("فرم رضایت دیجیتال بیمار (Digital Consent)")).toBeDefined();
    expect(screen.getByText("سارا احمدی")).toBeDefined();
    expect(screen.getByText("تایید رضایت تصویربرداری تشخیصی تریکوسکوپی و ثبت در پرونده")).toBeDefined();
    expect(screen.getByText("امضای الکترونیکی بیمار (Touch / Pen):")).toBeDefined();
    expect(screen.getByText("پاک کردن امضا")).toBeDefined();
  });

  it("shows error validation if submitted without agreeing to clinical terms", () => {
    renderModal(true);

    const submitBtn = screen.getByRole("button", { name: "تایید و ثبت نهایی رضایت‌نامه" });
    fireEvent.click(submitBtn);

    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText("لطفاً تمامی بندهای رضایت‌نامه بالینی را تایید فرمایید.")).toBeDefined();
  });

  it("switches to history tab when clicked", () => {
    renderModal(true);

    const historyTab = screen.getByRole("button", { name: /تاریخچه رضایت‌نامه‌ها/i });
    fireEvent.click(historyTab);

    expect(historyTab.className).toMatch(/text-\[oklch\(62%_0\.09_16\)|text-\[#9A643E\]/);
  });
});

