import React from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import AutoLock from "./AutoLock.js";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/** Idle window before the session locks (DESIGN §13 / playbook 2.5). */
export const AUTO_LOCK_MINUTES = 10;

/**
 * Env override for the idle window, in WHOLE SECONDS — e2e-only escape hatch so
 * a real-browser test can live through an actual idle lock instead of faking
 * the clock (page.clock fast-forward crashed the real page under the dev
 * server). Vite only exposes VITE_* to the client and the app build never sets
 * it, so production keeps the full §13 window of AUTO_LOCK_MINUTES.
 */
export const AUTO_LOCK_SECONDS = (() => {
  const raw = Number(import.meta.env.VITE_AUTO_LOCK_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : AUTO_LOCK_MINUTES * 60;
})();

/**
 * WEAKNESSES P4-B08 / remediation F14: the idle auto-lock is mounted HERE, at
 * the single choke point every protected route passes through, not per page.
 * A route added tomorrow inherits the lock by construction — the exact gap
 * InboxPage shipped with when each page had to wire it by hand.
 *
 * On lock: drop the in-memory token, run the full `logout()` (which also wipes
 * the offline scope, WEAKNESSES H8) and go to /login with `replace: true` so
 * the protected screen is not reachable through back/forward history.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLock = () => {
    logout();
    void navigate("/login", { replace: true, state: { from: location } });
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <>
      <AutoLock seconds={AUTO_LOCK_SECONDS} onLock={handleLock} />
      {children}
    </>
  );
};

export default ProtectedRoute;
