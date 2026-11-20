import Constants from "expo-constants";
import { Platform } from "react-native";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Game server base URL. `EXPO_PUBLIC_SERVER_URL` wins; otherwise localhost:3001 in development,
 * or — on the web, when the page is served from another host (a LAN IP, a deployed site) — the
 * same host on port 3001.
 */
export function serverUrl(): string {
  const env = process.env.EXPO_PUBLIC_SERVER_URL;
  if (env) return env.replace(/\/+$/, "");
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (!LOCAL_HOSTS.includes(hostname)) return `${protocol}//${hostname}:3001`;
  }
  return "http://localhost:3001";
}

/**
 * Online play is offered in dev builds, or in release builds that were given a server address.
 * (The public web build has no server yet — hide the entry instead of showing "server unavailable".)
 */
export const onlineEnabled = __DEV__ || !!process.env.EXPO_PUBLIC_SERVER_URL;

/** Invite link that opens the waiting room: `<origin>/room/CODE` on the web, the app scheme natively. */
export function inviteLink(code: string): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const base = (Constants.expoConfig?.experiments?.baseUrl ?? "").replace(/\/+$/, "");
    return `${window.location.origin}${base}/room/${code}`;
  }
  const scheme = Constants.expoConfig?.scheme;
  return `${Array.isArray(scheme) ? scheme[0] : (scheme ?? "spaceconquistador")}://room/${code}`;
}
