/** Minimal API client — access token lives in memory only (never localStorage). */

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

let accessToken: string | null = null;

export function setAccessToken(token: string): void {
  accessToken = token;
}

export function clearAccessToken(): void {
  accessToken = null;
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
