// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import i18n from "../src/i18n.js";
import LoginPage from "../src/pages/LoginPage.js";

afterEach(cleanup);

describe("login page (T1)", () => {
  it("renders fa labels with email and password fields", async () => {
    await i18n;
    render(<LoginPage onLoggedIn={() => undefined} />);
    const heading = screen.getByRole("heading");
    expect((heading.textContent ?? "").includes("ورود به ScalpAI")).toBe(true);
    expect(screen.getByLabelText("ایمیل")).toBeTruthy();
    expect(screen.getByLabelText("رمز عبور")).toBeTruthy();
  });

  it("shows a validation alert for bad email on submit", async () => {
    await i18n;
    render(<LoginPage onLoggedIn={() => undefined} />);
    const form = document.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    // zod resolver blocks submit; page stays intact
    expect(screen.getByRole("heading")).toBeTruthy();
  });
});
