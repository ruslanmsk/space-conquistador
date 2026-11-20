import { useEffect, useRef, useState } from "react";

/** Milliseconds left until `startedAt + durationMs`; calls `onExpire` once when it hits zero. */
export function useCountdown(startedAt: number, durationMs: number, active: boolean, onExpire: () => void) {
  const [now, setNow] = useState(() => Date.now());
  const expireRef = useRef(onExpire);
  expireRef.current = onExpire;

  useEffect(() => {
    if (!active) return;
    let fired = false;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (!fired && t >= startedAt + durationMs) {
        fired = true;
        expireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [startedAt, durationMs, active]);

  return Math.max(0, startedAt + durationMs - now);
}
