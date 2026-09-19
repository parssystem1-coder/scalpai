import { useEffect, useRef } from "react";

const EVENTS = ["mousemove", "keydown", "wheel", "touchstart", "click"] as const;

/**
 * Auto-lock (DESIGN §13 / playbook 2 L3a): after the idle window elapses with
 * no user activity the callback fires once (caller drops the in-memory token
 * and returns to /login). Renders nothing; activity listeners are passive.
 *
 * The window is in SECONDS so the e2e suite can live through a real lock
 * without faking the browser clock (clock fast-forward crashed the real page
 * under the dev server). The primary wiring passes AUTO_LOCK_SECONDS; 600s is
 * the §13 default.
 */
export default function AutoLock({
  seconds = 600,
  onLock,
}: {
  seconds?: number;
  onLock: () => void;
}) {
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef(onLock);
  cbRef.current = onLock;

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      firedRef.current = false;
      timerRef.current = setTimeout(() => {
        if (!firedRef.current) {
          firedRef.current = true;
          cbRef.current();
        }
      }, seconds * 1_000);
    };
    reset();
    for (const ev of EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of EVENTS) window.removeEventListener(ev, reset);
    };
  }, [seconds]);

  return null;
}
