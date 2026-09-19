/// <reference types="node" />
// @vitest-environment jsdom
//
// Wave 3 (P4 remediation) — the auto-lock lives in ProtectedRoute, at the
// single choke point every protected route passes through. These are
// behavioural tests: the real ProtectedRoute + AutoLock run with fake timers,
// and the lock must fire even for a route (InboxPage) that never wires an
// AutoLock itself. The per-page wiring era was exactly how InboxPage shipped
// unprotected (WEAKNESSES P4-B08 / F14).
//
// NOTE on timing: the lock timer only starts after auth resolves, so the
// expiry window is advanced in a second act() — never a bare vi timer at
// module scope.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { InboxPage } from "./pages/InboxPage.js";
import { AuthProvider } from "./context/AuthContext.js";

vi.mock("./api/client", () => ({
  apiFetch: vi.fn().mockResolvedValue({ items: [] }),
  clearAccessToken: vi.fn(),
  getAccessToken: vi.fn(() => "test-token"),
  setAccessToken: vi.fn(),
}));

vi.mock("./offline/db", () => ({
  closeOfflineScope: vi.fn().mockResolvedValue(undefined),
  purgeLegacyOfflineDb: vi.fn().mockResolvedValue(undefined),
}));

// isAuthenticated = !!user && !!token: the user blob rides in sessionStorage.
function seedSession() {
  sessionStorage.setItem("scalpai_user", JSON.stringify({ email: "tester@scalpai.clinic" }));
}

function LoginProbe() {
  return <div data-testid="login-probe" />;
}

function Harness({ initialPath }: { initialPath: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <QueryClientProvider client={qc}>
          <Routes>
            <Route
              path="/inbox"
              element={
                <ProtectedRoute>
                  <InboxPage />
                </ProtectedRoute>
              }
            />
            <Route path="/login" element={<LoginProbe />} />
          </Routes>
        </QueryClientProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("wave 3 — the lock is inherited by construction, not wired per page", () => {
  it("locks an idle session even on InboxPage, which wires no AutoLock of its own", async () => {
    vi.useFakeTimers();
    seedSession();
    render(<Harness initialPath="/inbox" />);

    // Route is mounted (apiFetch resolved ⇒ state settled under fake timers
    // via the microtask flush below).
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByRole("heading", { name: /inbox|صندوق/i })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
    });
    // Let the redirect's navigation state settle.
    await act(async () => {
      await Promise.resolve();
    });

    // Lock = full logout: token dropped, redirected to /login.
    expect(screen.getByTestId("login-probe")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /inbox|صندوق/i })).toBeNull();
  });

  it("stays authenticated while the user is active", async () => {
    vi.useFakeTimers();
    seedSession();
    render(<Harness initialPath="/inbox" />);
    await act(async () => {
      await Promise.resolve();
    });

    for (let i = 0; i < 12; i++) {
      act(() => {
        window.dispatchEvent(new Event("mousemove"));
        vi.advanceTimersByTime(60_000);
      });
    }
    expect(screen.getByRole("heading", { name: /inbox|صندوق/i })).toBeTruthy();
    expect(screen.queryByTestId("login-probe")).toBeNull();
  });

  it("exports the idle window as a single source of truth (§13: 10 minutes)", async () => {
    const { AUTO_LOCK_MINUTES, AUTO_LOCK_SECONDS } = await import(
      "./components/ProtectedRoute.js"
    );
    expect(AUTO_LOCK_MINUTES).toBe(10);
    // No VITE_AUTO_LOCK_SECONDS in the unit-test env → full §13 window.
    expect(AUTO_LOCK_SECONDS).toBe(600);
  });
});
