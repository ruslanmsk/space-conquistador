import { getScores, type MatchState } from "@space-conquistador/game-core";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";
import { haptics } from "../utils/haptics";
import { Button } from "./Button";

type Props = { state: MatchState; onRematch: () => void; onMenu: () => void };

export function ResultPanel({ state, onRematch, onMenu }: Props) {
  const scores = getScores(state);
  const win = state.winner === "human";
  const draw = state.winner === "draw";

  useEffect(() => {
    if (win) {
      haptics.success();
      setTimeout(haptics.heavy, 250);
    } else if (!draw) haptics.error();
  }, [win, draw]);

  const title = win ? "Победа!" : draw ? "Ничья" : "Поражение";
  const color = win ? colors.accent : draw ? colors.text : colors.bot;
  const reason =
    state.endReason === "capital"
      ? win
        ? "Вражеская столица пала — система ваша"
        : "Бот захватил вашу столицу"
      : "Итог по очкам после всех битв";

  return (
    <View style={styles.card}>
      <Text style={styles.emoji}>{win ? "🏆" : draw ? "🤝" : "🛰️"}</Text>
      <Text style={[styles.title, { color }]}>{title}</Text>
      <Text style={styles.reason}>{reason}</Text>
      <View style={styles.scores}>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Вы</Text>
          <Text style={[styles.score, { color: colors.human }]}>{scores.human}</Text>
        </View>
        <Text style={styles.vs}>:</Text>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Бот</Text>
          <Text style={[styles.score, { color: colors.bot }]}>{scores.bot}</Text>
        </View>
      </View>
      <Button title="Реванш" onPress={onRematch} style={styles.btn} />
      <Button title="В меню" variant="secondary" onPress={onMenu} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panelSolid,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: "center",
    gap: 6,
    width: "100%",
    maxWidth: 420,
  },
  emoji: { fontSize: 52 },
  title: { fontSize: 36, fontWeight: "900", letterSpacing: 0.5 },
  reason: { color: colors.muted, fontSize: 14, textAlign: "center" },
  scores: { flexDirection: "row", alignItems: "center", gap: 18, marginVertical: 14 },
  scoreBox: { alignItems: "center" },
  scoreLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 },
  score: { fontSize: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },
  vs: { color: colors.dim, fontSize: 28, fontWeight: "800" },
  btn: { alignSelf: "stretch", marginTop: 6 },
});
