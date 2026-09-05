import { cookiesSecure } from "../common/security.config.js";

/**
 * Refresh tokens live in an HttpOnly cookie (WEAKNESSES H1) — never in
 * localStorage and never in a JSON body. Path is pinned to the auth routes so
 * the cookie is not attached to any other request the app makes.
 */

export const REFRESH_COOKIE = "scalpai_rt";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
export const REFRESH_TTL_SECONDS = 14 * 24 * 60 * 60;

export interface CookieCarrier {
  headers: Record<string, unknown>;
}

export function readRefreshCookie(req: CookieCarrier): string | null {
  const header = req.headers["cookie"];
  if (typeof header !== "string" || header.length === 0) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== REFRESH_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value.length > 0 ? decodeURIComponent(value) : null;
  }
  return null;
}

function serialize(value: string, maxAgeSeconds: number): string {
  const attrs = [
    `${REFRESH_COOKIE}=${encodeURIComponent(value)}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    "HttpOnly",
    "SameSite=Strict",
  ];
  if (cookiesSecure()) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildRefreshCookie(token: string, maxAgeSeconds = REFRESH_TTL_SECONDS): string {
  return serialize(token, maxAgeSeconds);
}

export function buildClearedRefreshCookie(): string {
  return serialize("", 0);
}
