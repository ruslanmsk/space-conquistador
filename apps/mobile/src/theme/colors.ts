import { Platform } from "react-native";

export const colors = {
  bg: "#05060f",
  bgTop: "#0b1030",
  panel: "rgba(14, 18, 42, 0.96)",
  panelSolid: "#0e122a",
  card: "#151a3a",
  cardPressed: "#1d2450",
  border: "#262d5c",
  text: "#eef0ff",
  muted: "#8c93c4",
  dim: "#555c8c",
  human: "#3fb2ff",
  humanDeep: "#14507e",
  bot: "#ff4f6d",
  botDeep: "#7a1a2c",
  neutral: "#4a5182",
  accent: "#ffcc4d",
  success: "#3ddc97",
  danger: "#ff4f6d",
  overlay: "rgba(3, 4, 12, 0.72)",
};

export const playerColor = (p: "human" | "bot" | null | undefined) =>
  p === "human" ? colors.human : p === "bot" ? colors.bot : colors.neutral;

/** Font family for SVG text: RN-web otherwise falls back to a serif font inside <svg>. */
export const svgFont = Platform.select({
  web: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  default: undefined,
});
