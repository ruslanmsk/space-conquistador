import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { sound } from "../utils/sound";
import { Slab } from "./Slab";

type Variant = "primary" | "secondary" | "paper" | "ghost" | "danger";

type Props = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  /** Small line under the title. */
  caption?: string;
  icon?: ReactNode;
  size?: "md" | "lg";
  style?: StyleProp<ViewStyle>;
};

const LOOK: Record<Exclude<Variant, "ghost">, { face: string; shadow: string; text: string }> = {
  primary: { face: colors.human, shadow: colors.humanDeep, text: colors.humanInk },
  secondary: { face: colors.raisedHi, shadow: colors.bgDeep, text: colors.text },
  paper: { face: colors.paper, shadow: colors.paperDeep, text: colors.ink },
  danger: { face: colors.raised, shadow: colors.humanDeep, text: colors.human },
};

export function Button({ title, onPress, variant = "primary", disabled, caption, icon, size = "lg", style }: Props) {
  const press = () => {
    haptics.tap();
    sound.play("tap");
    onPress();
  };

  if (variant === "ghost") {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={press}
        hitSlop={8}
        style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.6 }, disabled && styles.disabled, style]}
      >
        {icon}
        <Text style={styles.ghostText}>{title}</Text>
      </Pressable>
    );
  }

  const look = LOOK[variant];
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={press} style={[disabled && styles.disabled, style]}>
      {({ pressed }) => (
        <Slab color={look.face} shadow={look.shadow} pressed={pressed} depth={size === "lg" ? 5 : 4}>
          <View style={[styles.face, size === "md" && styles.faceMd]}>
            {icon}
            <View style={{ alignItems: icon ? "flex-start" : "center", flexShrink: 1 }}>
              <Text style={[styles.text, size === "md" && styles.textMd, { color: look.text }]}>{title}</Text>
              {caption ? <Text style={[styles.caption, { color: look.text }]}>{caption}</Text> : null}
            </View>
          </View>
        </Slab>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  face: {
    minHeight: 58,
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  faceMd: { minHeight: 48, paddingHorizontal: 16 },
  text: { fontFamily: fonts.displayBold, fontSize: 16, letterSpacing: 0.2, textTransform: "uppercase" },
  textMd: { fontSize: 14 },
  caption: { fontFamily: fonts.body, fontSize: 12, opacity: 0.8, marginTop: 2 },
  ghost: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  ghostText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.muted },
  disabled: { opacity: 0.45 },
});
