// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InboxPage } from "./InboxPage.js";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("../api/client.js", () => ({ apiFetch }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, string>) => opts?.sender ?? key, i18n: { language: "fa" } }),
}));
vi.mock("../i18n.js", () => ({ default: { addResourceBundle: vi.fn() } }));

describe("InboxPage", () => {
  it("renders messages and filters by sender hash", async () => {
    apiFetch.mockResolvedValueOnce({ items: [{ id: "m1", channel: "kavenegar", senderHash: "hash-a", bodyPreview: "hello", receivedAt: "2026-01-01T00:00:00Z", state: "new" }] });
    render(<InboxPage />);
    expect(await screen.findByText("hash-a")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("inbox.searchLabel"), { target: { value: "missing" } });
    await waitFor(() => expect(screen.queryByText("hash-a")).toBeNull());
  });

  it("loads the protected body after selecting a message", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.includes("/body")) return { body: "full body" };
      return { items: [{ id: "m2", channel: "kavenegar", senderHash: "hash-b", bodyPreview: "preview", receivedAt: "2026-01-01T00:00:00Z" }] };
    });
    render(<InboxPage />);
    fireEvent.click(await screen.findByText("hash-b"));
    expect(await screen.findByText("full body")).toBeTruthy();
  });
});
