import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MatchState } from "@space-conquistador/game-core";

const KEY = "space-conquistador/match-v4";

export async function saveMatchState(state: MatchState | null): Promise<void> {
  if (!state || state.phase === "finished") {
    await AsyncStorage.removeItem(KEY);
    return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

export async function loadMatchState(): Promise<MatchState | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MatchState;
    if (parsed.version !== 4 || parsed.phase === "finished") throw new Error("stale save");
    return parsed;
  } catch {
    await AsyncStorage.removeItem(KEY);
    return null;
  }
}
