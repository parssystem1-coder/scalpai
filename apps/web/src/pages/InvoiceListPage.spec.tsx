// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InvoiceListPage } from "./InvoiceListPage.js";

const { apiFetch, useAuth } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  useAuth: vi.fn(() => ({ user: { email: "o@x.test", role: "owner" } })),
}));
vi.mock("../api/client.js", () => ({
  apiFetch,
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));
vi.mock("../context/AuthContext.js", () => ({ useAuth }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fa" } }),
}));
vi.mock("../i18n.js", () => ({ default: { addResourceBundle: vi.fn() } }));

const INVOICE = {
  id: "inv-1",
  number: "2026-001",
  state: "draft",
  currency: "IRR",
  total: 1_200_000,
  paidAmount: 0,
  issuedAt: null,
};

function renderPage() {
  return render(
    <MemoryRouter>
      <InvoiceListPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InvoiceListPage (D13)", () => {
  it("lists invoices and filters by state", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/billing/invoices?")) return [INVOICE];
      return [];
    });
    renderPage();
    expect(await screen.findByText("2026-001")).toBeTruthy();

    fireEvent.change(screen.getByTestId("invoice-state-filter"), { target: { value: "paid" } });
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining("state=paid")),
    );
  });

  it("creates a draft invoice from a catalog product (price comes from the catalog)", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (path === "/billing/invoices" && init?.method === "POST") {
        expect(JSON.parse(init.body ?? "{}")).toEqual({
          patientId: "pat-1",
          items: [{ productId: "prod-1", quantity: 2, discount: 5000 }],
        });
        return { id: "inv-2" };
      }
      if (path.startsWith("/billing/invoices?")) return [INVOICE];
      if (path.startsWith("/billing/products")) return [{ id: "prod-1", name: "لیزر", price: 600000, currency: "IRR", active: true }];
      return [{ id: "pat-1", firstName: "زهرا", lastName: "محمدی", phone: "09121234567" }];
    });
    renderPage();
    fireEvent.click(await screen.findByTestId("invoice-create-toggle"));
    fireEvent.change(await screen.findByLabelText("invoice.patient"), { target: { value: "pat-1" } });
    fireEvent.change(screen.getByLabelText("invoice.product"), { target: { value: "prod-1" } });
    fireEvent.change(screen.getByLabelText("invoice.quantity"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("invoice.discount"), { target: { value: "5000" } });
    fireEvent.click(screen.getByText("invoice.createDraft"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/billing/invoices", expect.objectContaining({ method: "POST" })));
  });

  it("issues, pays and — owner only — voids with a reason", async () => {
    apiFetch.mockImplementation(async (path: string, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        if (path.endsWith("/issue")) return { ok: true };
        if (path.endsWith("/payments")) {
          expect(JSON.parse(init.body ?? "{}")).toEqual({ amount: 0, method: "cash" });
          return { ok: true };
        }
        if (path.endsWith("/void")) {
          expect(JSON.parse(init.body ?? "{}").reason.length).toBeGreaterThanOrEqual(4);
          return { ok: true };
        }
      }
      if (path.startsWith("/billing/invoices?")) return [INVOICE];
      return [];
    });
    renderPage();
    fireEvent.click(await screen.findByText("invoice.issue"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/billing/invoices/inv-1/issue", expect.anything()));

    // void بدون دلیل کوتاه ارسال نمی‌شود
    vi.spyOn(window, "prompt").mockReturnValue("کم");
    fireEvent.click(screen.getByText("invoice.void"));
    expect(apiFetch).not.toHaveBeenCalledWith(expect.stringContaining("/void"), expect.anything());

    vi.spyOn(window, "prompt").mockReturnValue("دلیل ابطال آزمایشی");
    fireEvent.click(screen.getByText("invoice.void"));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/billing/invoices/inv-1/void", expect.anything()));
  });

  it("hides the void action for non-owner roles (mirrors @Roles owner)", async () => {
    useAuth.mockReturnValue({ user: { email: "r@x.test", role: "receptionist" } });
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/billing/invoices?")) return [{ ...INVOICE, state: "issued" }];
      return [];
    });
    renderPage();
    expect(await screen.findByText("invoice.payFull")).toBeTruthy();
    expect(screen.queryByText("invoice.void")).toBeNull();
  });
});
