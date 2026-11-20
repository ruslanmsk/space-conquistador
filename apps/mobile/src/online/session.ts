import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GuestSession } from "@space-conquistador/protocol";

const KEY = "space-conquistador/guest-v1";

export async function loadSession(): Promise<GuestSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as GuestSession) : null;
    return s?.token && s.player?.nickname ? s : null;
  } catch {
    return null;
  }
}

export async function saveSession(s: GuestSession | null): Promise<void> {
  if (s) await AsyncStorage.setItem(KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(KEY);
}
