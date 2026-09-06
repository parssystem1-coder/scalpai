// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import AutoLock from "./components/AutoLock.js";

function renderLock(minutes: number, onLock: () => void) {
  return render(<AutoLock minutes={minutes} onLock={onLock} />);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("auto-lock (§13)", () => {
  it("fires once after the idle window", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(10, onLock);
    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("does not fire while the user is active", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(10, onLock);
    for (let i = 0; i < 12; i++) {
      act(() => {
        window.dispatchEvent(new Event("mousemove"));
        vi.advanceTimersByTime(60_000); // 1 min of activity each — never idle 10
      });
    }
    expect(onLock).not.toHaveBeenCalled();
  });

  it("re-arms after firing (second idle window triggers again)", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(10, onLock);
    act(() => {
      vi.advanceTimersByTime(10 * 60_000 + 1);
    });
    act(() => {
      window.dispatchEvent(new Event("keydown"));
      vi.advanceTimersByTime(10 * 60_000 + 1);
    });
    expect(onLock).toHaveBeenCalledTimes(2);
  });
});
