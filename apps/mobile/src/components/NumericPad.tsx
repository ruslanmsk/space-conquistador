import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { haptics } from "../utils/haptics";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "−", "0", ","];
const MAX_LEN = 9;

export function applyKey(value: string, key: string): string {
  if (key === "⌫") return value.slice(0, -1);
  if (key === "−") return value.startsWith("−") ? value.slice(1) : `−${value}`;
  if (key === ",") return value.includes(",") ? value : `${value || "0"},`;
  if (value.replace("−", "").length >= MAX_LEN) return value;
  if (value === "0") return key;
  if (value === "−0") return `−${key}`;
  return value + key;
}

export function parseNumeric(value: string): number | null {
  const n = Number(value.replace("−", "-").replace(",", "."));
  return value && value !== "−" && Number.isFinite(n) ? n : null;
}

export function NumericPad({ value, onChange, onSubmit, disabled }: Props) {
  useEffect(() => {
    if (Platform.OS !== "web" || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) onChange(applyKey(value, e.key));
      else if (e.key === "Backspace") onChange(applyKey(value, "⌫"));
      else if (e.key === "-") onChange(applyKey(value, "−"));
      else if (e.key === "," || e.key === ".") onChange(applyKey(value, ","));
      else if (e.key === "Enter") onSubmit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit, disabled]);

  const press = (k: string) => {
    haptics.tap();
    onChange(applyKey(value, k));
  };

  return (
    <View style={[styles.grid, disabled && { opacity: 0.45 }]} pointerEvents={disabled ? "none" : "auto"}>
      {KEYS.map((k) => (
        <Pressable key={k} accessibilityRole="button" onPress={() => press(k)} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
          <Text style={styles.keyText}>{k}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Стереть" onPress={() => press("⌫")} style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}>
        <Text style={styles.keyText}>⌫</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptics.impact();
          onSubmit();
        }}
        disabled={parseNumeric(value) === null}
        style={({ pressed }) => [
          styles.key,
          styles.submit,
          pressed && { opacity: 0.85 },
          parseNumeric(value) === null && { opacity: 0.4 },
        ]}
      >
        <Text style={styles.submitText}>Ответить</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" },
  key: {
    width: "31.5%",
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  keyPressed: { backgroundColor: colors.cardPressed },
  keyText: { color: colors.text, fontSize: 22, fontWeight: "600" },
  submit: { width: "65.5%", backgroundColor: colors.accent, borderColor: colors.accent },
  submitText: { color: "#1a1300", fontSize: 18, fontWeight: "800" },
});
