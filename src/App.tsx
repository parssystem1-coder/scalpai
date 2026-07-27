import { useEffect, useState, useRef, lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import MainLayout from './layouts/MainLayout';
import { db } from './db';
import { useSettingsStore } from './store';

// صفحات به‌صورت lazy تا باندل اولیه سبک بماند
// (به‌خصوص OfflineAnalysis که TensorFlow/recharts را همراه دارد)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Clients = lazy(() => import('./pages/Clients'));
const Sessions = lazy(() => import('./pages/Sessions'));
const Gallery = lazy(() => import('./pages/Gallery'));
const MedicalQuestionnaire = lazy(() => import('./pages/MedicalQuestionnaire'));
const TrichologistAnalysis = lazy(() => import('./pages/TrichologistAnalysis'));
const AIAnalysis = lazy(() => import('./pages/AIAnalysis'));
const OfflineAnalysis = lazy(() => import('./pages/OfflineAnalysis'));
const LocalLearning = lazy(() => import('./pages/LocalLearning'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
    </div>
  );
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageFallback />}>{children}</Suspense>;
}

// Auth guard component - validates both localStorage and database credentials
function RequireAuth({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    // Prevent multiple checks
    if (hasChecked.current) return;
    hasChecked.current = true;

    const checkAuth = async () => {
      const fetchSettings = useSettingsStore.getState().fetchSettings;
      await fetchSettings();

      const { validateAuthSession, clearAuthSession } = await import('./lib/authSession');
      const session = await validateAuthSession();
      const storeSettings = useSettingsStore.getState().settings;
      const hasCreds = await db.hasCredentials();

      if (session && storeSettings.username && hasCreds) {
        if (session.username === storeSettings.username) {
          setIsAuthenticated(true);
        } else {
          clearAuthSession();
          setIsAuthenticated(false);
        }
      } else if (!storeSettings.username || !hasCreds) {
        clearAuthSession();
        setIsAuthenticated(false);
      } else {
        setIsAuthenticated(false);
      }

      setChecking(false);
    };

    checkAuth();
  }, []);

  // Show loading while checking auth
  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-emerald-950/40 to-gray-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  useEffect(() => {
    db.init();
  }, []);

  return (
    <HashRouter>
      <Toaster richColors position="top-center" />
      <Routes>
        {/* Login route - outside MainLayout */}
        <Route path="/login" element={<LazyPage><Login /></LazyPage>} />

        {/* Protected routes - inside MainLayout */}
        <Route path="/*" element={
          <RequireAuth>
            <MainLayout>
              <Routes>
                <Route path="/" element={<LazyPage><Dashboard /></LazyPage>} />
                <Route path="/clients" element={<LazyPage><Clients /></LazyPage>} />
                <Route path="/sessions" element={<LazyPage><Sessions /></LazyPage>} />
                <Route path="/gallery" element={<LazyPage><Gallery /></LazyPage>} />
                <Route path="/medical-questionnaire" element={<LazyPage><MedicalQuestionnaire /></LazyPage>} />
                <Route path="/trichologist-analysis" element={<LazyPage><TrichologistAnalysis /></LazyPage>} />
                <Route path="/ai-analysis" element={<LazyPage><AIAnalysis /></LazyPage>} />
                <Route path="/offline-analysis" element={<LazyPage><OfflineAnalysis /></LazyPage>} />
                <Route path="/local-learning" element={<LazyPage><LocalLearning /></LazyPage>} />
                <Route path="/settings" element={<LazyPage><Settings /></LazyPage>} />
                <Route path="/profile" element={<LazyPage><Profile /></LazyPage>} />
                <Route path="/about" element={<LazyPage><About /></LazyPage>} />
              </Routes>
            </MainLayout>
          </RequireAuth>
        } />
      </Routes>
    </HashRouter>
  );
}

export default App;
