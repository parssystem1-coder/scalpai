// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import DialogPrimitive from "./DialogPrimitive";

function DialogTest({ onClose }: { onClose: () => void }) {
  return (
    <DialogPrimitive isOpen={true} onClose={onClose} aria-label="Test dialog">
      <button type="button">First</button>
      <button type="button">Second</button>
      <button type="button">Last</button>
    </DialogPrimitive>
  );
}

describe("DialogPrimitive", () => {
  afterEach(() => cleanup());
  it("renders dialog with role and aria-modal", () => {
    render(<DialogTest onClose={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Test dialog");
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(<DialogTest onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(<DialogTest onClose={onClose} />);
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it("traps focus with Tab", () => {
    render(<DialogTest onClose={() => {}} />);
    const buttons = screen.getAllByRole("button");
    buttons[2].focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("traps focus with Shift+Tab", () => {
    render(<DialogTest onClose={() => {}} />);
    const buttons = screen.getAllByRole("button");
    buttons[0].focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[2]);
  });

  it("does not close on backdrop child click", () => {
    const onClose = vi.fn();
    render(<DialogTest onClose={onClose} />);
    fireEvent.click(screen.getByText("First"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
