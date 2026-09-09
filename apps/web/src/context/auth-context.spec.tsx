// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { FC } from "react";
import { AuthProvider, useAuth } from "./AuthContext.js";
import { clearAccessToken, getAccessToken, setAccessToken } from "../api/client.js";

/**
 * The identity boundary (WEAKNESSES C3).
 *
 * There used to be a demo-user fallback here: `isAuthenticated` could be true
 * with no server session at all. These tests pin the opposite - a user AND a
 * token, or signed out - and pin that the restored `scalpai_user` blob is
 * treated as untrusted input, because a previous app version or another tab can
 * write anything into it.
 */

const USER_STORAGE_KEY = "scalpai_user";

type Auth = ReturnType<typeof useAuth>;

let latest: Auth | null = null;

const Probe: FC = () => {
  const auth = useAuth();
  latest = auth;
  return <span data-testid="state">{auth.isAuthenticated ? "signed-in" : "signed-out"}</span>;
};

function mount() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

/** The context after the last render - never null once something is mounted. */
function auth(): Auth {
  if (!latest) throw new Error("nothing was rendered");
  return latest;
}

beforeEach(() => {
  latest = null;
  clearAccessToken();
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(cleanup);

describe("AuthProvider (WEAKNESSES C3)", () => {
  it("starts signed out - there is no demo user to fall back to", () => {
    const { getByTestId } = mount();
    expect(getByTestId("state").textContent).toBe("signed-out");
    expect(auth().user).toBeNull();
    expect(auth().token).toBeNull();
    expect(auth().isAuthenticated).toBe(false);
  });

  it("is authenticated only with BOTH a user and a token", () => {
    const { getByTestId } = mount();
    act(() => {
      auth().login("token-abc", { email: "owner@clinic-a.test", role: "owner", clinicId: "clinic-a" });
    });
    expect(getByTestId("state").textContent).toBe("signed-in");
    expect(auth().token).toBe("token-abc");
    expect(getAccessToken()).toBe("token-abc");
    expect(auth().user?.clinicId).toBe("clinic-a");
    expect(sessionStorage.getItem(USER_STORAGE_KEY) ?? "").toContain("owner@clinic-a.test");
  });

  it("logout drops the user, the token and the stored identity", () => {
    const { getByTestId } = mount();
    act(() => {
      auth().login("token-abc", { email: "owner@clinic-a.test" });
    });
    act(() => {
      auth().logout();
    });
    expect(getByTestId("state").textContent).toBe("signed-out");
    expect(auth().user).toBeNull();
    expect(auth().token).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(sessionStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it("refuses to hand out auth state outside the provider", () => {
    expect(() => render(<Probe />)).toThrow(/AuthProvider/);
  });
});

describe("restoring a session from sessionStorage", () => {
  it("accepts a well-formed user and keeps ONLY the known fields", () => {
    setAccessToken("token-abc");
    sessionStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({
        email: "tricho@clinic-a.test",
        name: "دکتر رضایی",
        role: "tricho",
        clinicId: "clinic-a",
        // Not part of AuthUser: a tab that writes this must not gain anything.
        isPlatformAdmin: true,
      }),
    );
    mount();
    expect(auth().isAuthenticated).toBe(true);
    expect(auth().user).toEqual({
      email: "tricho@clinic-a.test",
      name: "دکتر رضایی",
      role: "tricho",
      clinicId: "clinic-a",
    });
  });

  it("drops optional fields that are not strings", () => {
    setAccessToken("token-abc");
    sessionStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ email: "owner@clinic-a.test", name: 42, role: null, clinicId: { id: "clinic-a" } }),
    );
    mount();
    expect(auth().user).toEqual({ email: "owner@clinic-a.test" });
  });

  it("treats an unparseable blob as signed out", () => {
    setAccessToken("token-abc");
    sessionStorage.setItem(USER_STORAGE_KEY, "{not json");
    mount();
    expect(auth().user).toBeNull();
    expect(auth().isAuthenticated).toBe(false);
  });

  it("treats a non-object blob as signed out", () => {
    setAccessToken("token-abc");
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify("owner@clinic-a.test"));
    mount();
    expect(auth().user).toBeNull();
  });

  it("treats a blob without a string email as signed out", () => {
    setAccessToken("token-abc");
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ role: "owner", clinicId: "clinic-a" }));
    mount();
    expect(auth().user).toBeNull();
    expect(auth().isAuthenticated).toBe(false);
  });

  it("stays signed out when a user is stored but no token was issued", () => {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ email: "owner@clinic-a.test" }));
    mount();
    expect(auth().user?.email).toBe("owner@clinic-a.test");
    expect(auth().token).toBeNull();
    expect(auth().isAuthenticated).toBe(false);
  });
});
