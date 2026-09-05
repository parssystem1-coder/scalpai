/** Minimal API client with memory-first & secure session storage fallback */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

let accessToken: string | null = (() => {
  try {
    if (typeof sessionStorage !== "undefined") {
      const stored = sessionStorage.getItem("scalpai_access_token");
      if (stored) return stored;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem("scalpai_access_token");
    }
  } catch {
    // ignore
  }
  return null;
})();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string, remember = false): void {
  accessToken = token;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("scalpai_access_token", token);
    }
    if (remember && typeof localStorage !== "undefined") {
      localStorage.setItem("scalpai_access_token", token);
    }
  } catch {
    // Storage might be unavailable in restricted environments
  }
}

export function clearAccessToken(): void {
  accessToken = null;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("scalpai_access_token");
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem("scalpai_access_token");
    }
  } catch {
    // ignore
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      // JSON header only when a body exists — bodyless POST/DELETE otherwise 400s on Fastify.
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as { code?: string; message?: string } | null;
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? "خطای نامشخص");
  }
  return body as T;
}
