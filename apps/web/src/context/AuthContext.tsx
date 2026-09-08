import React, { createContext, useContext, useState } from "react";
import { getAccessToken, setAccessToken, clearAccessToken } from "../api/client.js";
import { closeOfflineScope, purgeLegacyOfflineDb } from "../offline/db.js";

export interface AuthUser {
  email: string;
  name?: string;
  role?: string;
  clinicId?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser, remember?: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "scalpai_user";

/**
 * M19: `return JSON.parse(stored)` handed an `any` straight back out of the
 * state initialiser (no-unsafe-return). The stored blob is untrusted input — a
 * previous version of the app, or a tampered tab — so it is parsed as unknown
 * and only accepted when it really looks like an AuthUser. Anything else means
 * "not signed in", which is the safe direction for a clinical terminal.
 */
function restoreUser(stored: string): AuthUser | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as { email?: unknown; name?: unknown; role?: unknown; clinicId?: unknown };
  if (typeof candidate.email !== "string") return null;
  return {
    email: candidate.email,
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    ...(typeof candidate.role === "string" ? { role: candidate.role } : {}),
    ...(typeof candidate.clinicId === "string" ? { clinicId: candidate.clinicId } : {}),
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem(USER_STORAGE_KEY);
        if (stored) return restoreUser(stored);
      }
    } catch {
      // ignore
    }
    return null;
  });

  const login = (newToken: string, newUser: AuthUser, remember = false) => {
    setAccessToken(newToken, remember);
    setToken(newToken);
    setUser(newUser);
    try {
      const serialized = JSON.stringify(newUser);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(USER_STORAGE_KEY, serialized);
      }
    } catch {
      // ignore
    }
  };

  const logout = () => {
    clearAccessToken();
    setToken(null);
    setUser(null);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    // WEAKNESSES H8: the offline database is per clinic+user and must not survive
    // a logout — the next person at this terminal is a different clinician.
    // Both helpers swallow their own errors, so a logout can never fail on this.
    void closeOfflineScope({ wipe: true });
    void purgeLegacyOfflineDb();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
