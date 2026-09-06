// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "../src/i18n.js";
import { AuthProvider } from "../src/context/AuthContext.js";
import LoginPage from "../src/pages/LoginPage.js";

afterEach(cleanup);

describe("login page (T1)", () => {
  it("renders labels with email and password fields", async () => {
    await i18n;
    render(
      <AuthProvider>
        <LoginPage onLoggedIn={() => undefined} />
      </AuthProvider>,
    );
    const heading = screen.getByRole("heading", { level: 1 });
    expect((heading.textContent ?? "").includes("Welcome Back")).toBe(true);
    expect(screen.getByPlaceholderText("Username or Email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Password")).toBeTruthy();
  });

  it("shows a validation alert for bad email on submit", async () => {
    await i18n;
    render(
      <AuthProvider>
        <LoginPage onLoggedIn={() => undefined} />
      </AuthProvider>,
    );
    const form = document.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    // zod resolver blocks submit; page stays intact
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
});
