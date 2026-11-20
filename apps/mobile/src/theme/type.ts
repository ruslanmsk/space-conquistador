import type { TextStyle } from "react-native";
import { colors } from "./colors";

export const fonts = {
  display: "Unbounded_800ExtraBold",
  displayBold: "Unbounded_700Bold",
  displayMedium: "Unbounded_500Medium",
  body: "Onest_500Medium",
  bodyRegular: "Onest_400Regular",
  bodySemi: "Onest_600SemiBold",
  bodyBold: "Onest_700Bold",
};

export const type = {
  display: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 28, color: colors.text, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.displayBold, fontSize: 16, lineHeight: 22, color: colors.text },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  question: { fontFamily: fonts.bodyBold, fontSize: 21, lineHeight: 28, color: colors.text },
  num: { fontFamily: fonts.displayBold, color: colors.text, fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;
