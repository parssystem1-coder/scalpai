import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage.js";
import PatientsPage from "./pages/PatientsPage.js";
import PatientGalleryPage from "./pages/PatientGalleryPage.js";
import AnalysisPage from "./pages/AnalysisPage.js";
import { isMockPerf } from "./dev-perf.js";
import "./i18n.js";

const queryClient = new QueryClient();

function App() {
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem("k-authed")));
  const setAuthedBoth = (v: boolean) => {
    if (v) sessionStorage.setItem("k-authed", "1");
    else sessionStorage.removeItem("k-authed");
    setAuthed(v);
  };
  return (
    <Routes>
      <Route
        path="/login"
        element={authed ? <Navigate to="/patients" replace /> : <LoginPage onLoggedIn={() => setAuthedBoth(true)} />}
      />
      <Route
        path="/patients"
        element={
          authed ? (
            <PatientsPage
              onLoggedOut={() => setAuthedBoth(false)}
            />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/patients/:pid/gallery"
        element={
          authed || isMockPerf() ? (
            <PatientGalleryPage onLoggedOut={() => setAuthedBoth(false)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/patients/:pid/gallery/:gid"
        element={
          authed ? (
            <AnalysisPage onLoggedOut={() => setAuthedBoth(false)} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to={authed ? "/patients" : "/login"} replace />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
