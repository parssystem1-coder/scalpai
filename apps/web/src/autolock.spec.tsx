// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import AutoLock from "./components/AutoLock.js";

function renderLock(seconds: number, onLock: () => void) {
  return render(<AutoLock seconds={seconds} onLock={onLock} />);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("auto-lock (§13)", () => {
  it("fires once after the idle window (seconds contract)", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(600, onLock);
    act(() => {
      vi.advanceTimersByTime(600_000 + 1);
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it("does not fire while the user is active", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(600, onLock);
    for (let i = 0; i < 12; i++) {
      act(() => {
        window.dispatchEvent(new Event("mousemove"));
        vi.advanceTimersByTime(60_000); // 1 min of activity each — never idle 600s
      });
    }
    expect(onLock).not.toHaveBeenCalled();
  });

  it("re-arms after firing (second idle window triggers again)", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(600, onLock);
    act(() => {
      vi.advanceTimersByTime(600_000 + 1);
    });
    act(() => {
      window.dispatchEvent(new Event("keydown"));
      vi.advanceTimersByTime(600_000 + 1);
    });
    expect(onLock).toHaveBeenCalledTimes(2);
  });

  it("honours a shortened window passed via seconds", () => {
    vi.useFakeTimers();
    const onLock = vi.fn();
    renderLock(3, onLock);
    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(onLock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});
