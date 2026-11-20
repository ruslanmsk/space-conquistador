import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { fonts } from "../theme/type";
import { haptics } from "../utils/haptics";
import { Slab } from "./Slab";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
const MAX_LEN = 9;

export function applyKey(value: string, key: string): string {
  if (key === "⌫") return value.slice(0, -1);
  if (value.length >= MAX_LEN) return value;
  if (value === "0") return key;
  return value + key;
}

export function parseNumeric(value: string): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) ? n : null;
}

/** Whole non-negative numbers only: all numeric answers in the bank are integers. */
export function NumericPad({ value, onChange, onSubmit, disabled }: Props) {
  useEffect(() => {
    if (Platform.OS !== "web" || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) onChange(applyKey(value, e.key));
      else if (e.key === "Backspace") onChange(applyKey(value, "⌫"));
      else if (e.key === "Enter") onSubmit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit, disabled]);

  const canSubmit = parseNumeric(value) !== null;

  return (
    <View style={[styles.grid, disabled && { opacity: 0.45 }]} pointerEvents={disabled ? "none" : "auto"}>
      {KEYS.map((k) => {
        const ok = k === "OK";
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityLabel={k === "⌫" ? "Стереть" : ok ? "Ответить" : k}
            disabled={ok && !canSubmit}
            onPress={() => {
              if (ok) {
                haptics.impact();
                onSubmit();
              } else {
                haptics.tap();
                onChange(applyKey(value, k));
              }
            }}
            style={[styles.cell, ok && !canSubmit && { opacity: 0.4 }]}
          >
            {({ pressed }) => (
              <Slab
                pressed={pressed}
                depth={3}
                radius={5}
                color={ok ? colors.human : colors.raisedHi}
                shadow={ok ? colors.humanDeep : colors.bgDeep}
              >
                <View style={styles.key}>
                  <Text style={[styles.keyText, ok && { color: colors.humanInk, fontSize: 16 }]}>
                    {ok ? "ГОТОВО" : k}
                  </Text>
                </View>
              </Slab>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 6, justifyContent: "space-between" },
  cell: { width: "32.4%" },
  key: { height: 46, alignItems: "center", justifyContent: "center" },
  keyText: { fontFamily: fonts.displayBold, color: colors.text, fontSize: 20 },
});
