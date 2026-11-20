import { Platform } from "react-native";

/**
 * "Космоплакат": a 1960s print-poster look. Deep ink map, cream paper cards, vermilion (you)
 * vs cobalt (opponent) — distinguishable for colour-blind players, and always paired with a
 * second cue (pattern or glyph). Gold means "correct". No glass, no gradients in UI chrome.
 */
export const colors = {
  bg: "#121829",
  bgDeep: "#0B1020",
  raised: "#1A2238",
  raisedHi: "#222C47",
  sunken: "#0E1424",
  line: "#2A3554",
  lineHi: "#3E4B73",
  text: "#F1E6D0",
  muted: "#A9A9B8",
  dim: "#6A7192",
  // cream "paper" for the question card, with ink text on it
  paper: "#F1E6D0",
  paperDeep: "#D9C9A8",
  paperLine: "#CDBB98",
  ink: "#151B2E",
  inkMuted: "#5B5A66",
  human: "#E8552D",
  humanDeep: "#8E2C12",
  humanInk: "#FFF3E8",
  humanSoft: "rgba(232, 85, 45, 0.16)",
  bot: "#3D8FD9",
  botDeep: "#1B4D80",
  botInk: "#F0F7FF",
  botSoft: "rgba(61, 143, 217, 0.16)",
  neutral: "#56618A",
  gold: "#F4B63F",
  goldDeep: "#A8741A",
  correct: "#F4B63F",
  correctDeep: "#A8741A",
  wrong: "#E8552D",
  star: "#FFE6A8",
  overlay: "rgba(8, 11, 22, 0.82)",
  // legacy aliases used by older components
  panel: "#1A2238",
  panelSolid: "#1A2238",
  card: "#222C47",
  cardPressed: "#2A3555",
  border: "#2A3554",
  accent: "#F4B63F",
  success: "#F4B63F",
  danger: "#E8552D",
};

export type PlayerKey = "human" | "bot";

export const playerColor = (p: PlayerKey | null | undefined) =>
  p === "human" ? colors.human : p === "bot" ? colors.bot : colors.neutral;

export const playerDeep = (p: PlayerKey | null | undefined) =>
  p === "human" ? colors.humanDeep : p === "bot" ? colors.botDeep : colors.line;

export const playerInk = (p: PlayerKey | null | undefined) =>
  p === "human" ? colors.humanInk : p === "bot" ? colors.botInk : colors.text;

export const playerSoft = (p: PlayerKey | null | undefined) =>
  p === "human" ? colors.humanSoft : p === "bot" ? colors.botSoft : "transparent";

/** Font family for SVG text on web (RN-web otherwise falls back to a serif font inside <svg>). */
export const svgFont = Platform.select({
  web: "Onest_700Bold, system-ui, sans-serif",
  default: "Onest_700Bold",
});
