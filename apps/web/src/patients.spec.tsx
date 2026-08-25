// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import PatientsPage from "./pages/PatientsPage.js";

vi.mock("./api/client.js", () => ({
  apiFetch: vi.fn(async () => [
    { id: "p1", firstName: "زهرا", lastName: "محمدی", phone: "09121234567" },
  ]),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  clearAccessToken: vi.fn(),
}));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><PatientsPage onLoggedOut={() => undefined} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

describe("patients page (T2)", () => {
  it("lists patients from the API", async () => {
    renderPage();
    expect(await screen.findByText("زهرا محمدی")).toBeTruthy();
    expect(screen.getByText("09121234567")).toBeTruthy();
  });

  it("renders the add-patient form", () => {
    renderPage();
    expect(screen.getByRole("form")).toBeTruthy();
  });
});
