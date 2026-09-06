import React, { createContext, useContext, useState } from "react";
import { getAccessToken, setAccessToken, clearAccessToken } from "../api/client.js";

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
  setDemoUser: (email?: string, name?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "scalpai_user";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => getAccessToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem(USER_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      }
      if (typeof localStorage !== "undefined") {
        const stored = localStorage.getItem(USER_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
      }
    } catch {
      // ignore
    }
    // Default active clinician profile for seamless onboarding
    return {
      email: "tricho@scalpai.clinic",
      name: "دکتر مریم رضایی",
      role: "trichologist",
      clinicId: "clinic-a",
    };
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
      if (remember && typeof localStorage !== "undefined") {
        localStorage.setItem(USER_STORAGE_KEY, serialized);
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
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  };

  const setDemoUser = (email = "tricho@scalpai.clinic", name = "دکتر مریم رضایی") => {
    const demoUser: AuthUser = {
      email,
      name,
      role: "trichologist",
      clinicId: "clinic-a",
    };
    setUser(demoUser);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(demoUser));
      }
    } catch {
      // ignore
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        login,
        logout,
        setDemoUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: {
        email: "tricho@scalpai.clinic",
        name: "دکتر مریم رضایی",
        role: "trichologist",
        clinicId: "clinic-a",
      },
      token: null,
      isAuthenticated: true,
      login: () => {},
      logout: () => {},
      setDemoUser: () => {},
    };
  }
  return ctx;
};
