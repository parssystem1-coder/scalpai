// @vitest-environment jsdom
//
// Wave 4 - a11y-dialog gate (C9 acceptance, F07/F21 successors).
//
// The primitive's behaviour is tested on the REAL DialogPrimitive: open, focus
// lands inside, Tab from the last focusable wraps to the first, Shift+Tab from
// the first wraps to the last, Escape closes, focus returns to the trigger.
// The adoption contract is structural in the direction a grep is honest for:
// every *Modal.tsx file must LIVE in components/modals/ (none left in the
// components root) and must mount its dialog THROUGH the shared primitive -
// asserted on its import of the primitive, never on copied source behaviour.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DialogPrimitive from "../DialogPrimitive.js";

const MODALS_DIR = join(import.meta.dirname, "..");
const COMPONENTS_DIR = join(import.meta.dirname, "..", "..");

const MODAL_FILES = readdirSync(MODALS_DIR)
  .filter((f) => f.endsWith("Modal.tsx"))
  .sort();

function TrapProbe() {
  return (
    <DialogPrimitive isOpen={true} onClose={() => {}} aria-label="probe">
      <button type="button">first</button>
      <input aria-label="middle input" />
      <button type="button">last</button>
    </DialogPrimitive>
  );
}

afterEach(() => cleanup());

describe("a11y-dialog — the primitive behaviour (C9/F07)", () => {
  it("announces itself as a modal dialog with an accessible name", () => {
    render(<TrapProbe />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("probe");
  });

  it("moves focus into the dialog when it opens", async () => {
    render(<TrapProbe />);
    // The primitive focuses the first focusable in a 0ms timer.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("first")));
  });

  it("wraps Tab from the last focusable back to the first", () => {
    render(<TrapProbe />);
    screen.getByText("last").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("first"));
  });

  it("wraps Shift+Tab from the first focusable to the last", () => {
    render(<TrapProbe />);
    screen.getByText("first").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText("last"));
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <DialogPrimitive isOpen={true} onClose={onClose} aria-label="probe">
        <button type="button">first</button>
      </DialogPrimitive>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the trigger when the dialog unmounts (F07)", async () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.textContent = "trigger";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <DialogPrimitive isOpen={true} onClose={() => {}} aria-label="probe">
        <button type="button">first</button>
      </DialogPrimitive>,
    );
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe("a11y-dialog — every modal adopts the shared primitive (C9)", () => {
  it("lists the modal inventory the gate covers", () => {
    // Nine live modals use the primitive today. The floor only exists so the
    // gate goes red if the inventory walk silently matches nothing.
    expect(MODAL_FILES.length).toBeGreaterThanOrEqual(9);
  });

  it("leaves no *Modal.tsx behind in the components root", () => {
    const strays = readdirSync(COMPONENTS_DIR).filter(
      (f) => f.endsWith("Modal.tsx") || f.endsWith("Modal.ts"),
    );
    expect(strays).toEqual([]);
  });

  it.each(MODAL_FILES)("mounts through the shared primitive: %s", (file) => {
    const src = readFileSync(join(MODALS_DIR, file), "utf8");
    expect(src, `${file} must render through DialogPrimitive`).toContain('from "./DialogPrimitive"');
  });
});
