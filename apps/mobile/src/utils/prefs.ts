import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "space-conquistador/prefs-v1";

export type Prefs = { sound: boolean; haptics: boolean };

/** In-memory copy so sound/haptics checks are synchronous. */
export const prefs: Prefs = { sound: true, haptics: true };

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) Object.assign(prefs, JSON.parse(raw));
  } catch {
    // defaults are fine
  }
  return { ...prefs };
}

export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): Promise<void> {
  prefs[key] = value;
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
