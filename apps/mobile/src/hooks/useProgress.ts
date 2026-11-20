import { useEffect, useRef, useState } from "react";

/**
 * Animation progress 0..1 driven by requestAnimationFrame (~30 fps). Only the component using it
 * re-renders, and it behaves the same on native and web (Animated SVG props are flaky on web).
 */
export function useProgress(durationMs: number, loop: boolean, onDone?: () => void) {
  const [t, setT] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const start = Date.now();
    let last = 0;
    let raf = 0;
    const frame = () => {
      const now = Date.now();
      const p = (now - start) / durationMs;
      if (!loop && p >= 1) {
        setT(1);
        done.current?.();
        return;
      }
      if (now - last > 33) {
        last = now;
        setT(loop ? p % 1 : p);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, loop]);
  return t;
}
