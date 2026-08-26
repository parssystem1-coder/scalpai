import { useEffect, useRef } from "react";

const EVENTS = ["mousemove", "keydown", "wheel", "touchstart", "click"] as const;

/**
 * Auto-lock (DESIGN §13 / playbook 2.5): after `minutes` of no user activity
 * the callback fires (caller drops the in-memory token and returns to login).
 * Renders nothing; activity listeners are passive.
 */
export default function AutoLock({
  minutes = 10,
  onLock,
}: {
  minutes?: number;
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
      }, minutes * 60_000);
    };
    reset();
    for (const ev of EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const ev of EVENTS) window.removeEventListener(ev, reset);
    };
  }, [minutes]);

  return null;
}
