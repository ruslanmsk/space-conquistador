import AsyncStorage from "@react-native-async-storage/async-storage";
import { OPPONENTS, type MatchState } from "@space-conquistador/game-core";

const KEY = "space-conquistador/progress-v1";

export type CategoryStat = { asked: number; correct: number };

export type Progress = {
  wins: number;
  losses: number;
  draws: number;
  /** Best stars per opponent id (0–3). */
  stars: Record<string, number>;
  categories: Record<string, CategoryStat>;
  bestStreak: number;
  questions: number;
  correct: number;
};

const EMPTY: Progress = {
  wins: 0,
  losses: 0,
  draws: 0,
  stars: {},
  categories: {},
  bestStreak: 0,
  questions: 0,
  correct: 0,
};

let cache: Progress | null = null;

export async function loadProgress(): Promise<Progress> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    cache = { ...EMPTY };
  }
  return cache!;
}

async function save(p: Progress) {
  cache = p;
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
}

/** An opponent is open if it is the first one or the previous one has been beaten. */
export function isUnlocked(p: Progress, index: number): boolean {
  if (index === 0) return true;
  const prev = OPPONENTS[index - 1];
  return !!prev && (p.stars[prev.id] ?? 0) > 0;
}

/** First opponent not yet beaten (or the last one). */
export function nextOpponentIndex(p: Progress): number {
  const i = OPPONENTS.findIndex((o) => !(p.stars[o.id] ?? 0));
  return i === -1 ? OPPONENTS.length - 1 : i;
}

/** ★ win, ★★ win with all capital shields intact, ★★★ win by taking the enemy capital. */
export function starsFor(state: MatchState): number {
  if (state.winner !== "human") return 0;
  if (state.endReason === "capital") return 3;
  return state.shields.human === state.config.capitalShields ? 2 : 1;
}

export async function recordAnswer(category: string, correct: boolean): Promise<void> {
  const p = await loadProgress();
  const c = p.categories[category] ?? { asked: 0, correct: 0 };
  await save({
    ...p,
    questions: p.questions + 1,
    correct: p.correct + (correct ? 1 : 0),
    categories: { ...p.categories, [category]: { asked: c.asked + 1, correct: c.correct + (correct ? 1 : 0) } },
  });
}

export async function recordMatch(state: MatchState): Promise<Progress> {
  const p = await loadProgress();
  const id = state.config.opponent.id;
  const stars = Math.max(p.stars[id] ?? 0, starsFor(state));
  const next: Progress = {
    ...p,
    wins: p.wins + (state.winner === "human" ? 1 : 0),
    losses: p.losses + (state.winner === "bot" ? 1 : 0),
    draws: p.draws + (state.winner === "draw" ? 1 : 0),
    stars: { ...p.stars, [id]: stars },
    bestStreak: Math.max(p.bestStreak, state.tally.human.bestStreak),
  };
  await save(next);
  return next;
}
