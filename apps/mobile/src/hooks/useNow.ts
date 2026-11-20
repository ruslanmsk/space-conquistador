import { useEffect, useState } from "react";

/** Date.now(), refreshed every `everyMs` while `active`. */
export function useNow(active = true, everyMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs]);
  return now;
}

/** Whole seconds left until `until` (null when there is no deadline). */
export function useSecondsLeft(until: number | null | undefined): number | null {
  const now = useNow(!!until);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : null;
}
