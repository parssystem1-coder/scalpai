import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ClinicalDashboard } from "./components/ClinicalDashboard.js";
import { ProPlansView } from "./components/ProPlansView.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { SyncProvider } from "./offline/SyncProvider.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import LandingPage from "./pages/LandingPage.js";
import PatientsPage from "./pages/PatientsPage.js";
import PatientGalleryPage from "./pages/PatientGalleryPage.js";
import AnalysisPage from "./pages/AnalysisPage.js";
import LoginPage from "./pages/LoginPage.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
    },
  },
});

function AppRoutes() {
  const { user, logout, setDemoUser } = useAuth();
  const [toast, setToast] = useState<{ title: string; desc: string } | null>(null);
  const navigate = useNavigate();

  const showToast = (title: string, desc: string) => {
    setToast({ title, desc });
    setTimeout(() => setToast(null), 3800);
  };

  const handleLogout = () => {
    logout();
    showToast("خروج موفق", "از حساب کلینیک خارج شدید.");
    navigate("/");
  };

  const userEmail = user?.email ?? "tricho@scalpai.clinic";

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              onLoginSuccess={(email) => {
                setDemoUser(email);
              }}
              showToast={showToast}
            />
          }
        />
        <Route
          path="/login"
          element={
            <LoginPage
              onLoggedIn={() => {
                navigate("/dashboard");
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
                  onClick={() => navigate(-1)}
                  className="mb-4 px-4 py-2 bg-white/80 rounded-xl text-sm font-bold shadow-xs border border-white cursor-pointer"
                >
                  ← بازگشت
                </button>
                <ProPlansView
                  onSelectPlan={() => {
                    showToast("پلن فعال شد", "پلن با موفقیت انتخاب شد.");
                    navigate("/dashboard");
                  }}
                />
              </div>
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

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
