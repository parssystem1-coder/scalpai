import React, { Suspense, lazy, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProPlansView } from "./components/ProPlansView.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { SyncProvider } from "./offline/SyncProvider.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import LandingPage from "./pages/LandingPage.js";

/**
 * WEAKNESSES M15 - initial payload budget.
 *
 * Everything below is reachable only AFTER the landing page, so none of it
 * belongs in the first download. `tools/bundle-budget.ts` walks the static
 * import graph from the entry chunk and excludes `dynamicImports`, which is the
 * same boundary the browser uses: a lazy route is fetched when it is navigated
 * to, not before.
 *
 * `LandingPage` stays static - it IS the first route, so deferring it would only
 * add a round trip. `ProPlansView` stays static too: LandingPage renders it
 * inline in its "Pro Plans" tab, so it is part of the landing chunk regardless
 * of how this file imports it.
 *
 * Making any of these a plain `import` again puts its whole subtree back into
 * the measured payload, and the budget gate will say so.
 */
const ClinicalDashboard = lazy(() => import("./components/ClinicalDashboard.js"));
const LoginPage = lazy(() => import("./pages/LoginPage.js"));
const PatientsPage = lazy(() => import("./pages/PatientsPage.js"));
const PatientGalleryPage = lazy(() => import("./pages/PatientGalleryPage.js"));
const AnalysisPage = lazy(() => import("./pages/AnalysisPage.js"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
});

/** Transient placeholder shown while a lazy route chunk is in flight. */
const RouteFallback: React.FC = () => (
  <div
    role="status"
    aria-label="در حال بارگذاری"
    dir="rtl"
    className="min-h-screen grid place-items-center bg-[oklch(85%_0.03_28)]"
  >
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 rounded-full border-2 border-[oklch(76%_0.085_24)] border-t-transparent animate-spin" />
      <span className="text-xs font-semibold tracking-widest uppercase text-[oklch(50%_0.015_20)]">
        در حال بارگذاری…
      </span>
    </div>
  </div>
);

function AppRoutes() {
  const { user, logout } = useAuth();
  const [toast, setToast] = useState<{ title: string; desc: string } | null>(null);
  const navigate = useNavigate();

  const showToast = (title: string, desc: string) => {
    setToast({ title, desc });
    setTimeout(() => setToast(null), 3800);
  };

  const handleLogout = () => {
    logout();
    showToast("خروج موفق", "از حساب کلینیک خارج شدید.");
    // M19: navigate() is thenable — nothing awaits a route change, so the
    // promise is discarded explicitly (no-floating-promises).
    void navigate("/");
  };

  const userEmail = user?.email ?? "";

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <LandingPage
                showToast={showToast}
              />
            }
          />
          <Route
            path="/login"
            element={
              <LoginPage
                onLoggedIn={() => {
                  void navigate("/dashboard");
                }}
              />
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <ClinicalDashboard userEmail={userEmail} onLogout={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients"
            element={
              <ProtectedRoute>
                <PatientsPage onLoggedOut={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/:pid/gallery"
            element={
              <ProtectedRoute>
                <PatientGalleryPage onLoggedOut={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patients/:pid/gallery/:gid"
            element={
              <ProtectedRoute>
                <AnalysisPage onLoggedOut={handleLogout} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/plans"
            element={
              <div className="min-h-screen bg-[oklch(85%_0.03_28)] p-6" dir="rtl">
                <div className="max-w-5xl mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      void navigate(-1);
                    }}
                    className="mb-4 px-4 py-2 bg-white/80 rounded-xl text-sm font-bold shadow-xs border border-white cursor-pointer"
                  >
                    ← بازگشت
                  </button>
                  <ProPlansView
                    onSelectPlan={() => {
                      showToast("پلن فعال شد", "پلن با موفقیت انتخاب شد.");
                      void navigate("/dashboard");
                    }}
                  />
                </div>
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {/* Global Toast Feedback */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[2000] px-6 py-3 rounded-full bg-white/95 border border-[oklch(76%_0.085_24)] shadow-2xl backdrop-blur-xl flex items-center gap-3">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white grid place-items-center text-xs font-bold">
            <Check className="w-3.5 h-3.5" />
          </div>
          <div className="text-right font-sans" dir="rtl">
            <strong className="block text-xs text-[oklch(20%_0.02_20)]">{toast.title}</strong>
            <span className="text-[0.7rem] text-[oklch(50%_0.015_20)]">{toast.desc}</span>
          </div>
        </div>
      )}
    </>
  );
}

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
