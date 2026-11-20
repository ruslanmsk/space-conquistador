import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { loadProgress, type Progress } from "../storage/progress";

/** Reloads saved progress every time the screen gains focus. */
export function useProgressData(): Progress | null {
  const [p, setP] = useState<Progress | null>(null);
  useFocusEffect(
    useCallback(() => {
      void loadProgress().then((x) => setP({ ...x }));
    }, []),
  );
  return p;
}

/** Percentage of correct answers in a category, or null if too few to say. */
export function categoryRate(p: Progress, category: string): number | null {
  const c = p.categories[category];
  if (!c || c.asked < 2) return null;
  return Math.round((c.correct / c.asked) * 100);
}
