import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BotLevel } from "@space-conquistador/game-core";

const ONBOARDING_KEY = "space-conquistador/onboarding-v2";
const LEVEL_KEY = "space-conquistador/bot-level";
const STATS_KEY = "space-conquistador/stats-v1";

export type Stats = { wins: number; losses: number; draws: number };

export async function hasSeenRules(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_KEY)) === "1";
}

export async function markRulesSeen(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "1");
}

export async function loadLevel(): Promise<BotLevel> {
  const v = await AsyncStorage.getItem(LEVEL_KEY);
  return v === "easy" || v === "hard" ? v : "normal";
}

export async function saveLevel(level: BotLevel): Promise<void> {
  await AsyncStorage.setItem(LEVEL_KEY, level);
}

export async function loadStats(): Promise<Stats> {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    if (raw) return { wins: 0, losses: 0, draws: 0, ...JSON.parse(raw) };
  } catch {
    // corrupted stats are not worth surfacing
  }
  return { wins: 0, losses: 0, draws: 0 };
}

export async function recordResult(result: "win" | "loss" | "draw"): Promise<Stats> {
  const s = await loadStats();
  const next: Stats = {
    wins: s.wins + (result === "win" ? 1 : 0),
    losses: s.losses + (result === "loss" ? 1 : 0),
    draws: s.draws + (result === "draw" ? 1 : 0),
  };
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(next));
  return next;
}
